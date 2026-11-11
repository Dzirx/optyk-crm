export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  cost?: number;
}

export interface ISmsProvider {
  sendSms(phone: string, message: string): Promise<SmsResult>;
}

export interface SmsProviderConfig {
  apiKey?: string;
  apiSecret?: string;
  accountSid?: string;
  authToken?: string;
  sender: string;
  region?: string;
  [key: string]: string | undefined;
}

/** Najdłuższy czas jednego żądania do bramki SMS. Po nim wysyłka liczy się jako nieudana (bez ponawiania). */
export const SMS_SEND_TIMEOUT_MS = 30_000;

export const SMS_TIMEOUT_ERROR = `Przekroczono czas oczekiwania na odpowiedź bramki SMS (${SMS_SEND_TIMEOUT_MS / 1000} s); wiadomość mogła zostać dostarczona`;
