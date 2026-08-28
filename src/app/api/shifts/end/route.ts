import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Shift from '@/models/Shift';
import RevenueLog from '@/models/RevenueLog';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/shifts/end — close the active shift and reconcile cash
// body: { endingCash: number, notes?: string }
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    const shift = await Shift.findOne({ status: 'active' });
    if (!shift) return fail('No active shift to end', 404);

    // Calculate expected CASH from all RevenueLog entries during this shift.
    // We only count cash settlements — card/account/comp payments don't go
    // through the drawer, so including them would make the reconciliation
    // always show "short" whenever a customer pays by card or tab.
    const logs = await RevenueLog.find({
      shiftId: shift._id,
    }).lean();

    let expectedCash = 0;
    let totalRevenue = 0;
    let cashRevenue = 0;
    let cardRevenue = 0;
    let accountRevenue = 0;
    let compRevenue = 0;

    for (const log of logs) {
      totalRevenue += log.totalRevenue ?? 0;
      // Sum cash settlements for this log entry
      const cashSettled = (log.settlements ?? [])
        .filter((s: any) => s.type === 'cash')
        .reduce((sum: number, s: any) => sum + Math.abs(s.amount), 0);
      // If no settlements recorded, assume cash (backward compat for old logs)
      const hasSettlements = (log.settlements ?? []).length > 0;
      const cashForThisLog = hasSettlements ? cashSettled : (log.totalRevenue ?? 0);
      cashRevenue += cashForThisLog;
      expectedCash += cashForThisLog;

      // Track other payment types for the summary
      for (const s of (log.settlements ?? []) as any[]) {
        if (s.type === 'card') cardRevenue += Math.abs(s.amount);
        else if (s.type === 'account') accountRevenue += Math.abs(s.amount);
        else if (s.type === 'comp') compRevenue += Math.abs(s.amount);
      }
    }

    const endingCash = typeof body.endingCash === 'number' ? body.endingCash : 0;
    const difference = endingCash - expectedCash;

    shift.endedAt = new Date();
    shift.endingCash = endingCash;
    shift.expectedCash = expectedCash;
    shift.difference = difference;
    shift.status = 'closed';
    shift.notes = body.notes ?? '';
    await shift.save();

    return ok({
      shift,
      summary: {
        staffName: shift.staffName,
        duration: Math.round((shift.endedAt.getTime() - shift.startedAt.getTime()) / 60000),
        sessionCount: logs.length,
        totalRevenue,
        cashRevenue,
        cardRevenue,
        accountRevenue,
        compRevenue,
        expectedCash,
        endingCash,
        difference,
        startingCash: shift.startingCash,
      },
    });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to end shift', 500);
  }
}
