'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useClock } from '@/lib/useClock';

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
        ) : (
          <Detail
            customer={selectedCustomer}
            onBack={() => setSelectedCustomer(null)}
            onPaid={load}
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

// ── Detail View ─────────────────────────────────────────────────
function Detail({ customer, onBack, onPaid }: {
  customer: CustomerEntry;
  onBack: () => void;
  onPaid: () => void;
}) {
  const isActive = customer.status === 'active';

  return (
    <div className="space-y-4">
      <button onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-brass hover:text-brass-light font-bold transition-colors">
        <span className="text-lg">←</span> Back to list
      </button>

      {/* Customer header */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatusDot status={customer.status} />
        <div className="text-xl font-extrabold text-ink">{customer.customerName}</div>
        <span className={`text-[11px] font-bold uppercase px-3 py-1 rounded-full ${
          isActive ? 'bg-available-bg text-available border border-available/20' : 'bg-slate-800 text-slate-300 border border-surface-border'
        }`}>
          {isActive ? '● Active' : 'Ended'}
        </span>
        {customer.paymentStatus && customer.paymentStatus !== 'paid' && (
          <PaymentBadge status={customer.paymentStatus} />
        )}
      </div>

      {/* ═══ ACTIVE SESSION DETAILS ═══════════════════════════════ */}
      {isActive && customer.tables?.map((t, i) => (
        <ActiveSessionCard key={i} table={t} />
      ))}

      {/* ═══ ENDED SESSION DETAILS ═══════════════════════════════ */}
      {!isActive && customer.sessions && customer.sessions.length > 0 && (
        <div className="space-y-3">
          <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Session History</div>
          {customer.sessions.map((s, i) => (
            <EndedSessionCard key={i} session={s} onPaid={onPaid} />
          ))}
        </div>
      )}

      {/* Account balance */}
      {customer.accountBalance !== undefined && customer.accountBalance !== 0 && (
        <div className={`rounded-xl border-2 p-4 ${
          customer.accountBalance > 0
            ? 'border-occupied/20 bg-occupied-bg'
            : 'border-available/20 bg-available-bg'
        }`}>
          <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Account Balance</div>
          <div className={`font-mono text-2xl font-extrabold ${
            customer.accountBalance > 0 ? 'text-occupied' : 'text-available'
          }`}>
            {customer.accountBalance > 0
              ? `Rs ${customer.accountBalance.toLocaleString()} owed`
              : `Rs ${Math.abs(customer.accountBalance).toLocaleString()} credit`}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Active Session Card ─────────────────────────────────────────
function ActiveSessionCard({ table }: { table: CustomerEntry['tables'] extends (infer T)[] | undefined ? Extract<T, object> : never }) {
  const now = useClock(1000);
  // Compute live elapsed from start time
  const startTime = table.startTime ? new Date(table.startTime).getTime() : 0;
  const liveElapsedMs = startTime > 0
    ? Math.max(0, new Date(now).getTime() - startTime)
    : (table.elapsedMs ?? 0);
  const gameLabel = (table.gameType ?? '').replace(/_/g, ' ');

  return (
    <div className="bg-available-bg border-2 border-available/20 rounded-xl overflow-hidden">
      {/* Top bar: table name + live bill */}
      <div className="flex items-center justify-between px-4 py-3 bg-available/5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-available animate-pulse" />
          <span className="text-base font-bold text-ink">{table.label ?? `Table ${table.tableNumber}`}</span>
        </div>
        <span className="font-mono text-2xl font-extrabold text-ink tabular-nums">
          Rs {(table.currentBill ?? 0).toLocaleString()}
        </span>
      </div>

      {/* Details grid */}
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
        {table.overtimeRate != null && table.overtimeRate > 0 && (
          <DetailField label="Overtime" value={`Rs ${table.overtimeRate}/min`} />
        )}
      </div>

      {/* Food orders */}
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

// ── Ended Session Card ──────────────────────────────────────────
function EndedSessionCard({ session, onPaid }: {
  session: NonNullable<CustomerEntry['sessions']>[number];
  onPaid: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const [payBusy, setPayBusy] = useState(false);

  const totalPaid = (session.settlements ?? []).reduce((sum, s: any) => s.amount > 0 ? sum + s.amount : sum, 0);
  const remaining = Math.max(0, session.totalRevenue - totalPaid);
  const isPaid = session.paymentStatus === 'paid';
  const isPartial = session.paymentStatus === 'partial';
  const isUnpaid = session.paymentStatus === 'unpaid';

  async function markPaid() {
    if (!session._id) return;
    setPayBusy(true);
    try {
      await api.patch('/api/customers/history', {
        logId: session._id,
        type: 'cash',
        amount: remaining,
      });
      onPaid();
    } catch (e: any) {
      alert(e.message ?? 'Failed to record payment');
    } finally {
      setPayBusy(false);
      setPaying(false);
    }
  }

  return (
    <div className="bg-slate-800 border-2 border-surface-border rounded-xl overflow-hidden">
      {/* Top bar: table + total + status */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-ink">
            {session.isPrivateRoom ? `Room ${session.tableNumber}` : `Table ${session.tableNumber}`}
          </span>
          <PaymentBadge status={session.paymentStatus} />
        </div>
        <span className="font-mono text-xl font-extrabold text-ink tabular-nums">
          Rs {session.totalRevenue.toLocaleString()}
        </span>
      </div>

      {/* Timing */}
      <div className="px-4 pb-2 text-sm text-slate-400 font-semibold">
        {formatDate(session.startTime)} {formatTime(session.startTime)} – {formatTime(session.endTime)}
        {session.closedBy && <span className="ml-2 text-slate-400/70">by {session.closedBy}</span>}
      </div>

      {/* Accumulated charges from previous games */}
      {session.accumulatedCharges && session.accumulatedCharges.length > 0 && (
        <div className="px-4 py-2.5 border-t border-surface-border">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Previous Games ({session.accumulatedCharges.length})</div>
          <div className="space-y-1">
            {session.accumulatedCharges.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">
                  {(c.gameType || 'Game').replace(/_/g, ' ')} · T{c.tableNumber} · {c.elapsedMinutes} min
                </span>
                <span className="font-mono text-brass font-bold">Rs {(c.gameTotal + c.foodTotal).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bill breakdown */}
      <div className="px-4 py-3 bg-surface-dark/40 border-t border-surface-border">
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Bill Breakdown</div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Table Rental</span>
            <span className="font-mono text-ink font-semibold">Rs {(session.tableRentalRevenue ?? 0).toLocaleString()}</span>
          </div>
          {(session.menuSalesRevenue ?? 0) > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Food & Drinks</span>
              <span className="font-mono text-ink font-semibold">Rs {(session.menuSalesRevenue ?? 0).toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm border-t border-surface-border pt-1.5">
            <span className="text-ink font-bold">Total</span>
            <span className="font-mono text-brass font-extrabold">Rs {session.totalRevenue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Ordered items */}
      {session.items && session.items.length > 0 && (
        <div className="px-4 py-3 border-t border-surface-border">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Ordered Items</div>
          <div className="flex flex-col gap-1">
            {session.items.map((it: any, j: number) => (
              <div key={j} className="flex items-center justify-between text-sm">
                <span className="text-ink">{it.quantity}× {it.itemName}</span>
                <span className="font-mono text-brass font-semibold">
                  Rs {((it.price ?? 0) * (it.quantity ?? 1)).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settlements */}
      {session.settlements && session.settlements.length > 0 && (
        <div className="px-4 py-3 border-t border-surface-border">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Payments</div>
          <div className="flex flex-wrap gap-1.5">
            {session.settlements.map((st: any, j: number) => (
              <span key={j} className={`text-[11px] px-2.5 py-1 rounded-full font-bold ${
                st.type === 'cash' ? 'bg-available-bg text-available border border-available/20' :
                st.type === 'card' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                st.type === 'account' ? 'bg-reserved-bg text-reserved border border-reserved/20' :
                'bg-slate-800 text-slate-300 border border-surface-border'
              }`}>
                {st.type}: Rs {Math.abs(st.amount).toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Mark as Paid button */}
      {!isPaid && remaining > 0 && (
        <div className="px-4 py-3 border-t border-surface-border">
          {paying ? (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Amount</label>
                <input
                  type="number"
                  defaultValue={remaining}
                  id={`pay-amount-${session._id}`}
                  className="w-full rounded-lg bg-slate-800 border-2 border-surface-border px-3 py-2 text-sm text-white focus:outline-none focus:border-brass font-mono"
                />
              </div>
              <button
                disabled={payBusy}
                onClick={() => {
                  const input = document.getElementById(`pay-amount-${session._id}`) as HTMLInputElement;
                  const amt = Number(input?.value) || remaining;
                  // Directly call with the right amount
                  if (!session._id) return;
                  setPayBusy(true);
                  api.patch('/api/customers/history', {
                    logId: session._id,
                    type: 'cash',
                    amount: amt,
                  }).then(() => { onPaid(); }).catch((e: any) => { alert(e.message ?? 'Failed'); }).finally(() => { setPayBusy(false); setPaying(false); });
                }}
                className="rounded-lg bg-available px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {payBusy ? 'Saving…' : 'Confirm'}
              </button>
              <button onClick={() => setPaying(false)} className="text-sm text-slate-400 px-2">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setPaying(true)}
              className="w-full rounded-xl bg-available/10 border-2 border-available/30 px-4 py-2.5 text-sm font-bold text-available hover:bg-available/20 transition-colors active:scale-[0.98]"
            >
              💰 Mark as Paid{isPartial ? ` (Rs ${remaining.toLocaleString()} remaining)` : ` (Rs ${remaining.toLocaleString()})`}
            </button>
          )}
        </div>
      )}

      {/* Already paid */}
      {isPaid && (
        <div className="px-4 py-2.5 border-t border-surface-border bg-available/5">
          <div className="text-sm font-bold text-available text-center">✓ Fully Paid</div>
        </div>
      )}
    </div>
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
