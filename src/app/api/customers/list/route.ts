import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import RevenueLog from '@/models/RevenueLog';
import CustomerAccount from '@/models/CustomerAccount';
import { ok, fail } from '@/lib/utils';
import { computeSessionBill } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/** Normalize a name for grouping: trimmed lowercase. */
function normName(s: string): string {
  return (s ?? '').trim().toLowerCase();
}

/**
 * Compute payment status for a closed session by comparing totalRevenue to
 * the sum of settlement amounts.  Settlements with negative amounts (discounts,
 * comps) are excluded from the "paid" total — only positive payments count.
 */
function computePaymentStatus(
  totalRevenue: number,
  settlements: { type: string; amount: number }[]
): 'paid' | 'partial' | 'unpaid' {
  const paidAmount = settlements.reduce((sum, s) => {
    if (s.amount > 0) return sum + s.amount;
    return sum;
  }, 0);
  if (paidAmount >= totalRevenue && totalRevenue > 0) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'unpaid';
}

// GET /api/customers/list?tab=active|paid|all&date=2026-08-28
//
// Active = customers currently sitting at occupied tables (live sessions)
// Paid = customers whose sessions have ended (in RevenueLog for that date)
// All = both active + paid for that date
//
// Returns:
//   customers: [...for the requested tab...],
//   counts: { active, paid, all },
//   tab, date
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = req.nextUrl;
    const tab = searchParams.get('tab') ?? 'active';
    const dateStr = searchParams.get('date');

    // Default to today
    const now = new Date();
    const targetDate = dateStr ? new Date(dateStr + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateEnd = new Date(targetDate);
    dateEnd.setHours(23, 59, 59, 999);

    const results: any[] = [];
    const seen = new Set<string>(); // keys are customerId or normalized name

    // === ACTIVE: currently occupied tables ===
    const occupiedTables = await Table.find({
      status: 'occupied',
    }).lean();

    let activeCount = 0;

    for (const t of occupiedTables as any[]) {
      const session = t.currentSession;
      if (!session) continue;
      const name = (session.customerName ?? '').trim();
      const cid = session.customerId || normName(name) || `unknown_${t.tableNumber}`;
      activeCount++;

      const bill = computeSessionBill({
        startTime: session.startTime,
        billingMode: session.billingMode,
        pricingType: session.pricingType,
        hourlyRate: session.hourlyRate,
        flatPrice: session.flatPrice,
        durationMinutes: session.durationMinutes,
        overtimeRate: session.overtimeRate,
        gracePeriodMinutes: session.gracePeriodMinutes,
        flatSurcharge: session.flatSurcharge,
        minimumMinutes: session.minimumMinutes,
        activeOrders: session.activeOrders,
        pausedDurationMs: session.pausedDurationMs,
        isPaused: session.isPaused,
        pauseStartedAt: session.pauseStartedAt,
      });

      // Group by customerId (or normalized name for legacy records)
      const key = cid;
      if (seen.has(key)) {
        const existing = results.find((r) => r._groupKey === key);
        if (existing) {
          existing.tables.push({
            tableNumber: t.tableNumber,
            label: t.label,
            isPrivateRoom: t.isPrivateRoom,
            startTime: session.startTime,
            elapsedMs: bill.elapsedMs,
            currentBill: bill.total,
            gameType: session.gameType ?? session.pricingType,
            hourlyRate: session.hourlyRate,
            flatPrice: session.flatPrice,
            durationMinutes: session.durationMinutes,
            overtimeRate: session.overtimeRate,
            billingMode: session.billingMode,
            activeOrders: session.activeOrders,
          });
          existing.totalBill += bill.total;
        }
      } else {
        seen.add(key);
        const account = await CustomerAccount.findOne(
          session.customerId ? { customerId: session.customerId } : { customerName: name }
        ).lean();
        results.push({
          _groupKey: key,
          customerId: session.customerId ?? null,
          customerName: name || `Guest #${cid.slice(0, 6)}`,
          status: 'active',
          paymentStatus: null,
          tables: [{
            tableNumber: t.tableNumber,
            label: t.label,
            isPrivateRoom: t.isPrivateRoom,
            startTime: session.startTime,
            elapsedMs: bill.elapsedMs,
            currentBill: bill.total,
            gameType: session.gameType ?? session.pricingType,
            hourlyRate: session.hourlyRate,
            flatPrice: session.flatPrice,
            durationMinutes: session.durationMinutes,
            overtimeRate: session.overtimeRate,
            billingMode: session.billingMode,
            activeOrders: session.activeOrders,
          }],
          totalBill: bill.total,
          accountBalance: (account as any)?.balance ?? 0,
          totalPaid: (account as any)?.totalPaid ?? 0,
        });
      }
    }

    // === ENDED sessions from RevenueLog ===
    const logs = await RevenueLog.find({
      date: { $gte: targetDate, $lte: dateEnd },
    }).sort({ startTime: -1 }).lean();

    // Group by customerId (fallback to normalized name)
    const customerMap = new Map<string, any>();

    for (const log of logs as any[]) {
      const cid = log.customerId || normName(log.customerName) || null;
      const name = (log.customerName ?? '').trim();
      if (!cid && !name) continue;

      const key = cid || normName(name);
      const paymentStatus = computePaymentStatus(log.totalRevenue, log.settlements ?? []);

      const sessionEntry = {
        tableNumber: log.tableNumber,
        isPrivateRoom: log.isPrivateRoom,
        startTime: log.startTime,
        endTime: log.endTime,
        tableRentalRevenue: log.tableRentalRevenue,
        menuSalesRevenue: log.menuSalesRevenue,
        totalRevenue: log.totalRevenue,
        pricingType: log.pricingType,
        closedBy: log.closedBy,
        items: log.items ?? [],
        settlements: log.settlements ?? [],
        paymentStatus,
      };

      if (customerMap.has(key)) {
        const c = customerMap.get(key);
        c.sessions.push(sessionEntry);
        c.totalSpent += log.totalRevenue;
        // If any session is unpaid/partial, show the worst status
        if (paymentStatus === 'unpaid') c.paymentStatus = 'unpaid';
        else if (paymentStatus === 'partial' && c.paymentStatus !== 'unpaid') c.paymentStatus = 'partial';
        // Merge customer names: prefer non-empty
        if (name && !c.customerName) c.customerName = name;
      } else {
        customerMap.set(key, {
          _groupKey: key,
          customerId: cid,
          customerName: name || `Guest #${(cid ?? '').slice(0, 6)}`,
          status: 'ended',
          paymentStatus,
          sessions: [sessionEntry],
          totalSpent: log.totalRevenue,
        });
      }
    }

    // Build paid list
    const paidResults: any[] = [];
    for (const [key, entry] of customerMap) {
      if (seen.has(key)) {
        // Already active — merge ended sessions into the active entry
        const activeEntry = results.find((r) => r._groupKey === key);
        if (activeEntry) {
          activeEntry.sessions = entry.sessions;
          activeEntry.totalSpent = entry.totalSpent;
          if (entry.paymentStatus === 'unpaid') activeEntry.paymentStatus = 'unpaid';
          else if (entry.paymentStatus === 'partial' && activeEntry.paymentStatus !== 'unpaid') activeEntry.paymentStatus = 'partial';
        }
        continue;
      }
      seen.add(key);
      const account = await CustomerAccount.findOne(
        entry.customerId ? { customerId: entry.customerId } : { customerName: entry.customerName }
      ).lean();
      entry.accountBalance = (account as any)?.balance ?? 0;
      entry.totalPaid = (account as any)?.totalPaid ?? 0;
      results.push(entry);
      paidResults.push(entry);
    }

    // Compute counts for all three tabs
    // "ended" customers are those whose sessions are all in RevenueLog (not active)
    const endedCount = paidResults.length;
    const allCount = activeCount + endedCount;

    // Filter results based on the requested tab
    let filteredCustomers: any[];
    if (tab === 'active') {
      filteredCustomers = results.filter((r) => r.status === 'active');
    } else if (tab === 'paid') {
      filteredCustomers = paidResults;
    } else {
      filteredCustomers = results;
    }

    // Clean up internal _groupKey
    for (const c of filteredCustomers) {
      delete c._groupKey;
    }

    return ok({
      customers: filteredCustomers,
      counts: { active: activeCount, paid: endedCount, all: allCount },
      tab,
      date: dateStr ?? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10),
    });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to load customers', 500);
  }
}
