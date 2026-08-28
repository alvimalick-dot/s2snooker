import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import RevenueLog from '@/models/RevenueLog';
import Table from '@/models/Table';
import { fail, computeSessionBill, businessDate } from '@/lib/utils';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/reports?from=2026-08-01&to=2026-08-28&format=json|csv
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const format = searchParams.get('format') ?? 'json';

    const query: Record<string, unknown> = {};
    if (from || to) {
      query.date = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(to ? { $lte: new Date(new Date(to).setHours(23, 59, 59, 999)) } : {}),
      };
    }

    const logs = await RevenueLog.find(query).sort({ date: 1 }).lean();

    const totals = logs.reduce(
      (acc, log) => {
        acc.tableRentalRevenue += log.tableRentalRevenue;
        acc.menuSalesRevenue += log.menuSalesRevenue;
        acc.totalRevenue += log.totalRevenue;
        if (log.isPrivateRoom) acc.roomRentalRevenue += log.tableRentalRevenue;
        return acc;
      },
      { tableRentalRevenue: 0, roomRentalRevenue: 0, menuSalesRevenue: 0, totalRevenue: 0 }
    );

    const openTables = await Table.find({ status: 'occupied' }).lean();

    // A table that's still open hasn't been cashed out yet, so it has no
    // RevenueLog row and was invisible to `totals` above. If the requested
    // range covers today, fold each open table's live running bill (table
    // charge + snacks so far) into the totals too, so "Today's Total
    // Revenue" reflects money actually on the felt right now, not just cash
    // already collected. Outside of today's range (e.g. a report for last
    // week) we leave totals as pure closed-and-cashed-out numbers.
    const todayInRange =
      (!from && !to) ||
      (businessDate() >= businessDate(from ?? to!) && businessDate() <= businessDate(to ?? from!));

    let liveOpenRevenue = { tableRentalRevenue: 0, roomRentalRevenue: 0, menuSalesRevenue: 0, totalRevenue: 0 };
    if (todayInRange) {
      for (const t of openTables as any[]) {
        if (!t.currentSession) continue;
        const bill = computeSessionBill({
          startTime: t.currentSession.startTime,
          pricingType: t.currentSession.pricingType,
          hourlyRate: t.currentSession.hourlyRate,
          flatPrice: t.currentSession.flatPrice,
          durationMinutes: t.currentSession.durationMinutes,
          overtimeRate: t.currentSession.overtimeRate,
          gracePeriodMinutes: t.currentSession.gracePeriodMinutes,
          flatSurcharge: t.currentSession.flatSurcharge,
          minimumMinutes: t.currentSession.minimumMinutes,
          activeOrders: t.currentSession.activeOrders,
          pausedDurationMs: t.currentSession.pausedDurationMs,
          isPaused: t.currentSession.isPaused,
          pauseStartedAt: t.currentSession.pauseStartedAt,
        });
        // Include accumulated charges from previous games in this session
        const acc = t.currentSession.accumulatedCharges ?? [];
        const accGameTotal = acc.reduce((sum: number, c: any) => sum + c.gameTotal, 0);
        const accFoodTotal = acc.reduce((sum: number, c: any) => sum + c.foodTotal, 0);
        liveOpenRevenue.tableRentalRevenue += bill.tableTotal + accGameTotal;
        liveOpenRevenue.menuSalesRevenue += bill.foodTotal + accFoodTotal;
        liveOpenRevenue.totalRevenue += bill.total + accGameTotal + accFoodTotal;
        if (t.isPrivateRoom) liveOpenRevenue.roomRentalRevenue += bill.tableTotal + accGameTotal;
      }
      totals.tableRentalRevenue += liveOpenRevenue.tableRentalRevenue;
      totals.roomRentalRevenue += liveOpenRevenue.roomRentalRevenue;
      totals.menuSalesRevenue += liveOpenRevenue.menuSalesRevenue;
      totals.totalRevenue += liveOpenRevenue.totalRevenue;
    }

    if (format === 'csv') {
      const header = [
        'Date',
        'Table',
        'Private Room',
        'Customer',
        'Pricing Type',
        'Table Revenue',
        'Menu Revenue',
        'Total Revenue',
        'Start',
        'End',
      ].join(',');

      const rows = logs.map((l) =>
        [
          new Date(l.date).toISOString().slice(0, 10),
          l.tableNumber,
          l.isPrivateRoom ? 'Yes' : 'No',
          `"${(l.customerName ?? '').replace(/"/g, '""')}"`,
          l.pricingType,
          l.tableRentalRevenue,
          l.menuSalesRevenue,
          l.totalRevenue,
          l.startTime ? new Date(l.startTime).toISOString() : '',
          l.endTime ? new Date(l.endTime).toISOString() : '',
        ].join(',')
      );

      const csv = [header, ...rows].join('\n');

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="revenue-report-${from ?? 'all'}-to-${to ?? 'all'}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { logs, totals, openTablesCount: openTables.length, liveOpenRevenue: todayInRange ? liveOpenRevenue : null },
    });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to generate report', 500);
  }
}
