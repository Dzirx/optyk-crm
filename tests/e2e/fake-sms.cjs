// Podmiana fetch dla bramki SMSPlanet w testach e2e (ładowane przez NODE_OPTIONS=--require).
// Klucz API "fail-key" → błąd bramki; każdy inny → sukces. Opóźnienie 300 ms ułatwia testy równoległych żądań.
const realFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (url.includes('api2.smsplanet.pl')) {
    await new Promise((r) => setTimeout(r, 300));
    // Dziennik wywołań (liczenie wysyłek w testach) i numery +48999… odrzucane jako nieprawidłowe.
    const to = new URLSearchParams(String(init?.body ?? '')).get('to') ?? '';
    if (process.env.FAKE_SMS_LOG) require('node:fs').appendFileSync(process.env.FAKE_SMS_LOG, to + '\n');
    if (to.startsWith('+48999')) {
      return new Response(JSON.stringify({ errorCode: 8, errorMsg: 'Invalid phone number' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const auth = init?.headers?.Authorization ?? init?.headers?.authorization ?? '';
    const body = String(auth).includes('fail-key') ? { errorCode: 7, errorMsg: 'Fake gateway failure' } : { messageId: 'fake-' + Date.now() };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(input, init);
};
