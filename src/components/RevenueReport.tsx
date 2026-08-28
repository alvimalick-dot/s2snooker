'use client';

import { useEffect, useState } from 'react';
import { RevenueLogDoc } from '@/lib/types';
import { api } from '@/lib/api';
import { todayPKT } from '@/lib/useClock';
import ModalShell from './ModalShell';

interface ReportData {
  logs: (RevenueLogDoc & { settlements?: { type: string; amount: number; description?: string; staffName?: string; date?: string }[]; accumulatedCharges?: any[] })[];
  totals: {
    tableRentalRevenue: number;
    roomRentalRevenue: number;
    menuSalesRevenue: number;
    totalRevenue: number;
  };
  openTablesCount: number;
  liveOpenRevenue: { totalRevenue: number } | null;
}

function todayStr() {
  return todayPKT();
}

function formatTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatElapsed(start?: string, end?: string) {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}h ${pad(m)}m`;
  return `${pad(m)} min`;
}

function getPaymentStatus(totalRevenue: number, settlements: any[]) {
  const paid = (settlements ?? []).reduce((sum, s) => s.amount > 0 ? sum + s.amount : 0, 0);
  if (paid >= totalRevenue && totalRevenue > 0) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

type LogType = ReportData['logs'][number];

export default function RevenueReport() {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [report, setReport] = useState<ReportData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogType | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.get<ReportData>(`/api/reports?from=${from}&to=${to}`);
      setReport(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load report');
      setReport(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function exportPDF() {
    if (!report) return;
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('The Break Snooker Club — Revenue Report', 14, 16);
    doc.setFontSize(10);
    doc.text(`Range: ${from} to ${to}`, 14, 23);

    autoTable(doc, {
      startY: 28,
      head: [['Date', 'Table', 'Customer', 'Pricing', 'Games', 'Table Rs', 'Menu Rs', 'Total Rs', 'Paid', 'Status']],
      body: report.logs.map((l) => {
        const acc = (l as any).accumulatedCharges ?? [];
        const accLabel = acc.length > 0
          ? `${acc.length} games (${acc.map((c: any) => c.loser ? `${c.loser} lost` : '').filter(Boolean).join(', ')})`
          : '—';
        const paid = (l.settlements ?? []).reduce((s: number, st: any) => st.amount > 0 ? s + st.amount : 0, 0);
        return [
          new Date(l.date).toLocaleDateString(),
          l.isPrivateRoom ? `Room ${l.tableNumber}` : `Table ${l.tableNumber}`,
          l.customerName || '—',
          l.pricingType,
          accLabel,
          l.tableRentalRevenue.toLocaleString(),
          l.menuSalesRevenue.toLocaleString(),
          l.totalRevenue.toLocaleString(),
          paid > 0 ? `Rs ${paid.toLocaleString()}` : '—',
          getPaymentStatus(l.totalRevenue, l.settlements ?? []),
        ];
      }),
      foot: [[
        '', '', '', '', '',
        report.totals.tableRentalRevenue.toLocaleString(),
        report.totals.menuSalesRevenue.toLocaleString(),
        report.totals.totalRevenue.toLocaleString(),
        totalPaid > 0 ? `Rs ${totalPaid.toLocaleString()}` : '',
        '',
      ]],
      theme: 'grid',
      headStyles: { fillColor: [15, 81, 50] },
      footStyles: { fillColor: [201, 162, 39], textColor: 20 },
    });

    doc.save(`revenue-report-${from}-to-${to}.pdf`);
  }

  function exportCSV() {
    window.open(`/api/reports?from=${from}&to=${to}&format=csv`, '_blank');
  }

  const totalPaid = report?.logs.reduce((sum, l) => {
    const paid = (l.settlements ?? []).reduce((s, st) => st.amount > 0 ? s + st.amount : s, 0);
    return sum + paid;
  }, 0) ?? 0;
  const totalDiscounts = report?.logs.reduce((sum, l) => {
    const disc = Math.abs((l.settlements ?? []).reduce((s: number, st: any) => st.amount < 0 ? s + st.amount : s, 0));
    return sum + disc;
  }, 0) ?? 0;
  const totalUnpaid = (report?.totals.totalRevenue ?? 0) - totalPaid - totalDiscounts;
  const paidCount = report?.logs.filter((l) => getPaymentStatus(l.totalRevenue, l.settlements ?? []) === 'paid').length ?? 0;
  const unpaidCount = report?.logs.filter((l) => getPaymentStatus(l.totalRevenue, l.settlements ?? []) === 'unpaid').length ?? 0;

  return (
    <div className="p-5">
      <div className="text-xl font-extrabold text-ink mb-4">Financial Reports</div>

      {/* Date range picker */}
      <div className="flex items-end gap-2 mb-5">
        <div className="flex-1">
          <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brass transition-colors [color-scheme:dark]" />
        </div>
        <div className="flex-1">
          <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brass transition-colors [color-scheme:dark]" />
        </div>
        <button disabled={busy} onClick={load}
          className="px-5 py-2.5 rounded-xl bg-available hover:bg-available/90 text-white text-sm font-bold shadow-md active:scale-[0.97] transition-all disabled:opacity-50">
          {busy ? '…' : 'Generate'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-occupied bg-occupied-bg border-2 border-occupied/20 rounded-xl px-4 py-3 text-sm font-semibold mb-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          {error}
        </div>
      )}

      {busy && !report && (
        <div className="py-12 text-center">
          <div className="inline-flex items-center gap-2 text-slate-400 text-sm">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            Loading report…
          </div>
        </div>
      )}

      {report && (
        <>
          {/* Revenue summary */}
          <div className="mb-4">
            <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total Revenue</div>
            <div className="text-4xl font-extrabold text-ink tabular-nums">
              Rs {report.totals.totalRevenue.toLocaleString()}
            </div>
            {report.liveOpenRevenue && report.openTablesCount > 0 && (
              <div className="text-sm text-slate-400 font-semibold mt-1">
                Includes Rs {report.liveOpenRevenue.totalRevenue.toLocaleString()} still running on{' '}
                {report.openTablesCount} open table{report.openTablesCount > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2 text-sm mb-4">
            <div className="bg-slate-800 rounded-xl px-4 py-3 border-2 border-surface-border">
              <div className="text-slate-400 font-semibold">Table Rental</div>
              <div className="text-brass font-bold text-lg tabular-nums">Rs {report.totals.tableRentalRevenue.toLocaleString()}</div>
            </div>
            <div className="bg-slate-800 rounded-xl px-4 py-3 border-2 border-surface-border">
              <div className="text-slate-400 font-semibold">Room Rental</div>
              <div className="text-brass font-bold text-lg tabular-nums">Rs {report.totals.roomRentalRevenue.toLocaleString()}</div>
            </div>
            <div className="bg-slate-800 rounded-xl px-4 py-3 border-2 border-surface-border">
              <div className="text-slate-400 font-semibold">Menu Sales</div>
              <div className="text-brass font-bold text-lg tabular-nums">Rs {report.totals.menuSalesRevenue.toLocaleString()}</div>
            </div>
            <div className="bg-slate-800 rounded-xl px-4 py-3 border-2 border-surface-border">
              <div className="text-slate-400 font-semibold">Paid / Unpaid</div>
              <div className="flex gap-2 mt-1">
                <span className="text-available font-bold">Rs {totalPaid.toLocaleString()}</span>
                <span className="text-slate-400">/</span>
                <span className={`font-bold ${totalUnpaid > 0 ? 'text-occupied' : 'text-slate-400'}`}>Rs {totalUnpaid.toLocaleString()}</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{paidCount} paid · {unpaidCount} unpaid</div>
            </div>
            {totalDiscounts > 0 && (
              <div className="bg-slate-800 rounded-xl px-4 py-3 border-2 border-surface-border">
                <div className="text-slate-400 font-semibold">Discounts Given</div>
                <div className="text-occupied font-bold text-lg tabular-nums">Rs {totalDiscounts.toLocaleString()}</div>
              </div>
            )}
          </div>

          {/* Session list */}
          {report.logs.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Sessions ({report.logs.length})</div>
              <div className="space-y-2">
                {report.logs.map((log, i) => {
                  const status = getPaymentStatus(log.totalRevenue, log.settlements ?? []);
                  const paid = (log.settlements ?? []).reduce((sum, s) => s.amount > 0 ? sum + s.amount : 0, 0);
                  const discount = Math.abs((log.settlements ?? []).reduce((sum: number, s: any) => s.amount < 0 ? sum + s.amount : 0, 0));

                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedLog(log)}
                      className="w-full flex items-center justify-between bg-slate-800 rounded-xl border border-surface-border px-4 py-3 text-left hover:border-slate-500 hover:bg-slate-700/50 transition-all active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          status === 'paid' ? 'bg-available' : status === 'partial' ? 'bg-reserved' : 'bg-occupied'
                        }`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-ink">{log.customerName || 'Guest'}</span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              status === 'paid' ? 'bg-available-bg text-available' :
                              status === 'partial' ? 'bg-reserved-bg text-reserved' :
                              'bg-occupied-bg text-occupied'
                            }`}>
                              {status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-semibold">
                            {log.isPrivateRoom ? `Room ${log.tableNumber}` : `Table ${log.tableNumber}`}
                            {' · '}{formatDate(log.startTime)} {formatTime(log.startTime)} – {formatTime(log.endTime)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="font-mono text-lg font-extrabold text-ink tabular-nums">Rs {log.totalRevenue.toLocaleString()}</div>
                        {paid > 0 && paid < log.totalRevenue && (
                          <div className="text-xs text-available font-semibold">Paid Rs {paid.toLocaleString()}</div>
                        )}
                        {discount > 0 && (
                          <div className="text-xs text-occupied font-semibold">-{discount > paid ? '' : ''}Rs {discount.toLocaleString()} discount</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {report.logs.length === 0 && (
            <div className="py-6 text-center">
              <div className="text-base font-bold text-slate-400">No sessions recorded</div>
              <div className="text-sm text-slate-400">No sessions were closed in this date range.</div>
            </div>
          )}

          {/* Export buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={exportPDF} disabled={!report}
              className="py-3 rounded-xl bg-occupied hover:bg-occupied/90 text-white text-sm font-bold uppercase tracking-wide shadow-md active:scale-[0.97] transition-all disabled:opacity-40">
              Export PDF
            </button>
            <button onClick={exportCSV} disabled={!report}
              className="py-3 rounded-xl bg-slate-800 border-2 border-surface-border text-white text-sm font-bold uppercase tracking-wide hover:bg-slate-700 active:scale-[0.97] transition-all disabled:opacity-40">
              Export CSV
            </button>
          </div>
        </>
      )}

      {/* ═══ SESSION DETAIL POPUP ═══════════════════════════════ */}
      {selectedLog && (
        <SessionDetailPopup log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}

// ═══ Session Detail Popup ═══════════════════════════════════════
function SessionDetailPopup({ log, onClose }: { log: LogType; onClose: () => void }) {
  const status = getPaymentStatus(log.totalRevenue, log.settlements ?? []);
  const totalPaid = (log.settlements ?? []).reduce((sum, s) => s.amount > 0 ? sum + s.amount : 0, 0);
  const totalDiscount = Math.abs((log.settlements ?? []).reduce((sum: number, s: any) => s.amount < 0 ? sum + s.amount : 0, 0));
  const remaining = Math.max(0, log.totalRevenue - totalPaid - totalDiscount);
  const acc = log.accumulatedCharges ?? [];
  const accTotal = acc.reduce((sum, c) => sum + c.gameTotal + c.foodTotal, 0);

  const footer = (
    <div className="flex justify-end">
      <button
        onClick={onClose}
        className="px-6 py-3 rounded-xl text-base font-semibold border-2 border-surface-border text-ink hover:bg-slate-700 active:scale-[0.98] transition-all"
      >
        Close
      </button>
    </div>
  );

  return (
    <ModalShell
      title="Session Details"
      subtitle={`${log.customerName || 'Guest'} — ${log.isPrivateRoom ? `Room ${log.tableNumber}` : `Table ${log.tableNumber}`}`}
      onClose={onClose}
      footer={footer}
      width="max-w-lg"
    >
      {/* ── Status & Total ───────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-surface-border">
        <span className={`text-[11px] font-bold uppercase px-3 py-1 rounded-full ${
          status === 'paid' ? 'bg-available-bg text-available border border-available/20' :
          status === 'partial' ? 'bg-reserved-bg text-reserved border border-reserved/20' :
          'bg-occupied-bg text-occupied border border-occupied/20'
        }`}>
          {status === 'paid' ? '✓ Paid' : status === 'partial' ? '◐ Partial' : '⚠ Unpaid'}
        </span>
        <span className="font-mono text-3xl font-extrabold text-brass tabular-nums">
          Rs {log.totalRevenue.toLocaleString()}
        </span>
      </div>

      {/* ── Timing ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-800/60 rounded-xl px-3 py-3 text-center border border-surface-border">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Date</div>
          <div className="text-sm font-bold text-ink mt-1">{formatDate(log.startTime)}</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl px-3 py-3 text-center border border-surface-border">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Time</div>
          <div className="text-sm font-bold text-ink mt-1">{formatTime(log.startTime)} – {formatTime(log.endTime)}</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl px-3 py-3 text-center border border-surface-border">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Duration</div>
          <div className="text-sm font-bold text-ink mt-1">{formatElapsed(log.startTime, log.endTime)}</div>
        </div>
      </div>

      {/* ── Closed by ────────────────────────────────────────── */}
      <div className="text-xs text-slate-400 font-semibold mb-4">
        Ended by {log.closedBy || 'Staff'}
      </div>

      {/* ── Previous Games (accumulated) ─────────────────────── */}
      {acc.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Games Played ({acc.length})</div>
          <div className="space-y-1.5">
            {acc.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-4 py-2.5 border border-surface-border">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-surface-dark border border-surface-border flex items-center justify-center text-[10px] font-bold text-slate-400">
                    {i + 1}
                  </span>
                  <div>
                    <span className="text-sm font-bold text-ink">{(c.gameType || 'Game').replace(/_/g, ' ')}</span>
                    <div className="text-xs text-slate-400">
                      T{c.tableNumber} · {c.elapsedMinutes} min
                      {c.loser && <span className="ml-1">→ loser: {c.loser}</span>}
                    </div>
                  </div>
                </div>
                <span className="font-mono text-sm font-bold text-brass tabular-nums">
                  Rs {(c.gameTotal + c.foodTotal).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          {accTotal > 0 && (
            <div className="flex justify-between text-xs text-slate-400 font-bold mt-1 px-1">
              <span>Previous games total</span>
              <span className="font-mono text-brass">Rs {accTotal.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Bill Breakdown ────────────────────────────────────── */}
      <div className="mb-4">
        <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Bill Breakdown</div>
        <div className="bg-slate-800/60 rounded-xl border border-surface-border overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b border-surface-border">
            <span className="text-base font-bold text-ink">Game</span>
            <span className="font-mono text-xl font-extrabold text-ink tabular-nums">Rs {(log.tableRentalRevenue ?? 0).toLocaleString()}</span>
          </div>
          {(log.menuSalesRevenue ?? 0) > 0 && (
            <div className="px-4 py-3 flex items-center justify-between border-b border-surface-border">
              <span className="text-base font-bold text-ink">Food & Drinks</span>
              <span className="font-mono text-xl font-extrabold text-ink tabular-nums">Rs {(log.menuSalesRevenue ?? 0).toLocaleString()}</span>
            </div>
          )}
          <div className="px-4 py-3 flex items-center justify-between bg-brass-bg/30">
            <span className="text-lg font-extrabold text-ink">Total</span>
            <span className="font-mono text-2xl font-extrabold text-brass tabular-nums">Rs {log.totalRevenue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* ── Food Items ────────────────────────────────────────── */}
      {log.items && log.items.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Ordered Items</div>
          <div className="bg-slate-800/60 rounded-xl border border-surface-border divide-y divide-surface-border">
            {log.items.map((it: any, j: number) => (
              <div key={j} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-ink font-semibold">{it.quantity}× {it.itemName}</span>
                <span className="font-mono text-sm text-brass font-bold">Rs {((it.price ?? 0) * (it.quantity ?? 1)).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Payments / Settlements ────────────────────────────── */}
      {log.settlements && log.settlements.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Payments</div>
          <div className="space-y-1.5">
            {log.settlements.map((st, j) => (
              <div key={j} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-4 py-2.5 border border-surface-border">
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                    st.type === 'discount' ? 'bg-occupied-bg text-occupied' :
                    st.type === 'cash' ? 'bg-available-bg text-available' :
                    st.type === 'card' ? 'bg-blue-950 text-blue-300' :
                    'bg-reserved-bg text-reserved'
                  }`}>
                    {st.type === 'discount' ? '🏷️' : st.type === 'cash' ? '💵' : st.type === 'card' ? '💳' : '👤'}
                  </span>
                  <div>
                    <div className="text-sm font-bold text-ink capitalize">{st.type}</div>
                    {st.description && <div className="text-xs text-slate-400">{st.description}</div>}
                    {st.date && <div className="text-xs text-slate-400/70">{formatDate(st.date)} {formatTime(st.date)}</div>}
                  </div>
                </div>
                <span className={`font-mono text-lg font-extrabold tabular-nums ${
                  st.amount < 0 ? 'text-occupied' : 'text-available'
                }`}>
                  {st.amount < 0 ? '-' : ''}Rs {Math.abs(st.amount).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm mt-2 px-1">
            <span className="text-slate-400 font-bold">Total paid</span>
            <span className="font-mono text-available font-extrabold">Rs {totalPaid.toLocaleString()}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm mt-1 px-1">
              <span className="text-occupied font-bold">Discounts</span>
              <span className="font-mono text-occupied font-extrabold">-Rs {totalDiscount.toLocaleString()}</span>
            </div>
          )}
          {remaining > 0 && (
            <div className="flex justify-between text-sm mt-1 px-1">
              <span className="text-occupied font-bold">Remaining</span>
              <span className="font-mono text-occupied font-extrabold">Rs {remaining.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* ── No payments yet ──────────────────────────────────── */}
      {(!log.settlements || log.settlements.length === 0) && remaining > 0 && (
        <div className="mb-4 bg-occupied-bg/30 rounded-xl border border-occupied/20 px-4 py-3 text-center">
          <div className="text-sm font-bold text-occupied">No payments recorded yet</div>
          <div className="text-xs text-slate-400 mt-0.5">Remaining: Rs {remaining.toLocaleString()}</div>
        </div>
      )}
    </ModalShell>
  );
}
