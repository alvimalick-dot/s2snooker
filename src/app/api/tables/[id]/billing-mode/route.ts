import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/billing-mode — switch how this session is billed
//
// This is the key real-world operation: a customer starts with "single frame"
// (flat rate), but they're still playing 40 minutes later. Staff switches
// them to time-based billing so the clock charges fairly.
//
// body: {
//   billingMode: 'time_based' | 'flat_rate' | 'manual_override',
//   hourlyRate?: number,     // required for time_based / manual_override
//   flatPrice?: number,      // required for flat_rate
//   gameType?: string,       // optional: update the label too
// }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();

    const table = await Table.findById(params.id);
    if (!table) return fail('Table not found', 404);
    if (!table.currentSession) return fail('No active session on this table', 409);

    const session = table.currentSession;
    const newMode = body.billingMode;

    if (!newMode || !['time_based', 'flat_rate', 'manual_override'].includes(newMode)) {
      return fail('billingMode must be time_based, flat_rate, or manual_override');
    }

    // Validate required fields per mode
    if (newMode === 'time_based' || newMode === 'manual_override') {
      if (typeof body.hourlyRate !== 'number' || body.hourlyRate <= 0) {
        return fail('hourlyRate is required for time_based/manual_override billing');
      }
    }
    if (newMode === 'flat_rate') {
      if (typeof body.flatPrice !== 'number' || body.flatPrice <= 0) {
        return fail('flatPrice is required for flat_rate billing');
      }
    }

    // Apply the switch
    session.billingMode = newMode;
    if (body.gameType) session.gameType = body.gameType;

    if (newMode === 'time_based' || newMode === 'manual_override') {
      session.hourlyRate = body.hourlyRate;
      // Clear flat-rate fields so they don't confuse the bill
      session.flatPrice = undefined;
      session.durationMinutes = undefined;
      session.overtimeRate = 0;
    } else if (newMode === 'flat_rate') {
      session.flatPrice = body.flatPrice;
      session.durationMinutes = body.durationMinutes ?? null;
      session.overtimeRate = body.overtimeRate ?? 0;
    }

    await table.save();
    return ok(table);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to switch billing mode', 500);
  }
}
