'use client';

import { useMemo, useState } from 'react';
import { TableDoc } from '@/lib/types';
import { computeSessionBill } from '@/lib/billing';
import { formatElapsed, useClock, reservationMinutesPast } from '@/lib/useClock';
import { api } from '@/lib/api';

export default function TableCard({
  table, staffName, onChanged, onOpenStart, onOpenOrder, onOpenEnd, onOpenNewGame,
}: {
  table: TableDoc;
  staffName?: string;
  onChanged: () => void;
  onOpenStart: (table: TableDoc) => void;
  onOpenOrder: (table: TableDoc) => void;
  onOpenEnd: (table: TableDoc) => void;
  onOpenNewGame: (table: TableDoc) => void;
}) {
  const now = useClock(1000);
  const [busy, setBusy] = useState(false);

  const bill = useMemo(() => {
    if (!table.currentSession) return null;
    void now;
    return computeSessionBill({
      startTime: table.currentSession.startTime,
      billingMode: table.currentSession.billingMode,
      pricingType: table.currentSession.pricingType,
      hourlyRate: table.currentSession.hourlyRate,
      flatPrice: table.currentSession.flatPrice,
      durationMinutes: table.currentSession.durationMinutes,
      overtimeRate: table.currentSession.overtimeRate,
      gracePeriodMinutes: table.currentSession.gracePeriodMinutes,
      flatSurcharge: table.currentSession.flatSurcharge,
      minimumMinutes: table.currentSession.minimumMinutes,
      framesPlayed: table.currentSession.framesPlayed,
      framePrice: table.currentSession.framePrice,
      activeOrders: table.currentSession.activeOrders,
      pausedDurationMs: table.currentSession.pausedDurationMs,
      isPaused: table.currentSession.isPaused,
      pauseStartedAt: table.currentSession.pauseStartedAt,
    });
  }, [table, now]);

  const [showPauseForm, setShowPauseForm] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  async function handlePause() {
    if (!pauseReason.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/tables/${table._id}/pause`, { action: 'pause', reason: pauseReason.trim(), staffName: staffName || 'Staff' });
      setShowPauseForm(false); setPauseReason(''); onChanged();
    } catch (e: any) {
      alert(e.message ?? 'Failed to pause');
    } finally { setBusy(false); }
  }

  async function handleResume() {
    setBusy(true);
    try { await api.post(`/api/tables/${table._id}/pause`, { action: 'resume' }); onChanged(); }
    catch (e: any) { alert(e.message ?? 'Failed to resume'); }
    finally { setBusy(false); }
  }

  function endSession() {
    onOpenEnd(table);
  }

  const isOccupied = table.status === 'occupied';
  const isAvailable = table.status === 'available';
  const isReserved = table.status === 'reserved';

  // Determine visual urgency based on overtime
  const hasOvertime = (bill?.overtimeMinutes ?? 0) > 0;
  const isPaused = table.currentSession?.isPaused;

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${
      isOccupied
        ? hasOvertime
          ? 'border-occupied shadow-glow-red'
          : 'border-surface-border shadow-card'
        : isAvailable
          ? 'border-available/40 bg-available-bg shadow-card'
          : 'border-reserved/40 bg-reserved-bg shadow-card'
    }`}>
      {/* ── Status strip ─────────────────────────────────────── */}
      <div className={`px-5 py-2.5 flex items-center justify-between font-bold text-sm uppercase tracking-wider ${
        isOccupied
          ? hasOvertime
            ? 'bg-occupied text-white'
            : isPaused
              ? 'bg-reserved text-white'
              : 'bg-slate-700 text-white'
          : isAvailable
            ? 'bg-available text-white'
            : 'bg-reserved text-white'
      }`}>
        <span>{table.label ?? `Table ${table.tableNumber}`}</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
          {isOccupied
            ? hasOvertime ? 'OVERTIME' : isPaused ? 'PAUSED' : 'OCCUPIED'
            : isAvailable ? 'AVAILABLE' : 'RESERVED'
          }
        </span>
      </div>

      <div className={`px-5 py-4 flex flex-col gap-3 ${isOccupied ? 'bg-surface-card' : ''}`}>

        {/* === OCCUPIED === */}
        {isOccupied && table.currentSession && bill && (
          <>
            {/* OVERTIME — most prominent when active */}
            {hasOvertime && (
              <div className="flex items-center justify-center gap-2 bg-occupied-bg border-2 border-occupied/30 rounded-xl px-4 py-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-occupied">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
                <span className="text-lg font-extrabold text-occupied">
                  +{bill.overtimeMinutes} min overtime
                </span>
              </div>
            )}

            {/* Timer — big and bold */}
            <div className="text-center py-1">
              <div className={`font-mono text-5xl font-extrabold tracking-wider tabular-nums ${
                hasOvertime ? 'text-occupied' : isPaused ? 'text-reserved' : 'text-ink'
              }`}>
                {formatElapsed(bill.elapsedMs)}
              </div>
              {isPaused && (
                <div className="text-base text-reserved font-bold mt-1 flex items-center justify-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  PAUSED
                </div>
              )}
            </div>

            {/* Bill — big number (includes accumulated from previous games) */}
            {(() => {
              const acc = (table.currentSession as any).accumulatedCharges ?? [];
              const accTotal = acc.reduce((sum: number, c: any) => sum + c.gameTotal + c.foodTotal, 0);
              const grandTotal = bill.total + accTotal;
              const hasGames = acc.length > 0;
              return (
                <div className={`flex items-baseline justify-between rounded-xl px-4 py-3 border-2 ${
                  hasOvertime
                    ? 'bg-occupied-bg border-occupied/20'
                    : 'bg-slate-800/60 border-surface-border'
                }`}>
                  <div>
                    <span className="text-sm text-slate-400 font-bold uppercase">Bill</span>
                    {hasGames && (
                      <span className="text-[10px] text-brass font-bold ml-2">{acc.length + 1} games</span>
                    )}
                  </div>
                  <span className={`font-mono text-3xl font-extrabold tabular-nums ${
                    hasOvertime ? 'text-occupied' : 'text-ink'
                  }`}>
                    Rs {grandTotal.toLocaleString()}
                  </span>
                </div>
              );
            })()}

            {/* Customer + game type */}
            <div className="flex items-center justify-between">
              <div className="text-base text-slate-300 font-bold min-w-0 truncate">
                {table.currentSession.customerName || '—'}
                {table.currentSession.switchedFromTableNumber != null && (
                  <span className="text-slate-400 ml-2 text-sm">← T{table.currentSession.switchedFromTableNumber}</span>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-brass-bg border border-brass/30 px-3 py-1 text-xs font-bold text-brass uppercase">
                {(table.currentSession.gameType ?? table.currentSession.pricingType ?? 'game').replace(/_/g, ' ')}
              </span>
            </div>

            {/* Pause display */}
            {isPaused && (
              <div className="bg-reserved-bg border-2 border-reserved/30 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-base text-reserved font-bold">⏸ Paused</span>
                  <button disabled={busy} onClick={handleResume}
                    className="bg-available text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md active:scale-[0.97] transition-all">Resume</button>
                </div>
                {table.currentSession.pauseReason && (
                  <div className="text-sm text-slate-400 font-semibold mt-1">{table.currentSession.pauseReason}</div>
                )}
              </div>
            )}

            {/* Pause form */}
            {!isPaused && showPauseForm && (
              <div className="bg-reserved-bg border-2 border-reserved/20 rounded-xl p-4 space-y-3">
                <div className="text-base text-reserved font-bold">Club-Side Issue Only</div>
                <input value={pauseReason} onChange={(e) => setPauseReason(e.target.value)}
                  placeholder="Power cut, maintenance…"
                  className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-3 text-base font-semibold text-white focus:outline-none focus:border-reserved transition-colors" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setShowPauseForm(false); setPauseReason(''); }}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold border-2 border-surface-border text-ink hover:bg-slate-700 active:scale-[0.97] transition-all">Cancel</button>
                  <button disabled={busy || !pauseReason.trim()} onClick={handlePause}
                    className="bg-reserved text-white px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 active:scale-[0.97] transition-all">
                    {busy ? '…' : 'Pause'}
                  </button>
                </div>
              </div>
            )}

            {/* Frame counter */}
            {(table.currentSession.billingMode ?? '') === 'per_frame' && (
              <div className="flex items-center justify-center gap-5 bg-slate-800/60 rounded-xl py-3 border-2 border-surface-border">
                <button disabled={busy || (table.currentSession.framesPlayed ?? 0) <= 0}
                  onClick={async () => { setBusy(true); try { await api.post(`/api/tables/${table._id}/frame`, { action: 'decrement' }); onChanged(); } catch (e: any) { alert(e.message ?? 'Failed'); } finally { setBusy(false); } }}
                  className="w-12 h-12 rounded-full bg-slate-800 border-2 border-surface-border flex items-center justify-center text-2xl font-bold text-ink hover:bg-slate-700 disabled:opacity-30 active:scale-[0.95] transition-all">−</button>
                <div className="text-center">
                  <div className="font-mono text-4xl font-extrabold text-ink">{table.currentSession.framesPlayed ?? 0}</div>
                  <div className="text-xs text-slate-400 font-bold uppercase">frames</div>
                </div>
                <button disabled={busy}
                  onClick={async () => { setBusy(true); try { await api.post(`/api/tables/${table._id}/frame`, { action: 'increment' }); onChanged(); } catch (e: any) { alert(e.message ?? 'Failed'); } finally { setBusy(false); } }}
                  className="w-12 h-12 rounded-full bg-slate-800 border-2 border-surface-border flex items-center justify-center text-2xl font-bold text-ink hover:bg-slate-700 active:scale-[0.95] transition-all">+</button>
                <span className="text-sm text-slate-400 font-semibold">× Rs {(table.currentSession.framePrice ?? 0).toLocaleString()}</span>
              </div>
            )}

            {/* BIG action buttons — touch-friendly 48px+ */}
            <div className="flex gap-3">
              {!isPaused && !showPauseForm && (
                <button disabled={busy} onClick={() => setShowPauseForm(true)}
                  className="flex-1 py-4 rounded-xl bg-slate-800 border-2 border-surface-border text-base font-bold uppercase text-ink hover:bg-slate-700 active:scale-[0.97] transition-all">
                  Pause
                </button>
              )}
              <button disabled={busy} onClick={() => onOpenOrder(table)}
                className="flex-1 py-4 rounded-xl bg-brass text-white text-base font-bold uppercase shadow-md hover:bg-brass-light active:scale-[0.97] transition-all">
                + Order
              </button>
              <button disabled={busy} onClick={endSession}
                className={`flex-1 py-4 rounded-xl text-white text-base font-bold uppercase shadow-md active:scale-[0.97] transition-all ${
                  hasOvertime ? 'bg-occupied hover:bg-occupied/90 animate-pulse' : 'bg-occupied hover:bg-occupied/90'
                }`}>
                End
              </button>
            </div>
            <div className="flex gap-3">
              <button disabled={busy} onClick={() => onOpenNewGame(table)}
                className="flex-1 py-3 rounded-xl bg-brass-bg border-2 border-brass/30 text-sm font-bold uppercase text-brass hover:bg-brass/10 active:scale-[0.97] transition-all">
                🎱 New Game
              </button>
              {(table.currentSession.billingMode ?? 'flat_rate') === 'flat_rate' && (
                <button disabled={busy} onClick={async () => {
                  if (!confirm('Switch to time-based billing?')) return;
                  setBusy(true);
                  try {
                    const hourlyFromFlat = table.currentSession!.flatPrice
                      ? (table.currentSession!.flatPrice / Math.max(table.currentSession!.durationMinutes ?? 30, 1)) * 60 : 1000;
                    await api.post(`/api/tables/${table._id}/billing-mode`, { billingMode: 'time_based', hourlyRate: Math.round(hourlyFromFlat) });
                    onChanged();
                  } catch (e: any) { alert(e.message ?? 'Failed'); } finally { setBusy(false); }
                }}
                className="flex-1 py-3 rounded-xl bg-reserved-bg border-2 border-reserved/30 text-sm font-bold uppercase text-reserved hover:bg-reserved/10 active:scale-[0.97] transition-all">
                  ⏱ Time
                </button>
              )}
            </div>
          </>
        )}

        {/* === AVAILABLE === */}
        {isAvailable && (
          <div className="py-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-available flex items-center justify-center shadow-glow-green">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </div>
            <button disabled={busy} onClick={() => onOpenStart(table)}
              className="w-full py-4 rounded-xl bg-available text-white text-lg font-extrabold uppercase shadow-lg hover:bg-available/90 active:scale-[0.97] transition-all disabled:opacity-50">
              Start Session
            </button>
          </div>
        )}

        {/* === RESERVED === */}
        {isReserved && table.reservation && (() => {
          const minsPast = reservationMinutesPast(table.reservation!.time);
          const isLate = minsPast > 0;
          const isVeryLate = minsPast > 15;
          return (
            <div className="py-5 flex flex-col items-center gap-3">
              <div className="text-center">
                <div className="text-xl font-extrabold text-ink">{table.reservation.customerName}</div>
                <div className="text-base text-slate-400 font-semibold">at {table.reservation.time}</div>
              </div>
              {isLate && (
                <div className={`flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-xl ${
                  isVeryLate ? 'bg-occupied-bg text-occupied border-2 border-occupied/30' : 'bg-reserved-bg text-reserved border-2 border-reserved/30'
                }`}>
                  {isVeryLate ? `⚠ ${minsPast}m past due` : `⏰ ${minsPast}m late`}
                </div>
              )}
              <div className="flex gap-3 w-full">
                <button disabled={busy} onClick={() => onOpenStart(table)}
                  className="flex-1 py-4 rounded-xl bg-available text-white text-base font-bold uppercase shadow-lg active:scale-[0.97] transition-all">
                  Check In
                </button>
                <button disabled={busy} onClick={async () => {
                  if (!confirm(`Release reservation for ${table.reservation!.customerName}?`)) return;
                  setBusy(true);
                  try { await api.post(`/api/tables/${table._id}/release`); onChanged(); } catch (e: any) { alert(e.message ?? 'Failed'); } finally { setBusy(false); }
                }}
                className="flex-1 py-4 rounded-xl bg-occupied text-white text-base font-bold uppercase shadow-lg active:scale-[0.97] transition-all">
                  Release
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
