import { ISmsProvider, SmsResult, SmsProviderConfig, SMS_SEND_TIMEOUT_MS, SMS_TIMEOUT_ERROR } from './interface';

/**
 * SMSPlanet Provider (Poland)
 * Docs: https://smsplanet.pl/api
 */
export class SmsPlanetProvider implements ISmsProvider {
  private apiKey: string;
  private sender: string;
  private baseUrl = 'https://api2.smsplanet.pl';

  constructor(config: SmsProviderConfig) {
    if (!config.apiKey) {
      throw new Error('SMSPlanet: apiKey is required');
    }
    this.apiKey = config.apiKey;
    this.sender = config.sender || 'Info';
  }

  async sendSms(phone: string, message: string): Promise<SmsResult> {
    try {
      const params = new URLSearchParams({
        from: this.sender,
        to: phone,
        msg: message,
      });

      const response = await fetch(`${this.baseUrl}/sms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(SMS_SEND_TIMEOUT_MS),
      });

      const data = await response.json();

      if (data.errorCode) {
        return { success: false, error: `${data.errorMsg} (kod: ${data.errorCode})` };
      }

      return { success: true, messageId: String(data.messageId) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error && error.name === 'TimeoutError' ? SMS_TIMEOUT_ERROR : error instanceof Error ? error.message : 'Network error',
      };
    }
  }


}
