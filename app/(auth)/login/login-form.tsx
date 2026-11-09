'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell, Field, Notice, SubmitButton } from '@/components/auth/auth-shell';

export function LoginForm({ desktop, registered }: { desktop: boolean; registered: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', { email, password, redirect: false });

      if (result?.error) {
        // Ten sam komunikat przy złym haśle i przy blokadzie po wielu próbach — nie podpowiadamy atakującemu.
        setError('Nieprawidłowy adres e-mail lub hasło. Po wielu nieudanych próbach logowanie jest blokowane na 15 minut.');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      setError('Coś poszło nie tak. Spróbuj ponownie.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      desktop={desktop}
      eyebrow={desktop ? 'Optyk CRM na Windows' : 'Panel salonu'}
      title="Twój salon"
      highlight="czeka na Ciebie."
      lead={
        desktop
          ? 'Wszystkie dane salonu są zapisane na tym komputerze. Zaloguj się kontem utworzonym przy instalacji.'
          : 'Zaloguj się i zobacz, co dziś dzieje się w salonie.'
      }
      points={['Wizyty na dziś i zaplanowane SMS-y', 'Zlecenia gotowe do odbioru', 'Stan soczewek i oprawek w magazynie']}
      topLink={desktop ? undefined : { text: 'Nie masz konta?', label: 'Wypróbuj 5 dni za darmo', href: '/register' }}
    >
      <h2 className="text-2xl font-semibold tracking-tight">Zaloguj się</h2>
      <p className="mt-2 text-sm text-white/50">Wpisz e-mail i hasło do panelu salonu.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {registered && <Notice tone="success">Konto zostało utworzone. Zaloguj się, aby zacząć 5‑dniowy okres próbny.</Notice>}

        <Field
          id="email"
          name="email"
          type="email"
          label="Adres e-mail"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="salon@example.pl"
        />
        <Field
          id="password"
          name="password"
          type="password"
          label="Hasło"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {error && <Notice tone="error">{error}</Notice>}

        <SubmitButton loading={loading} loadingText="Logowanie…">
          Zaloguj się
        </SubmitButton>

        <p className="text-center text-sm text-white/45">
          {desktop
            ? 'Nie pamiętasz hasła? Login i hasło pokazało okno przy pierwszym uruchomieniu programu.'
            : 'Nie pamiętasz hasła? Skontaktuj się z nami.'}
        </p>

        {!desktop && (
          <p className="text-center text-sm text-white/45 lg:hidden">
            Nie masz konta?{' '}
            <Link href="/register" className="font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
              Wypróbuj 5 dni za darmo
            </Link>
          </p>
        )}
      </form>
    </AuthShell>
  );
}
