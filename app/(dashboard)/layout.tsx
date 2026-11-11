import { auth, signOut } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { daysLeft, hasAccess } from '@/lib/access';
import { IS_DESKTOP } from '@/lib/edition';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { NotificationBell } from '@/components/dashboard/notification-bell';
import { AccessExpired, TrialBanner } from '@/components/dashboard/access-notice';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  const handleSignOut = async () => {
    'use server';
    await signOut({ redirectTo: '/login' });
  };

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, accessUntil: true },
  });
  if (!user) {
    // Konto usunięte, a token jeszcze ważny. /login przekierowałby z powrotem do panelu.
    redirect('/api/auth/signout');
  }
  if (!hasAccess(user)) {
    return <AccessExpired signOutAction={handleSignOut} />;
  }
  const trialDays = daysLeft(user);

  return (
    <LanguageProvider>
      <div className="min-h-screen bg-gray-100 flex">
        {/* Sidebar */}
        <DashboardSidebar
          userEmail={session.user.email || ''}
          // Wersja Windows: bez panelu admina (nie ma innych kont salonów).
          userRole={IS_DESKTOP ? 'user' : session.user.role || 'user'}
          signOutAction={handleSignOut}
        />

        {/* Main Content */}
        <div className="flex-1 ml-64 min-w-0">
          <div className="flex justify-end items-center px-4 sm:px-6 lg:px-8 pt-3">
            <NotificationBell />
          </div>
          <main className="max-w-7xl mx-auto pt-2 pb-6 px-4 sm:px-6 lg:px-8">
            {trialDays !== null && <TrialBanner days={trialDays} />}
            {children}
          </main>
        </div>
      </div>
    </LanguageProvider>
  );
}
