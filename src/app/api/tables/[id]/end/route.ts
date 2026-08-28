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

    const table = await Table.findById(params.id);
    if (!table) return fail('Table not found', 404);
    if (!table.currentSession) return fail('No active session on this table', 409);

    const session = table.currentSession;
    const endTime = new Date();

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
        pausedDurationMs: session.pausedDurationMs ?? 0,
        isPaused: session.isPaused ?? false,
        pauseStartedAt: session.pauseStartedAt ?? null,
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

    table.status = 'available';
    table.currentSession = null as any;
    await table.save();

    return ok({ table, receipt: log, bill });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to end session', 500);
  }
}
