import { NextRequest, NextResponse } from 'next/server';
import { isSessionValid, SESSION_COOKIE } from '@/lib/auth-shared';

export const dynamic = 'force-dynamic';

// GET /api/auth/status — used on app mount to decide whether to show login.
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authenticated = await isSessionValid(token);
  return NextResponse.json({ success: true, data: { authenticated } });
}