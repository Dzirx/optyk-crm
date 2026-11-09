import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';

export const metadata: Metadata = {
  title: 'OptykCRM — CRM dla salonów optycznych',
  description:
    'Klienci, wizyty, zlecenia z receptą, magazyn soczewek i oprawek oraz automatyczne SMS-y z przypomnieniami i prośbą o opinię w Google.',
};

export default function Page() {
  return <LandingPage />;
}
