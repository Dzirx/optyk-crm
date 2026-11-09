'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell, Field, Notice, SubmitButton } from '@/components/auth/auth-shell';

export function RegisterForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Hasła nie są identyczne');
      return;
    }
    if (formData.password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formData.name, email: formData.email, password: formData.password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Coś poszło nie tak');
        return;
      }
      router.push('/login?registered=true');
    } catch {
      setError('Coś poszło nie tak. Spróbuj ponownie.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="5 dni za darmo"
      title="Wypróbuj w swoim"
      highlight="salonie."
      lead="Załóż konto i przez 5 dni korzystaj ze wszystkich funkcji. Po tym czasie skontaktuj się z nami — ustalimy warunki, a Twoje dane zostaną w systemie."
      points={['Klienci, wizyty i zlecenia z receptą', 'Magazyn soczewek i oprawek', 'SMS-y z przypomnieniem i prośbą o opinię']}
      topLink={{ text: 'Masz już konto?', label: 'Zaloguj się', href: '/login' }}
    >
      <h2 className="text-2xl font-semibold tracking-tight">Załóż konto</h2>
      <p className="mt-2 text-sm text-white/50">Bez karty płatniczej. Nazwę salonu podasz po zalogowaniu.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <Field id="name" name="name" label="Imię i nazwisko" autoComplete="name" required value={formData.name} onChange={handleChange} placeholder="Jan Kowalski" />
        <Field id="email" name="email" type="email" label="Adres e-mail" autoComplete="email" required value={formData.email} onChange={handleChange} placeholder="salon@example.pl" />
        <Field id="password" name="password" type="password" label="Hasło" autoComplete="new-password" required minLength={8} value={formData.password} onChange={handleChange} placeholder="Co najmniej 8 znaków" />
        <Field id="confirmPassword" name="confirmPassword" type="password" label="Powtórz hasło" autoComplete="new-password" required value={formData.confirmPassword} onChange={handleChange} placeholder="••••••••" />

        {error && <Notice tone="error">{error}</Notice>}

        <SubmitButton loading={loading} loadingText="Tworzenie konta…">
          Zacznij 5 dni za darmo
        </SubmitButton>

        <p className="text-center text-sm text-white/45 lg:hidden">
          Masz już konto?{' '}
          <Link href="/login" className="font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
            Zaloguj się
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
