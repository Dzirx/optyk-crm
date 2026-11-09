// Wspólne narzędzia testów e2e: klient HTTP z ciasteczkami, logowanie, czekanie na serwer, SQL w kontenerze.
import { execFileSync } from 'node:child_process';

export const BASE = process.env.BASE || 'http://localhost:3131';
export const ROOT_EMAIL = process.env.ROOT_USER_EMAIL || 'root@test.local';
export const ROOT_PASSWORD = process.env.ROOT_USER_PASSWORD || 'Root-test-123';
export const PASSWORD = 'Haslo-testowe-123';

const CONTAINER = process.env.E2E_DB_CONTAINER || 'optyk-e2e-db';
const PG_USER = process.env.E2E_PG_USER || 't';
const PG_DB = process.env.E2E_PG_DB || 'optyk';

export class Client {
  constructor(name = '') {
    this.name = name;
    this.jar = new Map();
  }
  cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      this.jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
  }
  /** Żądanie JSON (body) albo formularz (form). Zwraca { status, json }. */
  async req(method, path, body, form) {
    const headers = { cookie: this.cookie() };
    let payload;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(form).toString();
    } else if (body !== undefined && body !== null) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
    this.store(res);
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* odpowiedź bez JSON */
    }
    return { status: res.status, json };
  }
  /** Surowy tekst strony (np. HTML panelu). */
  async page(path) {
    const res = await fetch(BASE + path, { headers: { cookie: this.cookie() }, redirect: 'manual' });
    return res.text();
  }
  /** Logowanie przez NextAuth (credentials). Zwraca true, gdy powstało ciasteczko sesji. */
  async login(email, password) {
    this.jar.clear();
    const r = await this.req('GET', '/api/auth/csrf');
    await this.req('POST', '/api/auth/callback/credentials', undefined, {
      csrfToken: r.json.csrfToken,
      email,
      password,
      callbackUrl: BASE,
    });
    return [...this.jar.keys()].some((k) => k.includes('session-token'));
  }
}

export async function waitForServer(timeoutSec = 120) {
  for (let i = 0; i < timeoutSec; i++) {
    try {
      const r = await fetch(BASE + '/api/auth/csrf');
      if (r.ok) return;
    } catch {
      /* serwer jeszcze nie działa */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('serwer nie wystartował');
}

/** Zapytanie SQL w kontenerze testowej bazy. Zwraca tekst bez nagłówków. */
export function sql(q) {
  return execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-At', '-c', q], {
    env: { ...process.env, DOCKER_CONTEXT: 'desktop-linux' },
  })
    .toString()
    .trim();
}

let failed = 0;
export function check(cond, msg, extra) {
  if (cond) console.log(`OK   ${msg}`);
  else {
    failed++;
    console.log(`FAIL ${msg}`, extra !== undefined ? JSON.stringify(extra)?.slice(0, 300) : '');
  }
}
export const section = (t) => console.log(`--- ${t}`);

/** Kończy proces kodem 1 przy błędach. */
export function finish() {
  console.log(failed ? `\n${failed} TEST(Y) NIEUDANE` : '\nWSZYSTKO OK');
  process.exit(failed ? 1 : 0);
}

/** Opakowanie głównej funkcji suity: nieoczekiwany wyjątek = niepowodzenie. */
export async function run(fn) {
  try {
    await waitForServer();
    await fn();
  } catch (e) {
    console.error('BŁĄD SUITY:', e);
    failed++;
  }
  finish();
}
