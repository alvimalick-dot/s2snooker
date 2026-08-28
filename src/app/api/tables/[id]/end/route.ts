import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import RevenueLog from '@/models/RevenueLog';
import Shift from '@/models/Shift';
import { ok, fail, computeSessionBill, buildRevenueLogPayload } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/end - closes the session, writes a RevenueLog entry, frees the table
// body: { closedBy?, customerName? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));

    // Atomic read: only proceed if the table still has a session.
    // Prevents race condition where New Game already consumed the session.
    const table = await Table.findOne({ _id: params.id, status: 'occupied' });
    if (!table) return fail('Table not found or already free', 404);
    if (!table.currentSession) return fail('No active session on this table', 409);

    const session = table.currentSession;
    const endTime = new Date();

    // If session is still paused when ending, finalize the pause duration
    // so the bill doesn't count the remaining pause time.
    let finalPausedMs = session.pausedDurationMs ?? 0;
    if (session.isPaused && session.pauseStartedAt) {
      finalPausedMs += endTime.getTime() - new Date(session.pauseStartedAt).getTime();
    }

    const bill = computeSessionBill(
      {
        startTime: session.startTime,
        pricingType: session.pricingType as any,
        hourlyRate: session.hourlyRate,
        flatPrice: session.flatPrice ?? undefined,
        durationMinutes: session.durationMinutes ?? undefined,
        overtimeRate: session.overtimeRate ?? undefined,
        gracePeriodMinutes: session.gracePeriodMinutes ?? undefined,
        flatSurcharge: session.flatSurcharge ?? undefined,
        minimumMinutes: session.minimumMinutes ?? undefined,
        activeOrders: session.activeOrders as any,
        pausedDurationMs: finalPausedMs,
        isPaused: false, // force not-paused so computeSessionBill doesn't double-count
        pauseStartedAt: null,
      },
      endTime
    );

    const activeShift = await Shift.findOne({ status: 'active' });

    // Use the customerName from the end modal (who is paying)
    const payerName = (body.customerName ?? '').trim() || session.customerName || 'Guest';

    const log = await RevenueLog.create({
      ...buildRevenueLogPayload({
        tableNumber: table.tableNumber,
        isPrivateRoom: table.isPrivateRoom,
        session: { ...session, customerName: payerName } as any,
        closedBy: body.closedBy?.trim() || 'Staff',
        endTime,
        bill,
      }),
      shiftId: activeShift?._id ?? null,
    });

    // Atomic free: only free if still occupied with this session
    await Table.findOneAndUpdate(
      { _id: params.id, status: 'occupied' },
      { $set: { status: 'available', currentSession: null } }
    );

    return ok({ table, receipt: log, bill });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to end session', 500);
  }
}
