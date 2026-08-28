'use client';

import { useEffect, useState } from 'react';
import { RevenueLogDoc } from '@/lib/types';
import { api } from '@/lib/api';
import { todayPKT } from '@/lib/useClock';

interface ReportData {
  logs: RevenueLogDoc[];
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

export default function RevenueReport() {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [report, setReport] = useState<ReportData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      head: [['Date', 'Table', 'Customer', 'Pricing', 'Table Rs', 'Menu Rs', 'Total Rs']],
      body: report.logs.map((l) => [
        new Date(l.date).toLocaleDateString(),
        l.isPrivateRoom ? `Room ${l.tableNumber}` : `Table ${l.tableNumber}`,
        l.customerName || '—',
        l.pricingType,
        l.tableRentalRevenue.toLocaleString(),
        l.menuSalesRevenue.toLocaleString(),
        l.totalRevenue.toLocaleString(),
      ]),
      foot: [[
        '', '', '',
        'Totals',
        report.totals.tableRentalRevenue.toLocaleString(),
        report.totals.menuSalesRevenue.toLocaleString(),
        report.totals.totalRevenue.toLocaleString(),
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

  return (
    <div className="bg-surface-card rounded-2xl border border-surface-border p-5">
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

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-occupied bg-occupied-bg border-2 border-occupied/20 rounded-xl px-4 py-3 text-sm font-semibold mb-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          {error}
        </div>
      )}

      {/* Loading state */}
      {busy && !report && (
        <div className="py-12 text-center">
          <div className="inline-flex items-center gap-2 text-slate-400 text-sm">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            Loading report…
          </div>
        </div>
      )}

      {/* Report content */}
      {report && (
        <>
          {/* Revenue summary — big number */}
          <div className="mb-4">
            <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total Revenue</div>
            <div className="text-4xl font-extrabold text-ink tabular-nums">
              Rs {report.totals.totalRevenue.toLocaleString()}
            </div>
            {report?.liveOpenRevenue && report.openTablesCount > 0 && (
              <div className="text-sm text-slate-400 font-semibold mt-1">
                Includes Rs {report.liveOpenRevenue.totalRevenue.toLocaleString()} still running on{' '}
                {report.openTablesCount} open table{report.openTablesCount > 1 ? 's' : ''} (not yet cashed out)
              </div>
            )}
          </div>

          {/* Breakdown cards */}
          <div className="grid grid-cols-2 gap-2 text-sm mb-5">
            <div className="bg-slate-800 rounded-xl px-4 py-3 border-2 border-surface-border">
              <div className="text-slate-400 text-sm font-semibold">Table Rental</div>
              <div className="text-brass font-bold text-lg tabular-nums">Rs {report.totals.tableRentalRevenue.toLocaleString()}</div>
            </div>
            <div className="bg-slate-800 rounded-xl px-4 py-3 border-2 border-surface-border">
              <div className="text-slate-400 text-sm font-semibold">Room Rental</div>
              <div className="text-brass font-bold text-lg tabular-nums">Rs {report.totals.roomRentalRevenue.toLocaleString()}</div>
            </div>
            <div className="bg-slate-800 rounded-xl px-4 py-3 border-2 border-surface-border col-span-2">
              <div className="text-slate-400 text-sm font-semibold">Menu Sales</div>
              <div className="text-brass font-bold text-lg tabular-nums">Rs {report.totals.menuSalesRevenue.toLocaleString()}</div>
            </div>
          </div>

          {/* Empty state for logs */}
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
    </div>
  );
}
