'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useClock } from '@/lib/useClock';
import ModalShell from './ModalShell';

function formatTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

type Tab = 'active' | 'paid' | 'all';

interface CustomerEntry {
  customerId?: string | null;
  customerName: string;
  status: string;
  paymentStatus?: 'paid' | 'partial' | 'unpaid' | null;
  tables?: { tableNumber: number; label?: string; isPrivateRoom: boolean; startTime?: string; elapsedMs?: number; currentBill?: number; gameType?: string; hourlyRate?: number; flatPrice?: number; durationMinutes?: number; overtimeRate?: number; billingMode?: string; activeOrders?: any[]; pausedDurationMs?: number }[];
  sessions?: { tableNumber: number; isPrivateRoom: boolean; startTime?: string; endTime?: string; tableRentalRevenue?: number; menuSalesRevenue?: number; totalRevenue: number; pricingType?: string; closedBy: string; items?: any[]; settlements?: any[]; paymentStatus: 'paid' | 'partial' | 'unpaid'; _id?: string; accumulatedCharges?: { tableNumber: number; gameType: string; gameTotal: number; foodTotal: number; elapsedMinutes: number; startTime: string; endTime: string }[] }[];
  totalBill?: number;
  totalSpent?: number;
  accountBalance?: number;
  totalPaid?: number;
}

interface ListResponse {
  customers: CustomerEntry[];
  counts: { active: number; paid: number; all: number };
  tab: string;
  date: string;
}

function StatusDot({ status }: { status: string }) {
  if (status === 'active') {
    return <span className="relative flex h-3 w-3 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-available opacity-40" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-available shadow-[0_0_6px_rgba(22,163,74,0.5)]" />
    </span>;
  }
  return <span className="w-3 h-3 rounded-full bg-slate-500 shrink-0" />;
}

function PaymentBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === 'paid') return null;
  const styles = status === 'unpaid'
    ? 'bg-occupied-bg text-occupied border-occupied/20'
    : 'bg-reserved-bg text-reserved border-reserved/20';
  const label = status === 'unpaid' ? 'Unpaid' : 'Partial';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${styles}`}>
      {status === 'unpaid' ? '⚠' : '◐'} {label}
    </span>
  );
}

function LiveTimerChip({ startTime }: { startTime: string }) {
  const now = useClock(1000);
  const elapsedMs = Math.max(0, new Date(now).getTime() - new Date(startTime).getTime());
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-available-bg border border-available/20 px-2.5 py-0.5 font-mono text-sm font-bold text-available tabular-nums">
      <span className="w-1.5 h-1.5 rounded-full bg-available animate-pulse" />
      {formatElapsed(elapsedMs)}
    </span>
  );
}

export default function CustomerHistory() {
  const [tab, setTab] = useState<Tab>('active');
  const [date, setDate] = useState(todayStr());
  const [customers, setCustomers] = useState<CustomerEntry[]>([]);
  const [counts, setCounts] = useState({ active: 0, paid: 0, all: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<ListResponse>(`/api/customers/list?tab=${tab}&date=${date}`);
      setCustomers(result.customers);
      setCounts(result.counts);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load customers');
      setCustomers([]);
      setCounts({ active: 0, paid: 0, all: 0 });
    } finally {
      setLoading(false);
    }
  }, [tab, date]);

  useEffect(() => { load(); setSelectedCustomer(null); }, [load]);

  useEffect(() => {
    if (tab !== 'active') return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [tab, load]);

  function shiftDate(delta: number) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setDate(`${y}-${m}-${day}`);
  }

  const isToday = date === todayStr();

  return (
    <div className="bg-surface-card rounded-2xl border border-surface-border p-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xl font-extrabold text-ink">Customer Accounts</div>
        <button onClick={load}
          className="text-sm text-slate-400 hover:text-white px-4 py-2 rounded-xl border-2 border-surface-border hover:bg-slate-700 font-semibold transition-colors active:scale-[0.97]">
          ↻ Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 mb-4 bg-slate-800 rounded-2xl p-1.5">
        {([
          ['active', 'Active', counts.active, 'bg-available text-white shadow-md'],
          ['paid', 'Ended', counts.paid, 'bg-brass text-slate-900 shadow-md'],
          ['all', 'All', counts.all, 'bg-white text-slate-900 shadow-md'],
        ] as [Tab, string, number, string][]).map(([key, label, count, activeStyle]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wide transition-all ${
              tab === key ? activeStyle : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Date picker */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => shiftDate(-1)}
          className="w-10 h-10 rounded-xl bg-slate-800 border-2 border-surface-border flex items-center justify-center text-slate-400 hover:text-white text-lg font-bold transition-colors">‹</button>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl bg-slate-800 border-2 border-surface-border px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brass transition-colors [color-scheme:dark]"
          />
          {!isToday && (
            <button onClick={() => setDate(todayStr())}
              className="text-sm text-brass hover:text-brass-light font-bold px-3 py-2 rounded-xl hover:bg-brass-bg transition-colors">
              Today
            </button>
          )}
        </div>
        <button onClick={() => shiftDate(1)}
          className="w-10 h-10 rounded-xl bg-slate-800 border-2 border-surface-border flex items-center justify-center text-slate-400 hover:text-white text-lg font-bold transition-colors">›</button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-occupied bg-occupied-bg border-2 border-occupied/20 rounded-xl px-4 py-3 text-sm font-semibold mb-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!selectedCustomer ? (
          <List
            customers={customers}
            loading={loading}
            tab={tab}
            date={date}
            onSelect={setSelectedCustomer}
          />
        ) : selectedCustomer.status === 'active' ? (
          <ActiveDetail
            customer={selectedCustomer}
            onBack={() => setSelectedCustomer(null)}
          />
        ) : (
          <BillPopup
            customer={selectedCustomer}
            onClose={() => setSelectedCustomer(null)}
            onPaid={() => { setSelectedCustomer(null); load(); }}
          />
        )}
      </div>
    </div>
  );
}

// ── List View ───────────────────────────────────────────────────
function List({ customers, loading, tab, date, onSelect }: {
  customers: CustomerEntry[];
  loading: boolean;
  tab: Tab;
  date: string;
  onSelect: (c: CustomerEntry) => void;
}) {
  return (
    <div className="space-y-2">
      {loading && (
        <div className="py-12 text-center">
          <div className="inline-flex items-center gap-2 text-slate-400 text-sm">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            Loading customers…
          </div>
        </div>
      )}

      {!loading && customers.length === 0 && (
        <div className="py-12 text-center">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-slate-800 items-center justify-center mb-3">
            {tab === 'active' ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M8 12h8"/></svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
            )}
          </div>
          <div className="text-base font-bold text-slate-400 mb-1">
            {tab === 'active' ? 'No active customers' :
             tab === 'paid' ? 'No ended sessions' : 'No customers yet'}
          </div>
          <div className="text-sm text-slate-400">
            {tab === 'active' ? 'All tables are available. Start a session from the floor view.' :
             tab === 'paid' ? `No sessions were ended on ${date}.` :
             `No activity on ${date}.`}
          </div>
        </div>
      )}

      {customers.map((c) => {
        const rowKey = c.customerId ?? c.customerName ?? `unknown-${Math.random()}`;
        const isActive = c.status === 'active';
        return (
          <button
            key={rowKey}
            onClick={() => onSelect(c)}
            className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3.5 text-left transition-all active:scale-[0.99] ${
              isActive
                ? 'border-available/30 bg-available-bg hover:border-available/50 shadow-sm'
                : 'border-surface-border bg-slate-800 hover:border-slate-500'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <StatusDot status={c.status} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-base font-bold ${isActive ? 'text-ink' : 'text-slate-300'}`}>{c.customerName}</span>
                  <PaymentBadge status={c.paymentStatus} />
                </div>
                <div className="text-sm text-slate-400 font-semibold mt-0.5">
                  {isActive ? (
                    <span className="flex items-center gap-2">
                      <span>{c.tables?.map((t) => `T${t.tableNumber}`).join(', ')}</span>
                      {c.tables?.[0]?.elapsedMs != null && c.tables[0].elapsedMs > 0 && (
                        <LiveTimerChip startTime={new Date(Date.now() - c.tables[0].elapsedMs).toISOString()} />
                      )}
                    </span>
                  ) : c.sessions ? (
                    <span>{c.sessions.length} session{c.sessions.length > 1 ? 's' : ''}</span>
                  ) : (
                    'No sessions'
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              {isActive ? (
                <div className="font-mono text-xl font-extrabold text-ink tabular-nums">
                  Rs {(c.totalBill ?? 0).toLocaleString()}
                </div>
              ) : c.totalSpent ? (
                <div className="font-mono text-base text-slate-400 font-semibold tabular-nums">
                  Rs {c.totalSpent.toLocaleString()}
                </div>
              ) : (
                <div className="text-sm text-slate-300">—</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Active Detail (inline, no modal) ───────────────────────────
function ActiveDetail({ customer, onBack }: { customer: CustomerEntry; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <button onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-brass hover:text-brass-light font-bold transition-colors">
        <span className="text-lg">←</span> Back to list
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <StatusDot status="active" />
        <div className="text-xl font-extrabold text-ink">{customer.customerName}</div>
        <span className="text-[11px] font-bold uppercase px-3 py-1 rounded-full bg-available-bg text-available border border-available/20">● Active</span>
      </div>

      {customer.tables?.map((t, i) => (
        <ActiveSessionCard key={i} table={t} />
      ))}
    </div>
  );
}

// ── Active Session Card ─────────────────────────────────────────
function ActiveSessionCard({ table }: { table: CustomerEntry['tables'] extends (infer T)[] | undefined ? Extract<T, object> : never }) {
  const now = useClock(1000);
  const startTime = table.startTime ? new Date(table.startTime).getTime() : 0;
  const liveElapsedMs = startTime > 0
    ? Math.max(0, new Date(now).getTime() - startTime)
    : (table.elapsedMs ?? 0);
  const gameLabel = (table.gameType ?? '').replace(/_/g, ' ');

  return (
    <div className="bg-available-bg border-2 border-available/20 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-available/5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-available animate-pulse" />
          <span className="text-base font-bold text-ink">{table.label ?? `Table ${table.tableNumber}`}</span>
        </div>
        <span className="font-mono text-2xl font-extrabold text-ink tabular-nums">
          Rs {(table.currentBill ?? 0).toLocaleString()}
        </span>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <DetailField label="Game" value={gameLabel || 'Unknown'} />
        <DetailField label="Elapsed" value={liveElapsedMs > 0 ? formatElapsed(liveElapsedMs) : '—'} mono />
        <DetailField label="Rate" value={
          table.hourlyRate
            ? `Rs ${table.hourlyRate.toLocaleString()}/hr`
            : table.flatPrice
              ? `Rs ${table.flatPrice} flat`
              : '—'
        } />
        {table.durationMinutes != null && table.durationMinutes > 0 && (
          <DetailField label="Included" value={`${table.durationMinutes} min`} />
        )}
      </div>
      {table.activeOrders && table.activeOrders.length > 0 && (
        <div className="border-t border-available/10 px-4 py-3">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Food Orders</div>
          <div className="flex flex-col gap-1">
            {table.activeOrders.map((o: any, j: number) => (
              <div key={j} className="flex items-center justify-between text-sm">
                <span className="text-ink">{o.quantity}× {o.itemName}</span>
                <span className="font-mono text-brass font-bold">Rs {(o.price * o.quantity).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ BILL POPUP (unified receipt for ended customers) ═══════════
function BillPopup({ customer, onClose, onPaid }: {
  customer: CustomerEntry;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [payBusy, setPayBusy] = useState<string | null>(null); // null or session _id being paid
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'account'>('cash');

  const sessions = customer.sessions ?? [];
  const accountBalance = customer.accountBalance ?? 0;
  const hasBalanceOnly = sessions.length === 0 && accountBalance > 0;
  const totalAll = sessions.reduce((sum, s) => sum + s.totalRevenue, 0);
  const totalPaid = sessions.reduce((sum, s) => {
    const paid = (s.settlements ?? []).reduce((ps: number, st: any) => st.amount > 0 ? ps + st.amount : ps, 0);
    return sum + paid;
  }, 0);
  const sessionRemaining = Math.max(0, totalAll - totalPaid);
  const totalRemaining = hasBalanceOnly ? accountBalance : sessionRemaining;
  const isFullyPaid = !hasBalanceOnly && sessionRemaining === 0 && totalAll > 0;

  function sessionRem(s: any) {
    const paid = (s.settlements ?? []).reduce((sum: number, st: any) => st.amount > 0 ? sum + st.amount : 0, 0);
    return Math.max(0, s.totalRevenue - paid);
  }

  // Pay a single session
  async function handlePaySession(s: any) {
    if (!s._id) return;
    const rem = sessionRem(s);
    if (rem <= 0) return;
    setPayBusy(s._id);
    try {
      await api.patch('/api/customers/history', {
        logId: s._id,
        type: payMethod,
        amount: rem,
      });
      onPaid();
    } catch (e: any) {
      alert(e.message ?? 'Failed to record payment');
    } finally {
      setPayBusy(null);
    }
  }

  // Pay all remaining sessions at once
  async function handlePayAll() {
    if (totalRemaining <= 0) return;
    setPayBusy('all');
    try {
      // Pay account balance first (from Bill Now charges)
      if (hasBalanceOnly && accountBalance > 0) {
        await api.patch('/api/customers/account', {
          customerId: customer.customerId,
          customerName: customer.customerName,
          amount: accountBalance,
          type: payMethod,
        });
      } else if (sessionRemaining > 0) {
        // Pay all unpaid sessions
        const unpaid = sessions.filter((s) => sessionRem(s) > 0 && s._id);
        const results = await Promise.allSettled(
          unpaid.map(async (s) => {
            await api.patch('/api/customers/history', {
              logId: s._id,
              type: payMethod,
              amount: sessionRem(s),
            });
          })
        );
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
          alert(`${failures.length} payment(s) failed. ${unpaid.length - failures.length} succeeded.`);
        }
      }
      onPaid();
    } catch (e: any) {
      alert(e.message ?? 'Failed to record payments');
    } finally {
      setPayBusy(null);
    }
  }

  // Void (undo) a specific settlement
  async function handleVoid(logId: string, settlementIdx: number) {
    if (!confirm('Void this payment? The amount will be added back to the balance.')) return;
    setPayBusy(logId);
    try {
      await api.del('/api/customers/history', { logId, settlementIdx });
      onPaid();
    } catch (e: any) {
      alert(e.message ?? 'Failed to void payment');
    } finally {
      setPayBusy(null);
    }
  }

  const footer = (
    <div className="flex gap-3 justify-end">
      <button
        onClick={onClose}
        className="px-5 py-3 rounded-xl text-base font-semibold border-2 border-surface-border text-ink hover:bg-slate-700 active:scale-[0.98] transition-all"
      >
        Close
      </button>
      {!isFullyPaid && (
        <button
          disabled={payBusy !== null}
          onClick={handlePayAll}
          className="px-8 py-3 rounded-xl text-base font-bold bg-available text-white shadow-md hover:bg-available/90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {payBusy === 'all' ? 'Processing…' : `💰 Pay All Rs ${totalRemaining.toLocaleString()}`}
        </button>
      )}
    </div>
  );

  return (
    <ModalShell
      title="Bill"
      subtitle={customer.customerName}
      onClose={onClose}
      busy={payBusy !== null}
      footer={footer}
      width="max-w-lg"
    >
      {/* ── Balance-only customer (from Bill Now, no sessions today) */}
      {hasBalanceOnly && (
        <div className="mb-4 bg-occupied-bg/30 rounded-xl border-2 border-occupied/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-occupied">Outstanding Balance</div>
              <div className="text-xs text-slate-400 font-semibold mt-0.5">Charged via Bill Now</div>
            </div>
            <span className="font-mono text-2xl font-extrabold text-occupied tabular-nums">
              Rs {accountBalance.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* ── Paper receipt style ───────────────────────────────── */}
      <div className="space-y-0">
        {sessions.map((s, i) => {
          const sPaid = (s.settlements ?? []).reduce((sum: number, st: any) => st.amount > 0 ? sum + st.amount : 0, 0);
          const sRemaining = sessionRem(s);
          const isSessionPaid = sRemaining === 0 && s.totalRevenue > 0;
          const isPaying = payBusy === s._id;

          return (
            <div key={i} className="border-b border-dashed border-surface-border py-3 last:border-b-0">
              {/* Table header */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-800 border border-surface-border flex items-center justify-center text-[10px] font-bold text-slate-400">
                    {i + 1}
                  </span>
                  <span className="text-base font-bold text-ink">
                    {s.isPrivateRoom ? `Room ${s.tableNumber}` : `Table ${s.tableNumber}`}
                  </span>
                  {isSessionPaid ? (
                    <span className="text-[10px] font-bold text-available bg-available-bg border border-available/20 px-1.5 py-0.5 rounded">PAID</span>
                  ) : sRemaining < s.totalRevenue ? (
                    <span className="text-[10px] font-bold text-reserved bg-reserved-bg border border-reserved/20 px-1.5 py-0.5 rounded">PARTIAL</span>
                  ) : null}
                </div>
                <span className="font-mono text-lg font-extrabold text-ink tabular-nums">
                  Rs {s.totalRevenue.toLocaleString()}
                </span>
              </div>

              {/* Timing */}
              <div className="text-xs text-slate-400 font-semibold mb-1.5 ml-8">
                {formatDate(s.startTime)} {formatTime(s.startTime)} – {formatTime(s.endTime)}
              </div>

              {/* Bill line items */}
              <div className="ml-8 space-y-1">
                {/* Table rental */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Game</span>
                  <span className="font-mono text-ink font-semibold">Rs {(s.tableRentalRevenue ?? 0).toLocaleString()}</span>
                </div>

                {/* Food */}
                {(s.menuSalesRevenue ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Food & Drinks</span>
                    <span className="font-mono text-ink font-semibold">Rs {(s.menuSalesRevenue ?? 0).toLocaleString()}</span>
                  </div>
                )}

                {/* Individual food items */}
                {s.items && s.items.length > 0 && (
                  <div className="pl-3 border-l-2 border-surface-border mt-1 space-y-0.5">
                    {s.items.map((it: any, j: number) => (
                      <div key={j} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{it.quantity}× {it.itemName}</span>
                        <span className="font-mono text-slate-400">Rs {((it.price ?? 0) * (it.quantity ?? 1)).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Accumulated charges */}
                {s.accumulatedCharges && s.accumulatedCharges.length > 0 && (
                  <div className="pl-3 border-l-2 border-surface-border mt-1 space-y-0.5">
                    {s.accumulatedCharges.map((c, j) => (
                      <div key={j} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          Prev: {(c.gameType || 'Game').replace(/_/g, ' ')} · T{c.tableNumber}
                        </span>
                        <span className="font-mono text-slate-400">Rs {(c.gameTotal + c.foodTotal).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Payment settled with void option */}
                {sPaid > 0 && (
                  <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-surface-border border-dashed">
                    <span className="text-available font-semibold">Paid</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-available font-bold">-Rs {sPaid.toLocaleString()}</span>
                      {(s.settlements ?? []).length > 0 && (
                        <button
                          onClick={() => handleVoid(s._id!, (s.settlements ?? []).length - 1)}
                          disabled={payBusy !== null}
                          className="text-occupied/60 hover:text-occupied text-[10px] font-bold transition-colors"
                          title="Void last payment"
                        >
                          ✕ void
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Per-session pay button */}
                {!isSessionPaid && sRemaining > 0 && (
                  <div className="mt-2">
                    <button
                      disabled={payBusy !== null}
                      onClick={() => handlePaySession(s)}
                      className="w-full py-2.5 rounded-xl bg-available text-white text-sm font-bold shadow-md hover:bg-available/90 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isPaying ? 'Processing…' : `💰 Pay Rs ${sRemaining.toLocaleString()}`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Grand Total ──────────────────────────────────────── */}
      <div className="mt-4 rounded-xl border-2 border-brass/30 bg-brass-bg px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold text-ink">
            Total
            {sessions.length > 1 && <span className="text-xs text-slate-400 font-semibold ml-2">{sessions.length} tables</span>}
          </span>
          <span className="font-mono text-4xl font-extrabold text-brass tabular-nums">
            Rs {totalAll.toLocaleString()}
          </span>
        </div>
        {totalPaid > 0 && (
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-slate-400 font-semibold">Already paid</span>
            <span className="font-mono text-available font-bold">-Rs {totalPaid.toLocaleString()}</span>
          </div>
        )}
        {totalRemaining > 0 && (
          <div className="flex items-center justify-between text-lg mt-1 pt-1.5 border-t border-brass/20">
            <span className="text-ink font-extrabold">Remaining</span>
            <span className="font-mono text-occupied font-extrabold">Rs {totalRemaining.toLocaleString()}</span>
          </div>
        )}
        {isFullyPaid && (
          <div className="text-center text-available font-bold text-sm mt-1">✓ Fully Paid</div>
        )}
      </div>

      {/* ── Payment method (only if something is owed) ────────── */}
      {!isFullyPaid && totalRemaining > 0 && (
        <div className="mt-4">
          <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Payment Method</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'cash' as const, label: 'Cash', icon: '💵', active: 'border-available/40 bg-available-bg text-available' },
              { key: 'card' as const, label: 'Card', icon: '💳', active: 'border-blue-800 bg-blue-950 text-blue-300' },
              { key: 'account' as const, label: 'Account', icon: '👤', active: 'border-reserved/40 bg-reserved-bg text-reserved' },
            ]).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setPayMethod(opt.key)}
                className={`rounded-xl border-2 px-3 py-3 text-center transition-all ${
                  payMethod === opt.key
                    ? `${opt.active} shadow-sm`
                    : 'border-surface-border bg-slate-800 text-ink hover:border-slate-500'
                }`}
              >
                <div className="text-xl mb-1">{opt.icon}</div>
                <div className="text-sm font-bold">{opt.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Shared detail field ─────────────────────────────────────────
function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-semibold text-ink ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</div>
    </div>
  );
}
