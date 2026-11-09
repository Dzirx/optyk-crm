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
  reviewSmsDate: string | null;
  reviewSmsStatus: string | null;
  reviewSmsSentAt: string | null;
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
  reminderSmsDate: string;
}

export interface NewCustomerData {
  name: string;
  surname: string;
  phone: string;
  email: string;
  smsConsent: boolean;
}
