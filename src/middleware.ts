import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isSessionValid, SESSION_COOKIE } from '@/lib/auth-shared';

// Protect every /api route except the public auth endpoints and the one-time
// seed bootstrap (idempotent, harmless). Everything else requires a valid
// signed session cookie.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/logout') ||
    pathname.startsWith('/api/auth/status') ||
    pathname.startsWith('/api/seed');

  if (isPublic) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const valid = await isSessionValid(token);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized — please sign in.' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};