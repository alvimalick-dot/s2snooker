import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import { ok, fail } from '@/lib/utils';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/start
// body: { pricingType: 'single_frame' | 'double_frame' | 'century_booking' | 'per_minute',
//         hourlyRate: number, flatPrice?: number, customerName?: string }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();

    if (!body.pricingType) return fail('pricingType is required');
    if (typeof body.hourlyRate !== 'number') return fail('hourlyRate is required');

    // Generate a stable customerId for this session and normalize the name
    const customerId = nanoid(8);
    const rawName = (body.customerName ?? '').trim();
    const customerName = rawName || `Guest #${customerId}`;

    // Atomic claim: guards against two staff members tapping "Start Session"
    // on the same table within the same instant (e.g. one on a phone, one on
    // the counter tablet) and both writes racing each other. Whichever
    // request loses the race gets a clean 409 instead of silently
    // overwriting the other's session.
    const table = await Table.findOneAndUpdate(
      { _id: params.id, status: { $ne: 'occupied' } },
      {
        $set: {
          status: 'occupied',
          reservation: null,
          currentSession: {
            startTime: new Date(),
            gameType: body.gameType ?? body.pricingType ?? 'casual',
            billingMode: body.billingMode ?? (body.pricingType === 'per_minute' ? 'time_based' : 'flat_rate'),
            pricingType: body.pricingType,
            flatPrice: body.flatPrice,
            hourlyRate: body.hourlyRate,
            durationMinutes: body.durationMinutes ?? null,
            overtimeRate: body.overtimeRate ?? 0,
            gracePeriodMinutes: body.gracePeriodMinutes ?? 0,
            flatSurcharge: body.flatSurcharge ?? 0,
            minimumMinutes: body.minimumMinutes ?? null,
            customerId,
            customerName,
            additionalPlayers: (body.additionalPlayers ?? []).map((n: string) => n.trim()).filter(Boolean),
            isPaused: false,
            pauseStartedAt: null,
            pausedDurationMs: 0,
            activeOrders: [],
            switchedFromTableNumber: null,
          },
        },
      },
      { new: true }
    );

    if (!table) {
      const exists = await Table.findById(params.id).lean();
      if (!exists) return fail('Table not found', 404);
      return fail('Table is already occupied', 409);
    }

    return ok(table);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to start session', 500);
  }
}
