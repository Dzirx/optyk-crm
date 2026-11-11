// Czyste funkcje kampanii SMS (bez bazy) — testowane jednostkowo.
import { SMS_SEND_TIMEOUT_MS } from './providers/interface';

export const CAMPAIGN_STATUSES = ['queued', 'sending', 'done', 'cancelled'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const RECIPIENT_STATUSES = ['pending', 'sending', 'sent', 'failed', 'cancelled'] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

/** Rezerwacja odbiorcy starsza niż tyle ms oznacza porzuconą (awaria procesu) i można ją przejąć. */
export const CLAIM_STALE_MS = 5 * 60 * 1000;
/** Ile odbiorców rezerwuje jedno pobranie. */
export const CLAIM_BATCH_SIZE = 20;
/** Ile SMS-ów z jednej partii wysyłamy równolegle. */
export const SEND_CONCURRENCY = 5;
/** Najdłuższy czas jednej zarezerwowanej partii (ms): wysyłki idą w SEND_CONCURRENCY torach, każde żądanie trwa najwyżej SMS_SEND_TIMEOUT_MS (+1 s zapasu sendSafely). Musi być dużo krótszy od CLAIM_STALE_MS. */
export const MAX_BATCH_MS = Math.ceil(CLAIM_BATCH_SIZE / SEND_CONCURRENCY) * (SMS_SEND_TIMEOUT_MS + 1000);
/** Najdłuższy czas jednego uruchomienia harmonogramu; resztę dokończy następne uruchomienie. */
export const RUN_BUDGET_MS = 110 * 1000;
/** Najdłuższy czas natychmiastowej wysyłki po utworzeniu kampanii. */
export const KICK_BUDGET_MS = 15 * 60 * 1000;

/** Szablon kampanii: {name} = imię i nazwisko odbiorcy, {staff} = nazwa salonu. */
export function renderCampaignMessage(template: string, name: string, staff: string): string {
  // funkcje zamiast tekstu: znaki „$&” w nazwie nie są wzorcami zamiany
  return template.replace(/{name}/g, () => name).replace(/{staff}/g, () => staff);
}

/** Początek treści do listy historii (najwyżej `max` znaków, w jednej linii). */
export function messagePreview(message: string, max = 60): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Klucz idempotencji: 8–64 znaków, litery, cyfry, myślnik, podkreślenie. */
export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(key);
}

/** Id odbiorców bez powtórzeń, w kolejności pierwszego wystąpienia. */
export function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Czy kampania jest w toku (można ją anulować, a UI odpytuje o postęp). */
export function isCampaignActive(status: string): boolean {
  return status === 'queued' || status === 'sending';
}

/** Ile odbiorców czeka na wysyłkę albo jest w trakcie (łącznie − wysłane − nieudane). */
export function campaignRemaining(c: { total: number; sent: number; failed: number }): number {
  return Math.max(0, c.total - c.sent - c.failed);
}

/** Nowy klucz idempotencji (jeden na „napisanie wiadomości”). Gdy brak crypto.randomUUID (HTTP), losowy ciąg. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const rnd = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `k-${Date.now().toString(36)}-${rnd()}-${rnd()}`.slice(0, 64);
}
