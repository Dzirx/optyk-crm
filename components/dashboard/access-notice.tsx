import { CONTACT } from '@/lib/access';

function ContactLine() {
  if (!CONTACT.email && !CONTACT.phone) return <>Skontaktuj się z nami.</>;
  return (
    <>
      Skontaktuj się z nami:{' '}
      {CONTACT.phone && (
        <a href={`tel:${CONTACT.phone.replace(/\s/g, '')}`} className="font-semibold underline">
          {CONTACT.phone}
        </a>
      )}
      {CONTACT.phone && CONTACT.email && ' · '}
      {CONTACT.email && (
        <a href={`mailto:${CONTACT.email}`} className="font-semibold underline">
          {CONTACT.email}
        </a>
      )}
    </>
  );
}

/** Pasek w panelu w czasie okresu próbnego. */
export function TrialBanner({ days }: { days: number }) {
  const label = days === 1 ? '1 dzień' : `${days} dni`;
  return (
    <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900">
      Okres próbny: zostało <strong>{label}</strong>. Aby korzystać dalej, <ContactLine />
    </div>
  );
}

/** Ekran zamiast panelu po końcu okresu próbnego. Dane salonu zostają w bazie. */
export function AccessExpired({ signOutAction }: { signOutAction: () => Promise<void> }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <h1 className="text-2xl font-bold text-gray-900">Okres próbny zakończył się</h1>
        <p className="mt-4 text-gray-600">
          Twoje dane (klienci, wizyty, zlecenia) są zapisane. Aby odblokować dostęp, <ContactLine />
        </p>
        <form action={signOutAction} className="mt-8">
          <button type="submit" className="rounded-full bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800">
            Wyloguj się
          </button>
        </form>
      </div>
    </div>
  );
}
