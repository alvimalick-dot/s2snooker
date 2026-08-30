import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import RevenueLog from '@/models/RevenueLog';
import CustomerAccount from '@/models/CustomerAccount';
import Shift from '@/models/Shift';
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

    if (!body.gameType) return fail('gameType is required');
    if (typeof body.hourlyRate !== 'number' || body.hourlyRate <= 0) return fail('hourlyRate must be a positive number');
    if (body.flatPrice != null && (typeof body.flatPrice !== 'number' || body.flatPrice < 0)) return fail('flatPrice must be a non-negative number');

    // Atomic read: only proceed if the table is occupied.
    // Prevents race condition where End Session or another New Game
    // already consumed the session.
    const sourceTable = await Table.findOne({ _id: params.id, status: 'occupied' });
    if (!sourceTable) return fail('Table not found or already free', 404);
    if (!sourceTable.currentSession) return fail('No active session on this table', 409);

    const session = sourceTable.currentSession as any;
    const now = new Date();
    const loser = (body.loser ?? '').trim().slice(0, 100);

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
        framesPlayed: session.framesPlayed,
        framePrice: session.framePrice,
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
      // Case-insensitive lookup — "Ali Raza" and "ali raza" are the same person.
      // Store the name as-typed (preserves casing for display).
      const nameRegex = new RegExp(`^${loser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      let account = await CustomerAccount.findOne({ customerName: nameRegex });
      if (!account) {
        // New customer — give them their own customerId (not the session owner's)
        account = await CustomerAccount.create({
          customerId: nanoid(8),
          customerName: loser, // store as-typed, not lowercased
          balance: 0,
          totalCharged: 0,
          totalPaid: 0,
          transactions: [],
        });
      }

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

      // Also write a RevenueLog so this round's revenue appears in
      // Financial Reports and daily reconciliation. Without this,
      // Bill-Now revenue is invisible to the reports API.
      const { businessDate } = await import('@/lib/billing');
      const activeShift = await Shift.findOne({ status: 'active' });
      await RevenueLog.create({
        date: businessDate(now),
        tableNumber: sourceTable.tableNumber,
        isPrivateRoom: sourceTable.isPrivateRoom,
        customerId: account.customerId ?? null,
        customerName: loser,
        tableRentalRevenue: bill.tableTotal,
        menuSalesRevenue: bill.foodTotal,
        totalRevenue: roundTotal,
        pricingType: session.pricingType,
        startTime: session.startTime,
        endTime: now,
        closedBy: 'System (Bill Now)',
        shiftId: activeShift?._id ?? null,
        items: (session.activeOrders ?? []).map((o: any) => ({
          itemName: o.itemName,
          quantity: o.quantity,
          price: o.price,
          isComp: o.isComp ?? false,
          compReason: '',
          discountPercent: o.discountPercent ?? 0,
          lineTotal: o.price * o.quantity * (o.isComp ? 0 : (1 - (o.discountPercent ?? 0) / 100)),
        })),
        compTotal: bill.compTotal ?? 0,
        discountTotal: bill.discountTotal ?? 0,
        settlements: [{
          type: 'account',
          amount: roundTotal,
          description: `Charged to ${loser}'s account via Bill Now`,
          staffName: 'System',
          date: now,
        }],
        accumulatedCharges: [],
      });
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
    // Use findOneAndUpdate with a session guard to prevent double-freeze:
    // if another request already processed this session, the update will
    // fail (session changed) and we return 409 instead of silently
    // duplicating the accumulated charge.
    const newSession = {
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

    // Guard: only update if this table is still occupied AND the session
    // hasn't changed since we read it (startTime is unique per session).
    const savedTable = await Table.findOneAndUpdate(
      { _id: targetTable._id, status: 'occupied', 'currentSession.startTime': session.startTime },
      { $set: { currentSession: newSession } },
      { new: true }
    );
    if (!savedTable) {
      return fail('This session was already closed or modified by another action. Please refresh.', 409);
    }

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
