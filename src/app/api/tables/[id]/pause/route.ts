import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/pause — pause or resume the clock
//
// This is NOT a customer convenience button. Pausing stops billing while the
// table remains physically occupied and unavailable. It should only be used
// for club-side issues: power cut, lighting failure, table maintenance, etc.
// A customer stepping out for a call or a smoke does NOT qualify — the table
// is still unavailable to anyone else, so the clock keeps running.
//
// body (pause):   { action: 'pause', reason: string, staffName: string }
// body (resume):  { action: 'resume' }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();

    const table = await Table.findById(params.id);
    if (!table) return fail('Table not found', 404);
    if (!table.currentSession) return fail('No active session on this table', 409);

    const session = table.currentSession;

    if (session.isPaused) {
      // === RESUME ===
      const pauseStart = session.pauseStartedAt ? new Date(session.pauseStartedAt).getTime() : Date.now();
      session.pausedDurationMs = (session.pausedDurationMs ?? 0) + (Date.now() - pauseStart);
      session.isPaused = false;
      session.pauseStartedAt = null;
      session.pauseReason = '';
    } else {
      // === PAUSE ===
      // Require explicit reason and staff name — this is a deliberate action
      const reason = body.reason?.trim();
      const staffName = body.staffName?.trim();
      if (!reason) return fail('reason is required — pause is for club-side issues only (power cut, table maintenance, etc.)');
      if (!staffName) return fail('staffName is required');

      session.isPaused = true;
      session.pauseStartedAt = new Date();
      session.pauseReason = `${reason} (${staffName})`;
    }

    await table.save();
    return ok(table);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to toggle pause', 500);
  }
}
