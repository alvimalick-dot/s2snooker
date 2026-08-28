import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import RevenueLog from '@/models/RevenueLog';
import CustomerAccount from '@/models/CustomerAccount';
import { ok, fail, computeSessionBill } from '@/lib/utils';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

/** Normalize a name for consistent grouping. */
function normName(s: string): string {
  return (s ?? '').trim().toLowerCase();
}

// POST /api/tables/:id/new-game — freeze current game, start fresh
//
// body: {
//   targetTableId?: string,
//   gameType: string,
//   pricingType: string,
//   billingMode: string,
//   hourlyRate: number,
//   flatPrice: number,
//   durationMinutes: number,
//   overtimeRate: number,
//   loser?: string,       — who lost this round
//   billNow?: boolean,    — if true, charge the loser's account immediately
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
    const loser = (body.loser ?? '').trim();

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
    const roundTotal = bill.total; // game + food for this round

    // ── 2. Determine if bill now or keep on tab ─────────────────
    const billNow = body.billNow === true && loser;

    // Build the accumulated charge entry
    const charge = {
      tableNumber: sourceTable.tableNumber,
      gameType: session.gameType ?? session.pricingType ?? '',
      gameTotal: bill.tableTotal,
      foodTotal: bill.foodTotal,
      elapsedMinutes,
      startTime: session.startTime,
      endTime: now,
      loser,
      settled: billNow,
      settledBy: billNow ? loser : '',
      items: (session.activeOrders ?? []).map((o: any) => ({
        itemName: o.itemName,
        quantity: o.quantity,
        price: o.price,
        isComp: o.isComp ?? false,
        discountPercent: o.discountPercent ?? 0,
      })),
    };

    const accumulatedCharges = [...(session.accumulatedCharges ?? []), charge];

    // ── 3. If billNow, charge the loser's CustomerAccount ───────
    if (billNow && loser) {
      // Look up by name only — the loser may be different from the session owner
      const account = await CustomerAccount.findOneAndUpdate(
        { customerName: normName(loser) },
        {
          $setOnInsert: {
            customerId: session.customerId,
            customerName: normName(loser),
            balance: 0,
            totalCharged: 0,
            totalPaid: 0,
            transactions: [],
          },
        },
        { upsert: true, new: true }
      );

      // Add charge transaction
      const transaction = {
        type: 'charge',
        amount: roundTotal,
        description: `${session.gameType ?? 'Game'} — ${sourceTable.label ?? `T${sourceTable.tableNumber}`}`,
        sessionId: null,
        staffName: 'System',
        date: now,
      };

      account.balance += roundTotal;
      account.totalCharged += roundTotal;
      account.transactions.push(transaction as any);
      await account.save();
    }

    // ── 4. Determine target table ───────────────────────────────
    const moving = body.targetTableId && body.targetTableId !== params.id;
    let targetTable = sourceTable;

    if (moving) {
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
      sourceTable.status = 'available';
      sourceTable.currentSession = null as any;
      await sourceTable.save();
    }

    // ── 5. Start fresh game on target ───────────────────────────
    targetTable.status = 'occupied';
    targetTable.currentSession = {
      customerId: session.customerId,
      customerName: session.customerName,
      loser,
      additionalPlayers: session.additionalPlayers,
      accumulatedCharges,
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
      startTime: now,
      isPaused: false,
      pauseStartedAt: null,
      pausedDurationMs: 0,
      activeOrders: [],
      switchedFromTableNumber: moving ? sourceTable.tableNumber : (session.switchedFromTableNumber ?? null),
    } as any;

    await targetTable.save();

    return ok({
      previousBill: bill,
      roundTotal,
      accumulatedCharges,
      billNow,
      billedTo: billNow ? loser : null,
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
