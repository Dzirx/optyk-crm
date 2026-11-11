export interface Campaign {
  id: string;
  message: string;
  status: 'queued' | 'sending' | 'done' | 'cancelled';
  total: number;
  sent: number;
  failed: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CampaignRecipient {
  id: string;
  customerName: string;
  phone: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  sentAt: string | null;
  reasonCode: string | null;
  reason: string | null;
  isConfig: boolean;
}

export const POLL_MS = 3000;
