'use client';

import Link from 'next/link';
import { NavLink } from '@/components/dashboard/nav-link';
import { LanguageSwitcher } from '@/components/dashboard/language-switcher';
import { useLanguage } from '@/lib/i18n/language-context';

interface DashboardSidebarProps {
  userEmail: string;
  userRole: string;
  signOutAction: () => Promise<void>;
}

export function DashboardSidebar({ userEmail, userRole, signOutAction }: DashboardSidebarProps) {
  const { t } = useLanguage();

  return (
    <aside className="w-64 bg-white shadow-lg fixed h-full">
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="p-6 border-b">
          <Link href="/dashboard" className="text-2xl font-bold text-blue-600">
            OptykCRM
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-2">
          <NavLink href="/dashboard">
            {t('dashboard')}
          </NavLink>
          <NavLink href="/customers">
            {t('customers')}
          </NavLink>
          <NavLink href="/visits">
            {t('visits')}
          </NavLink>
          <NavLink href="/work-orders">
            {t('workOrders')}
          </NavLink>
          <NavLink href="/inventory">
            {t('inventory')}
          </NavLink>
          <NavLink href="/messages">
            {t('messages')}
          </NavLink>
          {userRole === 'admin' && (
            <NavLink href="/admin/businesses">
              {t('admin')}
            </NavLink>
          )}
          <NavLink href="/settings">
            {t('settings')}
          </NavLink>
        </nav>

        {/* User Info & Actions */}
        <div className="p-4 border-t space-y-3">
          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* User Info */}
          <div>
            <p className="text-sm text-gray-700 truncate">{userEmail}</p>
            {userRole === 'admin' && (
              <span className="inline-block mt-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                Admin
              </span>
            )}
          </div>

          {/* Sign Out */}
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors"
            >
              {t('signOut')}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
