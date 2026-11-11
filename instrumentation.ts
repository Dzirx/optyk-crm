// Uruchamiane raz przy starcie serwera Next.js.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { schedulerEnabled, startSmsScheduler } = await import('./lib/sms/scheduler');
  if (schedulerEnabled(process.env)) startSmsScheduler();
}
