import { NextRequest, NextResponse } from 'next/server';
import { issueSession, SESSION_COOKIE } from '@/lib/auth-shared';

export const dynamic = 'force-dynamic';

// POST /api/auth/login — validate credentials server-side, set the HttpOnly
// session cookie. Credentials NEVER ship to the browser.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const loginId = String(body.loginId ?? '').trim();
  const password = String(body.password ?? '');

  const expectedId = process.env.ADMIN_ID || 'admin';
  const expectedPw = process.env.ADMIN_PASSWORD || 'break123';

  if (loginId !== expectedId || password !== expectedPw) {
    return NextResponse.json(
      { success: false, error: 'Invalid login ID or password' },
      { status: 401 }
    );
  }

  const { token, maxAgeSeconds } = await issueSession();
  const res = NextResponse.json({ success: true, data: { authenticated: true } });

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  });

  return res;
}