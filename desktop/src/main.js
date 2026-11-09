'use strict';

const { app, BrowserWindow, dialog, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const { Backend } = require('./backend');
const { machineId } = require('./machine-id');
const { verifyLicense, readLicense, saveLicense, activate } = require('./license');
const pkg = require('../package.json');

// Klucz publiczny licencji (scripts/generate-license-keys.mjs) i adres chmury do aktywacji.
let LICENSE_PUBLIC_KEY = null;
try {
  LICENSE_PUBLIC_KEY = require('./license-public-key');
} catch {
  /* brak klucza — błąd pokażemy przy starcie */
}
// W trybie deweloperskim adres serwera i numer komputera można nadpisać (testy). W wersji zbudowanej — nie.
const DEV = !app.isPackaged;
const LICENSE_SERVER = (DEV && process.env.OPTYK_LICENSE_SERVER) || pkg.optyk?.licenseServer || '';

app.setPath('userData', path.join(app.getPath('appData'), 'OptykCRM'));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const resourcesDir = app.isPackaged
  ? process.resourcesPath
  : process.env.OPTYK_RESOURCES_DIR || path.join(__dirname, '..', 'payload');

const backend = new Backend({
  resourcesDir,
  dataDir: path.join(app.getPath('userData'), 'data'),
  pgBinDir: process.env.OPTYK_PG_BIN_DIR || undefined,
});

let splash = null;
let mainWindow = null;
let quitting = false;

function createSplash() {
  splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    show: true,
    backgroundColor: '#0f172a',
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 640,
    title: 'Optyk CRM',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.once('ready-to-show', () => {
    if (splash) splash.close();
    splash = null;
    mainWindow.show();
  });
  // Linki do innych stron otwieraj w przeglądarce, a strony aplikacji (np. wydruk) w oknie.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(url)) return { action: 'allow' };
    shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.loadURL(url);
}

// ---------- licencja ----------

const licenseFile = () => path.join(backend.dataDir, 'license.json');

/**
 * Licencja sprawdzana lokalnie przy każdym starcie (bez internetu): podpis + numer komputera.
 * Brak ważnej licencji albo konta w bazie → okno aktywacji (jedyny moment z internetem).
 */
async function ensureLicense() {
  if (!LICENSE_PUBLIC_KEY || !LICENSE_SERVER) {
    throw new Error('Ta wersja programu nie ma konfiguracji licencji. Skontaktuj się z dostawcą programu.');
  }
  const machine = machineId({ override: DEV ? process.env.OPTYK_MACHINE_ID : undefined });
  const valid = verifyLicense(readLicense(licenseFile()), LICENSE_PUBLIC_KEY, machine.hash);
  if (valid && (await backend.hasUsers())) {
    backend.log(`licencja OK (${valid.email}, źródło numeru: ${machine.source})`);
    return;
  }
  backend.log(`brak ważnej licencji na tym komputerze (źródło numeru: ${machine.source}) — aktywacja`);
  await showActivation(machine);
}

function showActivation(machine) {
  return new Promise((resolve, reject) => {
    let done = false;
    const win = new BrowserWindow({
      width: 520,
      height: 640,
      resizable: false,
      title: 'Aktywacja — Optyk CRM',
      autoHideMenuBar: true,
      backgroundColor: '#05060a',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'activate-preload.js'),
      },
    });

    ipcMain.removeHandler('license:activate');
    ipcMain.handle('license:activate', async (_e, { email, password }) => {
      try {
        const data = await activate(LICENSE_SERVER, {
          email: String(email || '').trim(),
          password: String(password || ''),
          machineHash: machine.hash,
          machineName: machine.name,
        });
        if (!verifyLicense(data.license, LICENSE_PUBLIC_KEY, machine.hash)) {
          throw new Error('Serwer zwrócił licencję, której ta wersja programu nie rozpoznaje. Skontaktuj się z nami.');
        }
        // To samo hasło co w chmurze — do logowania w programie.
        await backend.createLocalUser({ email: data.user.email, password: String(password), name: data.user.name });
        saveLicense(licenseFile(), data.license);
        backend.log(`aktywacja OK: ${data.user.email}`);
        done = true;
        setTimeout(() => {
          win.close();
          resolve();
        }, 600);
        return { ok: true };
      } catch (e) {
        backend.log(`aktywacja: ${e.message}`);
        return { ok: false, error: e.message };
      }
    });

    win.on('closed', () => {
      ipcMain.removeHandler('license:activate');
      if (!done) reject(Object.assign(new Error('Program nie został aktywowany.'), { cancelled: true }));
    });
    if (splash) splash.hide();
    win.loadFile(path.join(__dirname, 'activate.html'));
  });
}

async function boot() {
  createSplash();
  Menu.setApplicationMenu(null);
  try {
    await backend.prepare();
    await ensureLicense();
    if (splash && !splash.isDestroyed()) splash.show();
    const info = await backend.launch();
    createMainWindow(info.url);
  } catch (e) {
    if (e.cancelled) {
      // Użytkownik zamknął okno aktywacji — bez komunikatu błędu.
      if (splash && !splash.isDestroyed()) splash.close();
      await backend.stop();
      app.exit(0);
      return;
    }
    backend.log(`BŁĄD: ${e.stack || e.message}`);
    if (splash) splash.close();
    if (e.code === 'NO_MACHINE_ID') {
      dialog.showErrorBox('Nie można aktywować programu na tym komputerze', e.message);
    } else {
      dialog.showErrorBox('Nie udało się uruchomić Optyk CRM', `${e.message}\n\nLogi: ${backend.logsDir}`);
    }
    await backend.stop();
    app.exit(1);
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  backend.stop().finally(() => app.exit(0));
});

if (gotLock) app.whenReady().then(boot);
