'use strict';
// Uruchamia lokalny PostgreSQL, schemat bazy, konto lokalne i serwer Next.js.
// Moduł nie zależy od Electrona, dlatego można go testować zwykłym Node.

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const IS_WIN = process.platform === 'win32';
const PG_USER = 'optyk';
const PG_DB = 'optyk_crm';
const PREFERRED_APP_PORT = 38147;
const CRON_INTERVAL_MS = 5 * 60 * 1000;

function exe(name) {
  return IS_WIN ? `${name}.exe` : name;
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class Backend {
  /**
   * @param {object} o
   * @param {string} o.resourcesDir  katalog z podkatalogami app/, tools/, pg/
   * @param {string} o.dataDir       katalog danych użytkownika (baza, config, logi)
   * @param {string} [o.pgBinDir]    nadpisanie katalogu bin PostgreSQL (testy)
   */
  constructor(o) {
    this.resourcesDir = o.resourcesDir;
    this.dataDir = o.dataDir;
    this.pgBinDir = o.pgBinDir || path.join(o.resourcesDir, 'pg', 'bin');
    this.appDir = path.join(o.resourcesDir, 'app');
    this.toolsDir = path.join(o.resourcesDir, 'tools');
    this.pgDataDir = path.join(o.dataDir, 'pgdata');
    this.logsDir = path.join(o.dataDir, 'logs');
    this.configFile = path.join(o.dataDir, 'config.json');
    this.appProc = null;
    this.cronTimer = null;
    this.pgStarted = false;
    this.config = null;
    this.pgPort = null;
    this.appPort = null;
    this.stopping = false;
  }

  // ---------- pomocnicze ----------

  log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
      fs.appendFileSync(path.join(this.logsDir, 'desktop.log'), line);
    } catch {
      /* ignoruj */
    }
    if (process.env.OPTYK_DEBUG) process.stdout.write(line);
  }

  pg(name) {
    return path.join(this.pgBinDir, exe(name));
  }

  /** Uruchamia proces i czeka na zakończenie. Rzuca błąd przy kodzie != 0. */
  run(cmd, args, opts = {}) {
    const { env, cwd, detached = false, okExitCodes = [0] } = opts;
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...env },
        windowsHide: true,
        // Dla pg_ctl start: proces potomny (postgres) dziedziczy uchwyty,
        // więc nie wolno czekać na zamknięcie rur.
        stdio: detached ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      if (!detached) {
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (out += d));
      }
      child.once('error', reject);
      child.once('exit', (code) => {
        if (okExitCodes.includes(code)) return resolve({ code, out });
        const err = new Error(`${path.basename(cmd)} zakończył się kodem ${code}\n${out.slice(-2000)}`);
        err.output = out;
        err.code = code;
        reject(err);
      });
    });
  }

  /** Uruchamia skrypt Node przez binarkę Electrona (ELECTRON_RUN_AS_NODE) lub zwykły Node. */
  runNode(script, args, opts = {}) {
    return this.run(process.execPath, [script, ...args], {
      ...opts,
      env: { ELECTRON_RUN_AS_NODE: '1', ...opts.env },
    });
  }

  // ---------- konfiguracja ----------

  loadConfig() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.logsDir, { recursive: true });
    let firstRun = false;
    let cfg = null;
    try {
      cfg = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    } catch {
      /* brak pliku lub uszkodzony */
    }
    if (!cfg) {
      if (fs.existsSync(this.pgDataDir)) {
        // Baza istnieje, a config zginął: bez hasła nie da się połączyć.
        throw new Error(
          `Brak pliku konfiguracji (${this.configFile}), a baza danych już istnieje. ` +
            'Przywróć plik config.json z kopii zapasowej.'
        );
      }
      firstRun = true;
      // Konto do logowania powstaje przy aktywacji (createLocalUser) — tu bez haseł użytkownika.
      cfg = {
        pgPassword: randomHex(16),
        authSecret: randomHex(32),
        cronSecret: randomHex(24),
      };
      fs.writeFileSync(this.configFile, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    }
    this.config = cfg;
    return firstRun;
  }

  // ---------- PostgreSQL ----------

  async initDbIfNeeded() {
    if (fs.existsSync(path.join(this.pgDataDir, 'PG_VERSION'))) return false;
    this.log('initdb: tworzenie nowego klastra bazy danych');
    const pwFile = path.join(this.dataDir, '.pwfile');
    fs.writeFileSync(pwFile, this.config.pgPassword, { mode: 0o600 });
    try {
      await this.run(this.pg('initdb'), [
        '-D', this.pgDataDir,
        '-U', PG_USER,
        '-A', 'scram-sha-256',
        '--pwfile', pwFile,
        '-E', 'UTF8',
        '--locale', 'C',
        '--no-instructions',
      ]);
    } finally {
      fs.rmSync(pwFile, { force: true });
    }
    return true;
  }

  async startPostgres() {
    // Po awarii aplikacji postgres mógł zostać uruchomiony: zatrzymaj go.
    const st = await this.run(this.pg('pg_ctl'), ['status', '-D', this.pgDataDir], {
      okExitCodes: [0, 3, 4],
    });
    if (st.code === 0) {
      this.log('pg_ctl: znaleziono działającą instancję, zatrzymuję');
      await this.run(this.pg('pg_ctl'), ['stop', '-D', this.pgDataDir, '-m', 'fast', '-w', '-t', '60']);
    }

    this.pgPort = await getFreePort();
    let opts = `-p ${this.pgPort} -c listen_addresses=127.0.0.1`;
    if (!IS_WIN) opts += ` -c unix_socket_directories='${this.dataDir}'`;

    this.log(`pg_ctl: start na porcie ${this.pgPort}`);
    await this.run(
      this.pg('pg_ctl'),
      [
        'start', '-D', this.pgDataDir,
        '-w', '-t', '90',
        '-l', path.join(this.logsDir, 'postgres.log'),
        '-o', opts,
      ],
      { detached: true }
    );
    this.pgStarted = true;
  }

  async ensureDatabase() {
    try {
      await this.run(
        this.pg('createdb'),
        ['-h', '127.0.0.1', '-p', String(this.pgPort), '-U', PG_USER, PG_DB],
        { env: { PGPASSWORD: this.config.pgPassword } }
      );
      this.log(`createdb: utworzono bazę ${PG_DB}`);
    } catch (e) {
      if (!/already exists|już istnieje/i.test(e.output || '')) throw e;
    }
  }

  get databaseUrl() {
    return `postgresql://${PG_USER}:${this.config.pgPassword}@127.0.0.1:${this.pgPort}/${PG_DB}`;
  }

  // ---------- schemat i seed ----------

  appEnv() {
    const url = `http://127.0.0.1:${this.appPort}`;
    return {
      NODE_ENV: 'production',
      DATABASE_URL: this.databaseUrl,
      AUTH_SECRET: this.config.authSecret,
      NEXTAUTH_SECRET: this.config.authSecret,
      AUTH_TRUST_HOST: 'true',
      NEXTAUTH_URL: url,
      NEXT_PUBLIC_APP_URL: url,
      CRON_SECRET: this.config.cronSecret,
      NEXT_TELEMETRY_DISABLED: '1',
      // Tryb desktop: bez rejestracji, okresu próbnego i strony sprzedażowej.
      OPTYK_EDITION: 'desktop',
    };
  }

  async pushSchema() {
    this.log('prisma db push');
    const cli = path.join(this.toolsDir, 'node_modules', 'prisma', 'build', 'index.js');
    const schema = path.join(this.toolsDir, 'prisma', 'schema.prisma');
    const r = await this.runNode(cli, ['db', 'push', '--skip-generate', '--schema', schema], {
      cwd: this.toolsDir,
      env: {
        DATABASE_URL: this.databaseUrl,
        CHECKPOINT_DISABLE: '1',
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
      },
    });
    this.log(r.out.trim());
  }

  /** Czy w bazie jest konto do logowania (po aktywacji). */
  async hasUsers() {
    const r = await this.run(
      this.pg('psql'),
      ['-h', '127.0.0.1', '-p', String(this.pgPort), '-U', PG_USER, '-d', PG_DB, '-tAc', 'select count(*) from users'],
      { env: { PGPASSWORD: this.config.pgPassword } }
    );
    return Number(r.out.trim()) > 0;
  }

  /** Konto lokalne z danymi z aktywacji. Hasło tylko w zmiennej środowiska procesu, nie w argumentach. */
  async createLocalUser({ email, password, name }) {
    this.log(`konto lokalne: ${email}`);
    await this.runNode(path.join(this.appDir, 'local-user.js'), [], {
      cwd: this.appDir,
      env: { ...this.appEnv(), LOCAL_USER_EMAIL: email, LOCAL_USER_PASSWORD: password, LOCAL_USER_NAME: name || '' },
    });
  }

  // ---------- serwer Next.js ----------

  async startApp() {
    this.appPort = (await isPortFree(PREFERRED_APP_PORT)) ? PREFERRED_APP_PORT : await getFreePort();
  }

  launchNext() {
    const logFd = fs.openSync(path.join(this.logsDir, 'app.log'), 'w');
    this.log(`next: start na porcie ${this.appPort}`);
    this.appProc = spawn(process.execPath, [path.join(this.appDir, 'server.js')], {
      cwd: this.appDir,
      env: {
        ...process.env,
        ...this.appEnv(),
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(this.appPort),
        HOSTNAME: '127.0.0.1',
      },
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
    });
    fs.closeSync(logFd);
    this.appProc.once('exit', (code) => {
      this.log(`next: zakończył się kodem ${code}`);
      this.appProc = null;
    });
  }

  async waitForApp(timeoutMs = 90000) {
    const url = `http://127.0.0.1:${this.appPort}/`;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.appProc) throw new Error('Serwer aplikacji zakończył pracę podczas uruchamiania (zobacz logs/app.log).');
      const ok = await new Promise((resolve) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(true);
        });
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
        req.on('error', () => resolve(false));
      });
      if (ok) return;
      await sleep(500);
    }
    throw new Error('Serwer aplikacji nie odpowiedział w wymaganym czasie (zobacz logs/app.log).');
  }

  // Wysyłka zaplanowanych SMS-ów. W chmurze robi to zewnętrzny cron.
  startCron() {
    const call = () => {
      const req = http.get(
        `http://127.0.0.1:${this.appPort}/api/cron/send-scheduled-sms`,
        { headers: { authorization: `Bearer ${this.config.cronSecret}` } },
        (res) => res.resume()
      );
      req.on('error', (e) => this.log(`cron: ${e.message}`));
    };
    this.cronTimer = setInterval(call, CRON_INTERVAL_MS);
    this.cronTimer.unref();
  }

  // ---------- cykl życia ----------

  /** Etap 1: baza danych gotowa (PostgreSQL działa, schemat aktualny). */
  async prepare(onStatus = () => {}) {
    const firstRun = this.loadConfig();
    this.log(`start (firstRun=${firstRun}, platform=${process.platform})`);

    onStatus('Przygotowanie bazy danych…');
    await this.initDbIfNeeded();
    await this.startPostgres();
    await this.ensureDatabase();

    onStatus('Aktualizacja struktury bazy…');
    await this.startApp(); // wybór portu potrzebny do NEXTAUTH_URL
    await this.pushSchema();
    return { firstRun };
  }

  /** Etap 2: serwer aplikacji (po sprawdzeniu licencji). */
  async launch(onStatus = () => {}) {
    onStatus('Uruchamianie aplikacji…');
    this.launchNext();
    await this.waitForApp();
    this.startCron();
    return { url: `http://127.0.0.1:${this.appPort}` };
  }

  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    if (this.cronTimer) clearInterval(this.cronTimer);
    if (this.appProc) {
      const p = this.appProc;
      p.kill();
      await new Promise((r) => {
        const t = setTimeout(r, 5000);
        p.once('exit', () => {
          clearTimeout(t);
          r();
        });
      });
    }
    if (this.pgStarted) {
      try {
        await this.run(this.pg('pg_ctl'), ['stop', '-D', this.pgDataDir, '-m', 'fast', '-w', '-t', '60']);
        this.log('pg_ctl: zatrzymano');
      } catch (e) {
        this.log(`pg_ctl stop: ${e.message}`);
      }
      this.pgStarted = false;
    }
  }
}

module.exports = { Backend };
