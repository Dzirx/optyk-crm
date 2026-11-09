'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function NavLink({ href, children, className = '' }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={`block px-4 py-3 rounded-lg transition-colors ${
        isActive
          ? 'bg-blue-600 text-white font-medium'
          : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
      } ${className}`}
    >
      {children}
    </Link>
  );
}
