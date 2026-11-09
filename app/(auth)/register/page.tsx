import type { Metadata } from 'next';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Wypróbuj 5 dni za darmo — OptykCRM' };

export default function RegisterPage() {
  return <RegisterForm />;
}
