import type { SmsFailure } from '@/components/sms-failure-note';

export interface Visit {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  smsConsent: boolean;
  visitDate: string;
  visitType: string | null;
  notes: string | null;
  reminderSmsDate: string | null;
  reminderSmsStatus: string | null;
  reminderSmsSentAt: string | null;
  reminderSmsFailure?: SmsFailure | null;
  reviewSmsDate: string | null;
  reviewSmsStatus: string | null;
  reviewSmsSentAt: string | null;
  reviewSmsFailure?: SmsFailure | null;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  surname: string;
  phone: string;
}

export interface VisitFormData {
  customerId: string;
  visitDate: string;
  visitType: string;
  notes: string;
  // Dzień przypomnienia (yyyy-mm-dd). `reminderTouched`: użytkownik zmienił go ręcznie, więc zmiana daty wizyty go nie nadpisuje.
  reminderSmsDate: string;
  reminderTouched: boolean;
  // Zgoda na SMS wybranego klienta (bez zgody nie planujemy przypomnienia).
  smsConsent: boolean;
}

export interface NewCustomerData {
  name: string;
  surname: string;
  phone: string;
  email: string;
  smsConsent: boolean;
}
