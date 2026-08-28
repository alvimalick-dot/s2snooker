'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import { TableDoc, CustomerAccountDoc } from '@/lib/types';
import { computeSessionBill } from '@/lib/billing';
import { useClock, formatElapsed } from '@/lib/useClock';
import { api } from '@/lib/api';
import ModalShell from './ModalShell';

export default function EndSessionModal({
  table,
  onClose,
  onEnded,
}: {
  table: TableDoc;
  onClose: () => void;
  onEnded: () => void;
}) {
  const now = useClock(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = table.currentSession;

  // Auto-fill from last round's loser (computed early for useState init)
  const accumulated = (session as any)?.accumulatedCharges ?? [];
  const lastLoser = accumulated.length > 0 ? accumulated[accumulated.length - 1].loser ?? '' : '';

  // ── Customer name entry (auto-fill from last round's loser) ──
  const [nameValue, setNameValue] = useState(lastLoser);
  const [suggestions, setSuggestions] = useState<CustomerAccountDoc[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bill computation (handle null session gracefully)
  const bill = useMemo(() => {
    void now;
    if (!session) return { tableTotal: 0, foodTotal: 0, total: 0, elapsedMs: 0, overtimeMinutes: 0, foodSubtotal: 0, compTotal: 0, discountTotal: 0 };
    return computeSessionBill({
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
      framesPlayed: session.framesPlayed,
      framePrice: session.framePrice,
      activeOrders: session.activeOrders,
      pausedDurationMs: session.pausedDurationMs,
      isPaused: session.isPaused,
      pauseStartedAt: session.pauseStartedAt,
    });
  }, [session, now]);

  // ── Autocomplete logic ──────────────────────────────────────
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    try {
      const names = await api.get<string[]>(`/api/customers/history?suggest=1&q=${encodeURIComponent(q)}`);
      if (names.length === 0) { setSuggestions([]); setShowSuggestions(false); return; }
      const accounts = await Promise.all(
        names.slice(0, 5).map(async (n) => {
          try {
            const acct = await api.get<CustomerAccountDoc | null>(`/api/customers/account?name=${encodeURIComponent(n)}`);
            return acct ?? { _id: n, customerName: n, balance: 0, totalCharged: 0, totalPaid: 0, isActive: true, creditLimit: 0, notes: '', transactions: [], createdAt: '', updatedAt: '' } as CustomerAccountDoc;
          } catch {
            return { _id: n, customerName: n, balance: 0, totalCharged: 0, totalPaid: 0, isActive: true, creditLimit: 0, notes: '', transactions: [], createdAt: '', updatedAt: '' } as CustomerAccountDoc;
          }
        })
      );
      setSuggestions(accounts);
      setShowSuggestions(accounts.length > 0);
      setHighlightIdx(-1);
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  // ── ALL HOOKS ABOVE THIS LINE ───────────────────────────────
  if (!session) return null;

  // Session-dependent computed values (safe after early return)
  const accCount = accumulated.length;
  const unsettledRounds = accumulated.filter((c: any) => !c.settled);
  const settledRounds = accumulated.filter((c: any) => c.settled);
  const unsettledAccGameTotal = unsettledRounds.reduce((sum: number, c: any) => sum + c.gameTotal, 0);
  const unsettledAccFoodTotal = unsettledRounds.reduce((sum: number, c: any) => sum + c.foodTotal, 0);
  const settledTotal = settledRounds.reduce((sum: number, c: any) => sum + c.gameTotal + c.foodTotal, 0);
  const foodItems = session.activeOrders.filter((o: any) => !o.isComp);
  const compItems = session.activeOrders.filter((o: any) => o.isComp);
  const grandTotal = bill.total + unsettledAccGameTotal + unsettledAccFoodTotal;
  const gameLabel = (session.gameType ?? session.pricingType ?? 'Game').replace(/_/g, ' ');
  const hasOvertime = (bill.overtimeMinutes ?? 0) > 0;
  const hasFood = bill.foodTotal > 0;
  const hasComp = compItems.length > 0;
  const hasAccumulated = accCount > 0;
  const customerName = nameValue.trim();

  function handleNameChange(val: string) {
    setNameValue(val);
    setHighlightIdx(-1);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(() => fetchSuggestions(val), 200);
  }

  function selectSuggestion(name: string) {
    setNameValue(name);
    setShowSuggestions(false);
    setHighlightIdx(-1);
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlightIdx].customerName);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  async function handleEnd() {
    if (!customerName) {
      setError('Enter the name of who is paying.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/tables/${table._id}/end`, {
        closedBy: 'Staff',
        customerName,
      });
      onEnded();
    } catch (e: any) {
      setError(e.message ?? 'Failed to end session');
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <div className="flex gap-3 justify-end">
      <button
        onClick={onClose}
        className="px-5 py-3 rounded-xl text-base font-semibold border-2 border-surface-border text-ink hover:bg-slate-700 active:scale-[0.98] transition-all"
      >
        Cancel
      </button>
      <button
        disabled={busy || !customerName}
        onClick={handleEnd}
        className="px-8 py-3 rounded-xl text-base font-bold bg-available text-white shadow-md hover:bg-available/90 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {busy ? 'Ending…' : 'End Session'}
      </button>
    </div>
  );

  return (
    <ModalShell
      title="End Session"
      subtitle={`${hasAccumulated ? `${accCount + 1} games` : table.label ?? `Table ${table.tableNumber}`}`}
      onClose={onClose}
      busy={busy}
      footer={footer}
    >
      {/* ═══ UNIFIED BILL ═══════════════════════════════════════ */}

      {/* ── Previous Games ────────────────────────────────────── */}
      {hasAccumulated && (
        <div className="mb-4">
          {/* Settled rounds (already billed) */}
          {settledRounds.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] text-available font-bold uppercase tracking-wider mb-1.5">✓ Already Billed ({settledRounds.length})</div>
              <div className="space-y-1">
                {settledRounds.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-available-bg/30 rounded-lg px-3 py-2 border border-available/10 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-available font-bold">✓</span>
                      <span className="text-ink">{(c.gameType || 'Game').replace(/_/g, ' ')}</span>
                      <span className="text-slate-400">T{c.tableNumber}</span>
                      {c.loser && <span className="text-slate-400/70">loser: {c.loser}</span>}
                    </div>
                    <span className="font-mono text-available font-bold tabular-nums">
                      Rs {(c.gameTotal + c.foodTotal).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unsettled rounds (on tab) */}
          {unsettledRounds.length > 0 && (
            <div>
              <div className="text-[10px] text-brass font-bold uppercase tracking-wider mb-1.5">On Tab ({unsettledRounds.length})</div>
              <div className="space-y-1.5">
                {unsettledRounds.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-2.5 border border-surface-border">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-6 h-6 rounded-full bg-surface-dark border border-surface-border flex items-center justify-center text-[10px] font-bold text-slate-400">
                        {i + 1}
                      </span>
                      <span className="font-bold text-ink">{(c.gameType || 'Game').replace(/_/g, ' ')}</span>
                      <span className="text-slate-400">T{c.tableNumber}</span>
                      {c.loser && <span className="text-slate-400/70">loser: {c.loser}</span>}
                    </div>
                    <span className="font-mono text-sm font-bold text-brass tabular-nums">
                      Rs {(c.gameTotal + c.foodTotal).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Current Game ──────────────────────────────────────── */}
      <div className="mb-4">
        <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">
          {hasAccumulated ? 'Current Game' : 'Game'}
        </div>
        <div className="bg-slate-800/60 rounded-xl border border-surface-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-base font-bold text-ink">{gameLabel}</div>
              <div className="text-sm text-slate-400 font-semibold">
                {formatElapsed(bill.elapsedMs)} · {session.flatPrice ? `Rs ${session.flatPrice}` : `Rs ${session.hourlyRate}/hr`}
                {hasOvertime && <span className="text-occupied ml-2">+{bill.overtimeMinutes} min OT</span>}
              </div>
            </div>
            <span className="font-mono text-xl font-extrabold text-ink tabular-nums">
              Rs {bill.tableTotal.toLocaleString()}
            </span>
          </div>

          {hasFood && (
            <div className="border-t border-surface-border px-4 py-2.5">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Food & Drinks</div>
              <div className="space-y-1">
                {foodItems.map((o: any, i: number) => {
                  const lineGross = o.price * o.quantity;
                  let lineTotal = lineGross;
                  if (o.discountPercent && o.discountPercent > 0) {
                    lineTotal = lineGross * (1 - o.discountPercent / 100);
                  }
                  return (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">
                        {o.quantity}× {o.itemName}
                        {o.discountPercent > 0 && <span className="text-brass ml-1">(-{o.discountPercent}%)</span>}
                      </span>
                      <span className="font-mono text-brass font-bold">Rs {lineTotal.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-sm mt-1.5 pt-1.5 border-t border-surface-border">
                <span className="text-slate-400 font-bold">Food total</span>
                <span className="font-mono text-brass font-bold">Rs {bill.foodTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {hasComp && (
            <div className="border-t border-surface-border px-4 py-2 bg-available-bg/20">
              <span className="text-[10px] text-available font-bold">Comped: </span>
              <span className="text-xs text-slate-400">
                {compItems.map((o: any) => `${o.quantity}× ${o.itemName}`).join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ GRAND TOTAL ════════════════════════════════════════ */}
      <div className={`rounded-xl border-2 px-5 py-4 mb-5 ${hasOvertime ? 'bg-occupied-bg border-occupied/30' : 'bg-brass-bg border-brass/30'}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-lg font-extrabold text-ink">Total</span>
            <span className="text-xs text-slate-400 font-semibold ml-2">
              {unsettledRounds.length + 1} unsettled
              {settledRounds.length > 0 && <> · {settledRounds.length} already billed</>}
            </span>
          </div>
          <span className={`font-mono text-4xl font-extrabold tabular-nums ${hasOvertime ? 'text-occupied' : 'text-brass'}`}>
            Rs {grandTotal.toLocaleString()}
          </span>
        </div>
        {settledTotal > 0 && (
          <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
            <span>Already billed to accounts</span>
            <span className="font-mono text-available font-bold">Rs {settledTotal.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* ═══ CUSTOMER NAME (who pays) ═══════════════════════════ */}
      <div className="mb-2 relative">
        <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
          Who is paying?{lastLoser && <span className="text-brass normal-case ml-2">(auto-filled from last round's loser)</span>}
        </label>
        <input
          ref={inputRef}
          value={nameValue}
          onChange={(e) => handleNameChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
          onKeyDown={handleNameKeyDown}
          placeholder="Enter customer name"
          autoFocus
          className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-3 text-base font-semibold text-white focus:outline-none focus:border-brass transition-colors"
        />

        {nameValue && (
          <button
            type="button"
            onClick={() => { setNameValue(''); setShowSuggestions(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border-2 border-surface-border rounded-xl shadow-lg z-10 overflow-hidden">
            {suggestions.map((s, i) => (
              <button
                key={s._id}
                type="button"
                onMouseDown={() => selectSuggestion(s.customerName)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                  i === highlightIdx ? 'bg-brass-bg' : 'hover:bg-slate-700'
                }`}
              >
                <div>
                  <div className="text-base font-semibold text-ink">{s.customerName}</div>
                  {s.totalCharged > 0 && (
                    <div className="text-sm text-slate-400">
                      {s.balance > 0
                        ? `Rs ${s.balance.toLocaleString()} owed`
                        : s.balance < 0
                          ? `Rs ${Math.abs(s.balance).toLocaleString()} credit`
                          : 'Settled'}
                    </div>
                  )}
                </div>
                {s.balance > 0 && (
                  <span className="text-sm font-bold text-occupied">
                    Rs {s.balance.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-occupied bg-occupied-bg border-2 border-occupied/20 rounded-xl px-4 py-2.5 text-sm font-semibold mt-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          {error}
        </div>
      )}
    </ModalShell>
  );
}
