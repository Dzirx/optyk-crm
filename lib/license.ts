// Licencje wersji Windows: podpis Ed25519 po stronie chmury.
//
// Format licencji: "<base64url(JSON)>.<base64url(podpis)>". Program Windows ma wbudowany
// klucz publiczny i sprawdza podpis lokalnie, bez internetu. Klucza prywatnego nie ma nigdzie
// poza serwerem (zmienna LICENSE_PRIVATE_KEY_B64), więc licencji nie da się podrobić.

import crypto from 'crypto';

export interface LicensePayload {
  v: 1;
  /** id aktywacji (LicenseDevice) */
  lid: string;
  /** id konta w chmurze */
  sub: string;
  email: string;
  name: string | null;
  /** SHA-256 numeru sprzętowego komputera */
  machine: string;
  issuedAt: string;
}

function privateKey(): crypto.KeyObject {
  const b64 = process.env.LICENSE_PRIVATE_KEY_B64;
  if (!b64) throw new Error('Brak LICENSE_PRIVATE_KEY_B64 — licencje Windows nie są skonfigurowane');
  return crypto.createPrivateKey(Buffer.from(b64, 'base64').toString('utf8'));
}

export function licensingConfigured(): boolean {
  return !!process.env.LICENSE_PRIVATE_KEY_B64;
}

export function signLicense(payload: LicensePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.sign(null, Buffer.from(body), privateKey()).toString('base64url');
  return `${body}.${sig}`;
}
