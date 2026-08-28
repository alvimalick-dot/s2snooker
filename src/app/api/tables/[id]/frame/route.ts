import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/frame — increment or set the frame counter
// body: { action: 'increment' | 'decrement' | 'set', value?: number }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();

    const table = await Table.findById(params.id);
    if (!table) return fail('Table not found', 404);
    if (!table.currentSession) return fail('No active session on this table', 409);

    const session = table.currentSession;
    const currentFrames = session.framesPlayed ?? 0;

    if (body.action === 'increment') {
      session.framesPlayed = currentFrames + 1;
    } else if (body.action === 'decrement') {
      session.framesPlayed = Math.max(0, currentFrames - 1);
    } else if (body.action === 'set' && typeof body.value === 'number') {
      session.framesPlayed = Math.max(0, body.value);
    } else {
      return fail('action must be increment, decrement, or set');
    }

    await table.save();
    return ok(table);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to update frame count', 500);
  }
}
