import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import { ok, fail, computeSessionBill } from '@/lib/utils';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/new-game — freeze current game, start fresh
//
// body: {
//   targetTableId?: string,  — if different from current, move session there
//   gameType: string,
//   pricingType: string,
//   billingMode: string,
//   hourlyRate: number,
//   flatPrice: number,
//   durationMinutes: number,
//   overtimeRate: number,
//   gracePeriodMinutes?: number,
//   flatSurcharge?: number,
//   minimumMinutes?: number,
// }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();

    const sourceTable = await Table.findById(params.id);
    if (!sourceTable) return fail('Table not found', 404);
    if (!sourceTable.currentSession) return fail('No active session on this table', 409);

    const session = sourceTable.currentSession as any;
    const now = new Date();

    // ── 1. Compute the current game's bill ──────────────────────
    const bill = computeSessionBill(
      {
        startTime: session.startTime,
        pricingType: session.pricingType,
        billingMode: session.billingMode,
        hourlyRate: session.hourlyRate,
        flatPrice: session.flatPrice ?? undefined,
        durationMinutes: session.durationMinutes ?? undefined,
        overtimeRate: session.overtimeRate ?? undefined,
        gracePeriodMinutes: session.gracePeriodMinutes ?? undefined,
        flatSurcharge: session.flatSurcharge ?? undefined,
        minimumMinutes: session.minimumMinutes ?? undefined,
        activeOrders: session.activeOrders,
        pausedDurationMs: session.pausedDurationMs ?? 0,
        isPaused: session.isPaused ?? false,
        pauseStartedAt: session.pauseStartedAt ?? null,
      },
      now
    );

    const elapsedMinutes = Math.ceil(bill.elapsedMs / 60000);

    // ── 2. Freeze into accumulatedCharges ───────────────────────
    const charge = {
      tableNumber: sourceTable.tableNumber,
      gameType: session.gameType ?? session.pricingType ?? '',
      gameTotal: bill.tableTotal,
      foodTotal: bill.foodTotal,
      elapsedMinutes,
      startTime: session.startTime,
      endTime: now,
    };

    const accumulatedCharges = [...(session.accumulatedCharges ?? []), charge];

    // ── 3. Determine target table ───────────────────────────────
    const moving = body.targetTableId && body.targetTableId !== params.id;
    let targetTable = sourceTable;

    if (moving) {
      // Atomically claim the destination
      const claimed = await Table.findOneAndUpdate(
        { _id: body.targetTableId, status: { $ne: 'occupied' } },
        { $set: { status: 'occupied', reservation: null } },
        { new: true }
      );
      if (!claimed) {
        const exists = await Table.findById(body.targetTableId).lean();
        if (!exists) return fail('Destination table not found', 404);
        return fail('Destination table is already occupied', 409);
      }
      targetTable = claimed;

      // Free the source table
      sourceTable.status = 'available';
      sourceTable.currentSession = null as any;
      await sourceTable.save();
    }

    // ── 4. Start fresh game on target ───────────────────────────
    targetTable.status = 'occupied';
    targetTable.currentSession = {
      customerId: session.customerId,
      customerName: session.customerName,
      additionalPlayers: session.additionalPlayers,
      accumulatedCharges,
      // New game pricing
      gameType: body.gameType,
      pricingType: body.pricingType,
      billingMode: body.billingMode,
      hourlyRate: body.hourlyRate,
      flatPrice: body.flatPrice,
      durationMinutes: body.durationMinutes ?? null,
      overtimeRate: body.overtimeRate ?? 0,
      gracePeriodMinutes: body.gracePeriodMinutes ?? 0,
      flatSurcharge: body.flatSurcharge ?? 0,
      minimumMinutes: body.minimumMinutes ?? null,
      // Fresh state
      startTime: now,
      isPaused: false,
      pauseStartedAt: null,
      pausedDurationMs: 0,
      activeOrders: [],
      // Carries forward for audit trail
      switchedFromTableNumber: moving ? sourceTable.tableNumber : (session.switchedFromTableNumber ?? null),
    } as any;

    await targetTable.save();

    return ok({
      previousBill: bill,
      accumulatedCharges,
      movedFrom: moving ? sourceTable.tableNumber : null,
      targetTable: {
        tableNumber: targetTable.tableNumber,
        label: targetTable.label,
      },
    });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to start new game', 500);
  }
}
