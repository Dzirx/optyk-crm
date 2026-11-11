// Kolejka zapisów jednego pola „Policzono”. Czyste funkcje bez Reacta i fetch.
//
// Zasady:
//  - w danej chwili leci najwyżej jedno żądanie na pozycję;
//  - zmiana tekstu w trakcie zapisu ustawia dokładnie jeden zapis następczy (z najnowszym tekstem);
//  - każde żądanie ma numer; odpowiedź inna niż trwającego żądania jest ignorowana;
//  - po odpowiedzi tekst w polu zmienia się TYLKO wtedy, gdy wciąż równa się wysłanemu.

import { MAX_COUNT_QTY } from './limits';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type SaveKind = 'text' | 'restore';

export interface LineEdit {
  /** Tekst w polu. */
  text: string;
  /** Ostatnia wartość znana z serwera (jako tekst; puste = brak liczenia). */
  serverText: string;
  status: SaveStatus;
  /** Komunikat błędu z serwera; pusty = użyj ogólnego. */
  message: string;
  /** Numer ostatnio wysłanego żądania. */
  seq: number;
  inFlight: { seq: number; kind: SaveKind; text: string } | null;
  /** Zapis do wysłania po zakończeniu trwającego (najwyżej jeden). */
  queued: SaveKind | null;
}

export interface SendRequest {
  seq: number;
  kind: SaveKind;
  /** Wartość do wysłania; null = przywróć stan z programu. */
  countedQty: number | null;
}

export type SaveResult = { ok: true; countedQty: number | null } | { ok: false; message: string };

export interface Step {
  state: LineEdit;
  /** Żądanie do wysłania teraz (albo null). */
  send: SendRequest | null;
}

export const COUNT_TEXT = /^\d+$/;
export const MSG_INVALID = 'Wpisz liczbę całkowitą';
export const MSG_MAX = 'Maksymalnie 1 000 000';

/** Sprawdza tekst z pola. Puste = poprawne (czyści liczenie); null = brak błędu, inaczej komunikat. */
export function validateCountText(text: string): string | null {
  const t = text.trim();
  if (t === '') return null;
  if (!COUNT_TEXT.test(t)) return MSG_INVALID;
  if (Number(t) > MAX_COUNT_QTY) return MSG_MAX;
  return null;
}

export const qtyToText = (q: number | null): string => (q === null ? '' : String(q));

export function initialEdit(countedQty: number | null): LineEdit {
  const serverText = qtyToText(countedQty);
  return { text: serverText, serverText, status: 'idle', message: '', seq: 0, inFlight: null, queued: null };
}

/** Użytkownik zmienił tekst. Nie wysyła; zapis zleca debounce albo blur. */
export function edit(state: LineEdit, text: string): LineEdit {
  return {
    ...state,
    text,
    // Zapis następczy ma zapisać najnowszy tekst (a nie np. wcześniej zakolejkowane przywrócenie).
    queued: state.inFlight ? 'text' : null,
    status: state.inFlight ? 'saving' : 'idle',
    message: '',
  };
}

function send(state: LineEdit, kind: SaveKind): Step {
  const seq = state.seq + 1;
  const text = state.text.trim();
  return {
    state: { ...state, seq, status: 'saving', message: '', queued: null, inFlight: { seq, kind, text: state.text } },
    send: { seq, kind, countedQty: kind === 'restore' || text === '' ? null : Number(text) },
  };
}

/** Zapis tekstu z pola (debounce, blur, Enter). */
export function requestSave(state: LineEdit): Step {
  if (state.inFlight) return { state: { ...state, queued: state.queued === 'restore' ? 'restore' : 'text' }, send: null };
  const text = state.text.trim();
  if (text === state.serverText) return { state: { ...state, status: state.status === 'error' ? 'idle' : state.status, message: '' }, send: null };
  const invalid = validateCountText(text);
  if (invalid) return { state: { ...state, status: 'error', message: invalid }, send: null };
  return send(state, 'text');
}

/** „Przywróć”: wysyła null tą samą kolejką. */
export function requestRestore(state: LineEdit): Step {
  if (state.inFlight) return { state: { ...state, queued: 'restore' }, send: null };
  return send(state, 'restore');
}

export interface ResponseStep extends Step {
  /** Odpowiedź dotyczyła aktualnego żądania (strona może odświeżyć wiersz). */
  applied: boolean;
}

export function applyResponse(state: LineEdit, seq: number, result: SaveResult): ResponseStep {
  const flight = state.inFlight;
  if (!flight || flight.seq !== seq || seq !== state.seq) return { state, send: null, applied: false };

  let next: LineEdit;
  if (result.ok) {
    const serverText = qtyToText(result.countedQty);
    next = {
      ...state,
      inFlight: null,
      serverText,
      // Tekst zmieniony po wysłaniu zostaje; zapisze go zapis następczy.
      text: state.text === flight.text ? serverText : state.text,
      status: 'saved',
      message: '',
    };
  } else {
    next = { ...state, inFlight: null, status: 'error', message: result.message };
  }

  if (next.queued) {
    const kind = next.queued;
    const trimmed = next.text.trim();
    if (kind === 'text' && trimmed === next.serverText) return { state: { ...next, queued: null }, send: null, applied: true };
    const invalid = kind === 'text' ? validateCountText(trimmed) : null;
    if (invalid) return { state: { ...next, queued: null, status: 'error', message: invalid }, send: null, applied: true };
    return { ...send(next, kind), applied: true };
  }
  return { state: next, send: null, applied: true };
}

/** Pole ma zapis w toku albo w kolejce. */
export const isBusy = (s: LineEdit): boolean => s.inFlight !== null || s.queued !== null;

/** Pole blokuje zakończenie: błąd albo tekst różny od wartości z serwera. */
export const isBlocking = (s: LineEdit): boolean => s.status === 'error' || s.text.trim() !== s.serverText;

/** Wiersz ma być widoczny mimo filtrów (trwa zapis, błąd, niezapisany tekst). */
export const isActive = (s: LineEdit): boolean => isBusy(s) || isBlocking(s);

/**
 * Pole ma teraz zapisać tekst (flush): nie jest zajęte i albo ma niezapisany tekst,
 * albo jest w błędzie, ale tekst jest poprawny (np. chwilowy błąd sieci) lub równy wartości z serwera.
 */
export function shouldFlush(s: LineEdit): boolean {
  if (isBusy(s)) return false;
  const text = s.text.trim();
  if (s.status === 'error') return text === s.serverText || validateCountText(text) === null;
  return text !== s.serverText;
}

/** Po ponownym pobraniu spisu: przenosi wartość z serwera do wpisu, który nie zapisuje się w tej chwili. */
export function reconcile(s: LineEdit, countedQty: number | null): LineEdit {
  if (isBusy(s)) return s;
  const serverText = qtyToText(countedQty);
  return { ...s, serverText, text: s.text === s.serverText ? serverText : s.text };
}
