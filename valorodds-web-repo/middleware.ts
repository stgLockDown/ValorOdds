import { NextResponse, type NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from './lib/auth-config';

const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES = ['/dashboard', '/account', '/admin'];
const ADMIN_PREFIXES = ['/admin'];

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isProtected) return NextResponse.next();

  const session = req.auth;
  if (!session?.user) {
    const loginUrl = new URL('/auth/signin', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname + nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const isAdminRoute = ADMIN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (isAdminRoute && !(session.user as any).isAdmin) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};