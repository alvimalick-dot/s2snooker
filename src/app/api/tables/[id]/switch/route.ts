import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import RevenueLog from '@/models/RevenueLog';
import Shift from '@/models/Shift';
import { ok, fail, buildRevenueLogPayload, computeSessionBill } from '@/lib/utils';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/switch - "Switch / Transfer Table"
//
// Mirrors how the paper log actually worked at the club: the customer's page
// on Table 1 is completely closed out (its own bill, its own time, its own
// snack tab -> written to the RevenueLog / audit trail), and a brand new page
// is opened on the destination table. The two records are never merged or
// dragged forward - they are only linked by the customer's name, so the
// owner can still pull up "everywhere Customer X played today" later.
//
// body: {
//   targetTableId: string,
//   pricingType, hourlyRate, flatPrice? - pricing for the NEW session on the
//     destination table (staff picks a rate the same way as Start Session;
//     defaults to carrying over the source table's pricing if omitted)
//   customerName? - defaults to the source session's customer name
//   closedBy? - who authorized the switch, for the audit trail
// }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();

    if (!body.targetTableId) return fail('targetTableId is required');
    if (body.targetTableId === params.id) return fail('Cannot switch a table to itself');

    const sourceTable = await Table.findById(params.id);
    if (!sourceTable) return fail('Source table not found', 404);
    if (!sourceTable.currentSession) return fail('Source table has no active session', 409);

    // Atomically claim the destination table so two staff members switching
    // different customers onto the same free table at the same moment can't
    // both succeed and silently overwrite each other's session. Whoever's
    // update lands second gets a clean 409 instead of a corrupted table.
    const targetTable = await Table.findOneAndUpdate(
      { _id: body.targetTableId, status: { $ne: 'occupied' } },
      { $set: { status: 'occupied', reservation: null } },
      { new: true }
    );
    if (!targetTable) {
      const exists = await Table.findById(body.targetTableId).lean();
      if (!exists) return fail('Destination table not found', 404);
      return fail('Destination table is already occupied', 409);
    }

    const session = sourceTable.currentSession;
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

    // 1. Close out the source table's session completely - its own independent
    //    bill, time, and snack record - exactly like "End Session" does.
    const activeShift = await Shift.findOne({ status: 'active' });
    const log = await RevenueLog.create({
      ...buildRevenueLogPayload({
        tableNumber: sourceTable.tableNumber,
        isPrivateRoom: sourceTable.isPrivateRoom,
        session: session as any,
        closedBy: body.closedBy?.trim() || 'Unspecified staff',
        endTime,
        bill,
        switchedToTableNumber: targetTable.tableNumber,
      }),
      shiftId: activeShift?._id ?? null,
    });

    sourceTable.status = 'available';
    sourceTable.currentSession = null as any;
    await sourceTable.save();

    // 2. Finish opening the clean new session on the destination table (its
    //    status/reservation were already claimed atomically above). Only the
    //    customer's name carries forward (so their day can be searched) -
    //    the timer, pricing and food tab all start fresh.
    const pricingType = body.pricingType ?? session.pricingType;
    const hourlyRate = typeof body.hourlyRate === 'number' ? body.hourlyRate : session.hourlyRate;
    const flatPrice = body.pricingType ? body.flatPrice : session.flatPrice;

    const durationMinutes = body.durationMinutes ?? session.durationMinutes ?? null;
    const overtimeRate = typeof body.overtimeRate === 'number' ? body.overtimeRate : (session.overtimeRate ?? 0);
    const gracePeriodMinutes = body.gracePeriodMinutes ?? session.gracePeriodMinutes ?? 0;
    const flatSurcharge = typeof body.flatSurcharge === 'number' ? body.flatSurcharge : (session.flatSurcharge ?? 0);
    const minimumMinutes = body.minimumMinutes ?? session.minimumMinutes ?? null;

    // Carry the customerId forward so the new session stays linked to the
    // same customer. Generate a fresh one only if the source had none.
    const newCustomerId = session.customerId ?? nanoid(8);
    const rawName = (body.customerName ?? session.customerName ?? '').trim();
    const newCustomerName = rawName || `Guest #${newCustomerId}`;

    targetTable.currentSession = {
      startTime: endTime,
      customerId: newCustomerId,
      pricingType,
      flatPrice,
      hourlyRate,
      durationMinutes,
      overtimeRate,
      gracePeriodMinutes,
      flatSurcharge,
      minimumMinutes,
      customerName: newCustomerName,
      additionalPlayers: (body.additionalPlayers ?? session.additionalPlayers ?? []).map((n: string) => n.trim()).filter(Boolean),
      isPaused: false,
      pauseStartedAt: null,
      pausedDurationMs: 0,
      activeOrders: [],
      switchedFromTableNumber: sourceTable.tableNumber,
    } as any;
    await targetTable.save();

    return ok({
      closedTable: sourceTable,
      newTable: targetTable,
      closedReceipt: log,
    });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to switch table', 500);
  }
}
