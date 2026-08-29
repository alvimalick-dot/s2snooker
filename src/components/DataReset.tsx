'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import ModalShell from './ModalShell';

type ResetTarget = 'revenue' | 'customers' | 'both';

interface ResetResult {
  message: string;
  revenueLogsDeleted?: number;
  customerAccountsDeleted?: number;
  tablesReset?: number;
  dateRange?: { from: string; to: string };
}

export default function DataReset() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmTarget, setConfirmTarget] = useState<ResetTarget | null>(null);

  const today = new Date().toISOString().split('T')[0];

  async function doReset(target: ResetTarget) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body: Record<string, any> = { target };
      if (fromDate) body.from = fromDate;
      if (toDate) body.to = toDate;

      const res = await api.post<ResetResult>('/api/admin/reset-data', body);
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? 'Reset failed');
    } finally {
      setBusy(false);
      setConfirmTarget(null);
    }
  }

  const targetLabels: Record<ResetTarget, string> = {
    revenue: 'Revenue Logs',
    customers: 'Customer Records',
    both: 'Revenue Logs + Customer Records',
  };

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <div className="text-2xl font-extrabold text-ink">Data Reset</div>
        <p className="text-sm text-slate-400 mt-1">
          Select a date range and the data you want to clear. This is useful for
          handing the system over to a new client or starting fresh.
        </p>
      </div>

      {/* Date Range */}
      <div className="space-y-4">
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Date Range (optional)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 font-semibold uppercase mb-2">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-3 text-base font-semibold text-white focus:outline-none focus:border-brass"
            />
            <div className="text-[11px] text-slate-500 mt-1">
              Leave empty = earliest records
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 font-semibold uppercase mb-2">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              max={today}
              className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-3 text-base font-semibold text-white focus:outline-none focus:border-brass"
            />
            <div className="text-[11px] text-slate-500 mt-1">
              Leave empty = up to today
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Reset Actions
        </div>

        <button
          onClick={() => setConfirmTarget('revenue')}
          disabled={busy}
          className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-slate-800 border-2 border-surface-border hover:border-brass/50 hover:bg-slate-700 transition-all disabled:opacity-50 group"
        >
          <span className="text-2xl">📊</span>
          <div className="flex-1 text-left">
            <div className="text-base font-bold text-ink group-hover:text-brass">
              Reset Revenue Logs
            </div>
            <div className="text-xs text-slate-400">
              Delete all revenue records in the selected date range
            </div>
          </div>
          <span className="text-slate-500 group-hover:text-brass text-lg">→</span>
        </button>

        <button
          onClick={() => setConfirmTarget('customers')}
          disabled={busy}
          className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-slate-800 border-2 border-surface-border hover:border-brass/50 hover:bg-slate-700 transition-all disabled:opacity-50 group"
        >
          <span className="text-2xl">👥</span>
          <div className="flex-1 text-left">
            <div className="text-base font-bold text-ink group-hover:text-brass">
              Remove Customer Records
            </div>
            <div className="text-xs text-slate-400">
              Delete all customer accounts created in the selected date range
            </div>
          </div>
          <span className="text-slate-500 group-hover:text-brass text-lg">→</span>
        </button>

        <button
          onClick={() => setConfirmTarget('both')}
          disabled={busy}
          className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-occupied/10 border-2 border-occupied/30 hover:border-occupied/50 hover:bg-occupied/20 transition-all disabled:opacity-50 group"
        >
          <span className="text-2xl">🧹</span>
          <div className="flex-1 text-left">
            <div className="text-base font-bold text-occupied">
              Reset Everything
            </div>
            <div className="text-xs text-slate-400">
              Clear both revenue logs and customer records for a clean handover
            </div>
          </div>
          <span className="text-slate-500 group-hover:text-occupied text-lg">→</span>
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-2xl border-2 border-available/30 bg-available/10 p-5 space-y-2">
          <div className="text-base font-bold text-available">✓ {result.message}</div>
          {result.revenueLogsDeleted !== undefined && (
            <div className="text-sm text-slate-300">
              Revenue logs deleted: <span className="font-bold text-ink">{result.revenueLogsDeleted}</span>
            </div>
          )}
          {result.customerAccountsDeleted !== undefined && (
            <div className="text-sm text-slate-300">
              Customer accounts deleted: <span className="font-bold text-ink">{result.customerAccountsDeleted}</span>
            </div>
          )}
          {result.tablesReset !== undefined && result.tablesReset > 0 && (
            <div className="text-sm text-slate-300">
              Tables reset to available: <span className="font-bold text-ink">{result.tablesReset}</span>
            </div>
          )}
          {result.dateRange && (
            <div className="text-xs text-slate-400 mt-2">
              Date range: {result.dateRange.from} → {result.dateRange.to}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border-2 border-occupied/30 bg-occupied/10 p-5">
          <div className="text-base font-bold text-occupied">✗ {error}</div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmTarget && (
        <ModalShell
          onClose={() => setConfirmTarget(null)}
          title="Confirm Reset"
          width="max-w-lg"
          footer={
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmTarget(null)}
                className="px-6 py-3 rounded-xl text-base font-semibold border-2 border-surface-border text-ink hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={() => doReset(confirmTarget)}
                className="px-6 py-3 rounded-xl text-base font-bold bg-occupied text-white hover:bg-occupied/90 disabled:opacity-50"
              >
                {busy ? 'Clearing…' : 'Yes, Delete'}
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-occupied/10 border border-occupied/30">
              <span className="text-2xl">⚠️</span>
              <div className="text-sm text-occupied font-semibold">
                This action cannot be undone!
              </div>
            </div>

            <div className="text-sm text-slate-300">
              You are about to delete{' '}
              <span className="font-bold text-ink">{targetLabels[confirmTarget]}</span>
              {fromDate || toDate ? (
                <>
                  {' '}for the period:{' '}
                  <span className="font-bold text-ink">
                    {fromDate || 'earliest'} → {toDate || 'today'}
                  </span>
                </>
              ) : (
                <>
                  {' '}for <span className="font-bold text-occupied">ALL TIME</span>
                </>
              )}
              .
            </div>

            {confirmTarget !== 'customers' && (
              <div className="text-xs text-slate-400">
                Occupied or reserved tables will also be reset to available.
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </div>
  );
}
