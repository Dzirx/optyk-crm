import { ISmsProvider, SmsResult, SmsProviderConfig, SMS_SEND_TIMEOUT_MS, SMS_TIMEOUT_ERROR } from './interface';

/**
 * SMSAPI.pl Provider (Poland & Europe)
 * Docs: https://www.smsapi.pl/docs
 */
export class SmsApiProvider implements ISmsProvider {
  private apiKey: string;
  private sender: string;
  private baseUrl = 'https://api.smsapi.pl';

  constructor(config: SmsProviderConfig) {
    if (!config.apiKey) {
      throw new Error('SMSAPI: apiKey is required');
    }
    this.apiKey = config.apiKey;
    this.sender = config.sender || 'Info';
  }

  async sendSms(phone: string, message: string): Promise<SmsResult> {
    try {
      const response = await fetch(`${this.baseUrl}/sms.do`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: phone,
          message: message,
          from: this.sender,
          format: 'json',
        }),
        signal: AbortSignal.timeout(SMS_SEND_TIMEOUT_MS),
      });

      const data = await response.json();

      if (response.ok && data.count > 0) {
        return {
          success: true,
          messageId: data.list?.[0]?.id,
          cost: data.list?.[0]?.points,
        };
      }

      return {
        success: false,
        error: data.message || 'Unknown error',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error && error.name === 'TimeoutError' ? SMS_TIMEOUT_ERROR : error instanceof Error ? error.message : 'Network error',
      };
    }
  }


}
