'use strict';
// Numer sprzętowy komputera do licencji.
//
// Windows: wyłącznie UUID płyty głównej (SMBIOS) — zapisany przez producenta, przetrwa reinstalację
// Windows i wymianę dysku. Gdy producent zostawił pusty lub „śmieciowy” UUID (ten sam na wielu
// komputerach), aktywacja jest niemożliwa — program pokazuje komunikat z prośbą o kontakt.
// Linux: tylko na potrzeby testów (desktop/test/smoke.js).
// Do licencji trafia tylko SHA-256, nie sam numer.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

// Wartości wpisywane przez producentów zamiast prawdziwego numeru.
const JUNK = [
  /^$/,
  /^[f-]+$/i,
  /^[0-]+$/,
  /^03000200-0400-0500-0006-000700080009$/i,
  /to be filled/i,
  /default string/i,
  /system serial number/i,
  /not specified/i,
  /not applicable/i,
  /o\.e\.m\./i,
  /^none$/i,
  /^0123456789$/,
  /^serial$/i,
];

function isValid(value) {
  const v = String(value || '').trim();
  return v.length >= 4 && !JUNK.some((re) => re.test(v));
}

function readWindows() {
  let uuid = '';
  try {
    uuid = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_ComputerSystemProduct).UUID'],
      { encoding: 'utf8', windowsHide: true, timeout: 20000 }
    ).trim();
  } catch {
    /* brak odczytu = brak numeru */
  }
  return [['smbios-uuid', uuid.toUpperCase()]];
}

function readLinux() {
  const read = (f) => {
    try {
      return fs.readFileSync(f, 'utf8').trim();
    } catch {
      return '';
    }
  };
  return [
    ['smbios-uuid', read('/sys/class/dmi/id/product_uuid').toUpperCase()],
    ['machine-id', read('/etc/machine-id')],
  ];
}

/**
 * @param {{ override?: string }} [o] override tylko w trybie deweloperskim (testy), nigdy w wersji zbudowanej
 * @returns {{ hash: string, source: string, name: string }}
 */
function machineId(o = {}) {
  let candidates;
  if (o.override) candidates = [['override', o.override]];
  else candidates = process.platform === 'win32' ? readWindows() : readLinux();

  return pick(candidates);
}

/** Pierwszy poprawny numer z listy → hash. Brak poprawnego → błąd z komunikatem dla użytkownika. */
function pick(candidates) {
  const found = candidates.find(([, v]) => isValid(v));
  if (!found) {
    const err = new Error(
      'Producent tego komputera nie zapisał unikalnego numeru płyty głównej (UUID), dlatego licencji nie można ' +
        'przypisać do tego komputera. Skontaktuj się z nami — pomożemy uruchomić program.'
    );
    err.code = 'NO_MACHINE_ID';
    throw err;
  }
  const [source, value] = found;
  const hash = crypto.createHash('sha256').update(`optykcrm-v1:${source}:${value}`).digest('hex');
  return { hash, source, name: os.hostname() };
}

module.exports = { machineId, isValid, pick };
