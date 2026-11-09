import type { NewCustomerData, VisitFormData } from './types';

export const emptyFormData = (): VisitFormData => ({
  customerId: '', visitDate: '', visitType: '', notes: '', reminderSmsDate: '',
});

export const emptyNewCustomerData = (): NewCustomerData => ({
  name: '', surname: '', phone: '', email: '', smsConsent: true,
});
