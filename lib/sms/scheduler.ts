// Wbudowany harmonogram wysyłki zaplanowanych SMS-ów (wersja chmurowa).
// Uruchamia go instrumentation.ts przy starcie serwera, więc na serwerze nie trzeba ustawiać crona.
// Wersja Windows ma własny licznik (desktop/src/backend.js) i tego harmonogramu nie używa.

import { runScheduledSms } from './scheduled';

const INTERVAL_MS = 5 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 30 * 1000;

/** Czy harmonogram ma działać w tym procesie (czysta funkcja, testowana jednostkowo). */
export function schedulerEnabled(env: Record<string, string | undefined>): boolean {
  if (env.OPTYK_EDITION === 'desktop') return false; // Windows: własny licznik
  if (env.SMS_SCHEDULER === 'off') return false;
  if (env.SMS_SCHEDULER === 'on') return true;
  return env.NODE_ENV === 'production'; // lokalnie (npm run dev, testy e2e) domyślnie wyłączony
}

const state = globalThis as unknown as { __optykSmsScheduler?: boolean };

export function startSmsScheduler(): void {
  if (state.__optykSmsScheduler) return; // jeden harmonogram na proces
  state.__optykSmsScheduler = true;

  let running = false;
  const tick = async () => {
    if (running) return; // poprzednie uruchomienie jeszcze trwa
    running = true;
    try {
      await runScheduledSms();
    } catch (error) {
      console.error('[SMS scheduler] Błąd wysyłki zaplanowanych SMS:', error);
    } finally {
      running = false;
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), INTERVAL_MS).unref?.();
  }, FIRST_RUN_DELAY_MS).unref?.();
  console.log('[SMS scheduler] Włączony: wysyłka zaplanowanych SMS co 5 minut');
}
