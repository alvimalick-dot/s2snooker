import { connectDB } from '@/lib/mongodb';
import CustomerAccount from '@/models/CustomerAccount';
import RevenueLog from '@/models/RevenueLog';
import Shift from '@/models/Shift';
import Table from '@/models/Table';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/reset-data
 *
 * Body (JSON):
 *   target: 'revenue' | 'customers' | 'both'
 *   from?: string   (ISO date, inclusive — defaults to earliest)
 *   to?: string     (ISO date, inclusive — defaults to today)
 *
 * For 'revenue':  deletes RevenueLog docs whose `date` falls in [from, to].
 * For 'customers': deletes CustomerAccount docs whose `createdAt` falls in [from, to].
 * For 'both':     does both of the above.
 *
 * Also resets any occupied/reserved tables back to available when clearing revenue.
 */
export async function POST(req: Request) {
  try {
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const target: string = body.target ?? 'both';
    const fromStr: string | undefined = body.from;
    const toStr: string | undefined = body.to;

    // Build the date range filter
    const fromDate = fromStr ? new Date(fromStr) : undefined;
    const toDate = toStr ? new Date(toStr) : undefined;

    // Normalize: "to" is end-of-day (23:59:59.999) so it's truly inclusive
    if (toDate) {
      toDate.setHours(23, 59, 59, 999);
    }

    const dateFilter: Record<string, any> = {};
    if (fromDate || toDate) {
      dateFilter.$and = [];
      if (fromDate) dateFilter.$and.push({ date: { $gte: fromDate } });
      if (toDate) dateFilter.$and.push({ date: { $lte: toDate } });
      // If only one bound, simplify
      if (dateFilter.$and.length === 1) {
        const clause = dateFilter.$and[0];
        delete dateFilter.$and;
        Object.assign(dateFilter, clause);
      }
      if (dateFilter.$and?.length === 0) delete dateFilter.$and;
    }

    const result: Record<string, any> = {};

    if (target === 'revenue' || target === 'both') {
      const revenueResult = await RevenueLog.deleteMany(dateFilter);
      result.revenueLogsDeleted = revenueResult.deletedCount;

      // Also reset tables that were occupied — clear sessions
      const tableResult = await Table.updateMany(
        { status: { $in: ['occupied', 'reserved'] } },
        { $set: { status: 'available', currentSession: null, reservation: null } },
      );
      result.tablesReset = tableResult.modifiedCount;
    }

    if (target === 'customers' || target === 'both') {
      // For customer accounts we filter by createdAt if dates are provided
      const custFilter: Record<string, any> = {};
      if (fromDate || toDate) {
        custFilter.$and = [];
        if (fromDate) custFilter.$and.push({ createdAt: { $gte: fromDate } });
        if (toDate) custFilter.$and.push({ createdAt: { $lte: toDate } });
        if (custFilter.$and.length === 1) {
          const clause = custFilter.$and[0];
          delete custFilter.$and;
          Object.assign(custFilter, clause);
        }
        if (custFilter.$and?.length === 0) delete custFilter.$and;
      }

      const custResult = await CustomerAccount.deleteMany(custFilter);
      result.customerAccountsDeleted = custResult.deletedCount;
    }

    return ok({
      message: `Data reset complete (target: ${target}).`,
      ...result,
      dateRange: {
        from: fromDate?.toISOString() ?? 'earliest',
        to: toDate?.toISOString() ?? 'latest',
      },
    });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to reset data', 500);
  }
}
