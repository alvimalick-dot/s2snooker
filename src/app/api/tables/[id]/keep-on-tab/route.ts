import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import { ok, fail } from '@/lib/utils';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/keep-on-tab — keep current game running, start fresh on target
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
// }
//
// Key behavior: the source table's session is NOT modified at all.
// Its timer keeps ticking. A new session is created on the target table
// with a shared chainId linking them. End Session on any table in the
// chain will end ALL tables.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();

    if (!body.gameType) return fail('gameType is required');
    if (typeof body.hourlyRate !== 'number' || body.hourlyRate <= 0) return fail('hourlyRate must be a positive number');
    if (body.flatPrice != null && (typeof body.flatPrice !== 'number' || body.flatPrice < 0)) return fail('flatPrice must be a non-negative number');

    // Read the source table — must be occupied with an active session.
    const sourceTable = await Table.findOne({ _id: params.id, status: 'occupied' });
    if (!sourceTable) return fail('Table not found or already free', 404);
    if (!sourceTable.currentSession) return fail('No active session on this table', 409);

    const session = sourceTable.currentSession as any;
    const now = new Date();

    // ── Determine chainId ──────────────────────────────────────
    // If this session already belongs to a chain, reuse the same chainId.
    // Otherwise, create a new one.
    const chainId = session.chainId ?? nanoid(12);

    // ── Determine target table ─────────────────────────────────
    const moving = body.targetTableId && body.targetTableId !== params.id;
    let targetTable = sourceTable;

    if (moving) {
      // Claim the target table — only succeed if it's not occupied.
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
    }

    // ── Build new session on target table ──────────────────────
    // The source table is NOT touched — its timer keeps running.
    const newSession = {
      customerId: session.customerId,
      customerName: session.customerName,
      loser: '',
      additionalPlayers: session.additionalPlayers,
      accumulatedCharges: [],
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
      // Chain tracking
      chainId,
      sourceTableId: params.id,
    } as any;

    // Write the new session to the target table.
    // Guard: only write if the target is occupied (we just claimed it, so it should be).
    const savedTarget = await Table.findOneAndUpdate(
      { _id: targetTable._id, status: 'occupied', currentSession: null },
      { $set: { currentSession: newSession } },
      { new: true }
    );
    if (!savedTarget) {
      // Something went wrong — another request may have taken the table.
      // Try to free it back if we just claimed it.
      if (moving) {
        await Table.findOneAndUpdate(
          { _id: targetTable._id, status: 'occupied' },
          { $set: { status: 'available', currentSession: null } }
        );
      }
      return fail('Failed to start game on target table — it may have been taken', 409);
    }

    // ── If the source session didn't have a chainId yet, add it ─
    // This ensures the source table also has the chainId for End Session to find.
    if (!session.chainId) {
      await Table.findOneAndUpdate(
        { _id: sourceTable._id, status: 'occupied', 'currentSession.startTime': session.startTime },
        { $set: { 'currentSession.chainId': chainId } }
      );
    }

    return ok({
      chainId,
      sourceTable: {
        tableNumber: sourceTable.tableNumber,
        label: sourceTable.label,
      },
      targetTable: {
        tableNumber: targetTable.tableNumber,
        label: targetTable.label,
      },
    });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to start new game', 500);
  }
}
