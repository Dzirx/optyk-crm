'use strict';
// Licencja wersji Windows: aktywacja online (raz) i sprawdzanie offline (przy każdym starcie).
// Moduł nie zależy od Electrona — testy uruchamiają go zwykłym Node.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Sprawdza licencję lokalnie: podpis serwera i numer sprzętowy komputera.
 * @returns {object|null} dane licencji albo null, gdy licencja jest nieprawidłowa
 */
function verifyLicense(token, publicKeyPem, machineHash) {
  if (typeof token !== 'string' || !publicKeyPem) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let ok = false;
  try {
    ok = crypto.verify(null, Buffer.from(body), crypto.createPublicKey(publicKeyPem), Buffer.from(sig, 'base64url'));
  } catch {
    return null;
  }
  if (!ok) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload?.v !== 1 || payload.machine !== machineHash) return null;
  return payload;
}

function readLicense(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).license;
  } catch {
    return null;
  }
}

function saveLicense(file, token) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ license: token }, null, 2), { mode: 0o600 });
}

/**
 * Aktywacja w chmurze. Rzuca błąd z komunikatem dla użytkownika.
 * @returns {Promise<{license: string, user: {email: string, name: string|null}}>}
 */
async function activate(serverUrl, { email, password, machineHash, machineName }) {
  let res;
  try {
    res = await fetch(new URL('/api/license/activate', serverUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, machineHash, machineName }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error('Brak połączenia z serwerem OptykCRM. Sprawdź internet i spróbuj ponownie.');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* odpowiedź bez JSON */
  }
  if (!res.ok) throw new Error(data.error || `Serwer zwrócił błąd ${res.status}`);
  if (typeof data.license !== 'string') throw new Error('Serwer zwrócił nieprawidłową odpowiedź.');
  return data;
}

module.exports = { verifyLicense, readLicense, saveLicense, activate };
