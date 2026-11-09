import type { Metadata } from 'next';
import { IS_DESKTOP } from '@/lib/edition';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Logowanie — OptykCRM' };

// Renderowanie przy każdym żądaniu: tryb (OPTYK_EDITION) jest znany dopiero po starcie
// serwera, a nie w czasie builda.
export const dynamic = 'force-dynamic';

// Serwerowa część strony: wersja Windows ukrywa rejestrację i linki do strony sprzedażowej.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
  const { registered } = await searchParams;
  return <LoginForm desktop={IS_DESKTOP} registered={registered === 'true'} />;
}
