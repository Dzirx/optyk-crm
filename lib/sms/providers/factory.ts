import { ISmsProvider, SmsProviderConfig } from './interface';
import { SmsApiProvider } from './smsapi';
import { SmsPlanetProvider } from './smsplanet';
import { SmsProvider } from '@/lib/sms/types';

export class SmsProviderFactory {
  static create(provider: SmsProvider, config: SmsProviderConfig): ISmsProvider {
    switch (provider) {
      case 'smsapi':
        return new SmsApiProvider(config);

      case 'smsplanet':
        return new SmsPlanetProvider(config);

      default:
        throw new Error(`Unknown SMS provider: ${provider}`);
    }
  }

}
