import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import RevenueLog from '@/models/RevenueLog';
import Table from '@/models/Table';
import CustomerAccount from '@/models/CustomerAccount';
import { fail } from '@/lib/utils';
import { computeSessionBill } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/** Normalize a name for consistent grouping: trimmed, lowercase. */
function normName(s: string): string {
  return (s ?? '').trim().toLowerCase();
}

// GET /api/customers/history?name=...&id=...  -> full chronological audit trail for one customer
// GET /api/customers/history?suggest=1&q=partial  -> distinct customer-name suggestions for search-as-you-type
//
// When `id` (customerId) is provided, lookups use the stable ID instead of
// name matching — this prevents two different customers named "Ahmed" from
// being merged into one history trail.
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = req.nextUrl;
    const name = searchParams.get('name');
    const customerId = searchParams.get('id');
    const suggest = searchParams.get('suggest');
    const q = searchParams.get('q') ?? '';
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (suggest) {
      const regex = q ? new RegExp(q.trim(), 'i') : /.*/;
      const [closedNames, openTables] = await Promise.all([
        RevenueLog.distinct('customerName', { customerName: { $regex: regex, $ne: '' } }),
        Table.find({ status: 'occupied', 'currentSession.customerName': { $regex: regex, $ne: '' } })
          .select('currentSession.customerName')
          .lean(),
      ]);
      const names = new Set<string>(closedNames as string[]);
      for (const t of openTables) {
        const n = (t as any).currentSession?.customerName;
        if (n) names.add(n);
      }
      return NextResponse.json({ success: true, data: Array.from(names).sort().slice(0, 15) });
    }

    if (!customerId && (!name || !name.trim())) return fail('name or id query param is required');
    const trimmed = (name ?? '').trim();

    // Build the date range filter
    const dateFilter: Record<string, unknown> = {};
    if (from || to) {
      dateFilter.date = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(to ? { $lte: new Date(new Date(to).setHours(23, 59, 59, 999)) } : {}),
      };
    }

    let closedLogs: any[];

    if (customerId) {
      // Precise lookup: all sessions for this customerId (ignores name
      // collisions).
      closedLogs = await RevenueLog.find({ customerId, ...dateFilter })
        .sort({ startTime: 1 })
        .lean();
    } else {
      // Legacy fallback: match by name (case-insensitive exact match).
      const nameRegex = new RegExp(`^${escapeRegex(trimmed)}$`, 'i');
      const query: Record<string, unknown> = {
        $or: [
          { customerName: nameRegex },
          { 'items': { $elemMatch: { customerName: nameRegex } } },
        ],
        ...dateFilter,
      };

      closedLogs = await RevenueLog.find(query).sort({ startTime: 1 }).lean();

      // Also find sessions where this name appears in additionalPlayers
      const additionalLogs = await RevenueLog.find({
        additionalPlayers: nameRegex,
        ...dateFilter,
      }).sort({ startTime: 1 }).lean();

      // Merge and deduplicate
      const allLogIds = new Set(closedLogs.map((l: any) => String(l._id)));
      for (const log of additionalLogs) {
        if (!allLogIds.has(String(log._id))) {
          closedLogs.push(log as any);
          allLogIds.add(String(log._id));
        }
      }
      closedLogs.sort((a: any, b: any) => new Date(a.startTime ?? 0).getTime() - new Date(b.startTime ?? 0).getTime());
    }

    // Any table this customer is STILL playing on right now
    let openTables: any[];
    if (customerId) {
      openTables = await Table.find({
        status: 'occupied',
        'currentSession.customerId': customerId,
      }).lean();
    } else {
      const nameRegex = new RegExp(`^${escapeRegex(trimmed)}$`, 'i');
      openTables = await Table.find({
        status: 'occupied',
        $or: [
          { 'currentSession.customerName': nameRegex },
          { 'currentSession.additionalPlayers': nameRegex },
        ],
      }).lean();
    }

    const activeSessions = openTables.map((t: any) => {
      const bill = computeSessionBill({
        startTime: t.currentSession.startTime,
        billingMode: t.currentSession.billingMode,
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
      return {
        tableNumber: t.tableNumber,
        isPrivateRoom: t.isPrivateRoom,
        label: t.label,
        startTime: t.currentSession.startTime,
        pricingType: t.currentSession.pricingType,
        items: t.currentSession.activeOrders.map((o: any) => ({
          itemName: o.itemName,
          quantity: o.quantity,
          price: o.price,
        })),
        tableRentalRevenue: bill.tableTotal,
        menuSalesRevenue: bill.foodTotal,
        totalRevenue: bill.total,
        status: 'in_progress' as const,
      };
    });

    // Fetch the customer's account tab
    const account = customerId
      ? await CustomerAccount.findOne({ customerId }).lean()
      : await CustomerAccount.findOne({ customerName: normName(trimmed) }).lean();

    return NextResponse.json({
      success: true,
      data: {
        customerName: trimmed || (closedLogs[0] as any)?.customerName || (activeSessions[0] ? openTables[0]?.currentSession?.customerName : ''),
        customerId,
        records: closedLogs,
        activeSessions,
        account: account ?? null,
      },
    });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to load customer history', 500);
  }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// PATCH /api/customers/history — add a settlement (payment) to a RevenueLog
// body: { logId: string, type: 'cash'|'card'|'account', amount: number, staffName?: string }
export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { logId, type = 'cash', amount, staffName = '', description = '' } = body;

    if (!logId || amount == null || amount <= 0) {
      return fail('logId and a positive amount are required');
    }

    const log = await RevenueLog.findById(logId);
    if (!log) return fail('Revenue log not found', 404);

    const settlement = {
      type,
      amount: Number(amount),
      description: description || `Marked as paid`,
      staffName,
      date: new Date(),
    };

    log.settlements.push(settlement as any);
    await log.save();

    return NextResponse.json({ success: true, data: { logId, settlement } });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to record payment', 500);
  }
}
