import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { IS_DESKTOP } from '@/lib/edition';

export default async function proxy(req: NextRequest) {
  // Get session using NextAuth
  const session = await auth();
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!session;

  // Wersja Windows: bez strony sprzedażowej i bez rejestracji.
  if (IS_DESKTOP && (pathname === '/' || pathname === '/register')) {
    return NextResponse.redirect(new URL(isLoggedIn ? '/dashboard' : '/login', req.url));
  }

  // Protected routes
  const isProtectedRoute = pathname.startsWith('/dashboard') ||
                          pathname.startsWith('/admin');

  // Admin routes
  const isAdminRoute = pathname.startsWith('/admin');

  // Redirect to login if not authenticated
  if (isProtectedRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Redirect to dashboard if logged in and trying to access auth pages
  if (isLoggedIn && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // Check admin access
  if (isAdminRoute && session?.user?.role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
