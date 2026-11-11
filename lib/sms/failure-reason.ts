// Klasyfikacja przyczyny nieudanego SMS (tekst błędu zapisany w sms_logs.error_message).
// Używa jej lista powiadomień. Teksty błędów pochodzą z lib/sms/scheduled.ts,
// route'ów send-sms i dostawców (lib/sms/providers/*).

export type SmsFailureCode = 'consent' | 'not_configured' | 'no_template' | 'auth' | 'no_credits' | 'bad_phone' | 'expired' | 'other';

export interface SmsFailure {
  code: SmsFailureCode;
  /** Problem konfiguracji bramki SMS — w powiadomieniach zbiera się w jeden wpis. */
  gateway: boolean;
  /** Czytelny powód po polsku. */
  reason: string;
}

const REASONS: Record<Exclude<SmsFailureCode, 'other'>, string> = {
  consent: 'Klient nie wyraził zgody na SMS',
  not_configured: 'Brak klucza API do bramki SMS',
  no_template: 'Brak szablonu SMS',
  auth: 'Błąd logowania do bramki SMS (sprawdź klucz API)',
  no_credits: 'Brak środków na koncie SMS',
  bad_phone: 'Nieprawidłowy numer telefonu',
  expired: 'Wizyta już się odbyła — przypomnienie nie zostało wysłane na czas',
};

const RULES: Array<[SmsFailureCode, RegExp]> = [
  ['expired', /visit already took place/i],
  ['consent', /not consented|zgod/i],
  ['no_template', /template/i],
  ['not_configured', /provider not configured|no sms config|provider creation failed|unknown sms provider|api\s?key is required|dostawca sms nie jest skonfigurowany/i],
  ['auth', /authori[sz]ation|unauthori[sz]ed|authentication|forbidden|invalid (token|credentials|api\s?key|login)|bad credentials|wrong (token|credentials)|\b40[13]\b/i],
  ['no_credits', /no credits|not enough (points|credits|funds|money)|insufficient|balance|payment required|brak środków|\b402\b/i],
  ['bad_phone', /invalid (phone|number|recipient|destination)|incorrect (phone|number)|bad (phone|number)|wrong (phone|number)|nieprawidłowy numer/i],
];

export function classifySmsFailure(error: string | null | undefined): SmsFailure {
  const text = (error ?? '').trim();
  for (const [code, re] of RULES) {
    if (re.test(text)) {
      return { code, gateway: code === 'not_configured' || code === 'no_template' || code === 'auth', reason: REASONS[code as keyof typeof REASONS] };
    }
  }
  const short = text.length > 120 ? `${text.slice(0, 117)}...` : text;
  return { code: 'other', gateway: false, reason: short || 'Nieznany błąd wysyłki' };
}
