'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { TableDoc, CustomerAccountDoc } from '@/lib/types';
import { api } from '@/lib/api';
import { useClock, formatElapsed } from '@/lib/useClock';
import { computeSessionBill } from '@/lib/billing';
import ModalShell from './ModalShell';

interface Subtype {
  _id: string;
  name: string;
  price: number;
  perMinuteRate: number;
  gameMinutes: number;
}

interface GameType {
  _id: string;
  name: string;
  hasSubtypes: boolean;
  flatPrice: number;
  perMinuteRate: number;
  subtypes: Subtype[];
}

interface ClubConfig {
  gameTypes: GameType[];
  roomGameTypes: GameType[];
}

export default function NewGameModal({
  table,
  allTables,
  onClose,
  onDone,
}: {
  table: TableDoc;
  allTables: TableDoc[];
  onClose: () => void;
  onDone: () => void;
}) {
  const now = useClock(1000);
  const [config, setConfig] = useState<ClubConfig | null>(null);
  const [selectedTypeIdx, setSelectedTypeIdx] = useState(0);
  const [selectedSubIdx, setSelectedSubIdx] = useState(0);
  const [targetTableId, setTargetTableId] = useState(table._id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Loser name entry ────────────────────────────────────────
  const [loserName, setLoserName] = useState('');
  const [suggestions, setSuggestions] = useState<CustomerAccountDoc[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const session = table.currentSession as any;
  const isPaused = session?.isPaused ?? false;

  useEffect(() => {
    api.get<ClubConfig>('/api/config').then(setConfig).catch(() => {});
  }, []);

  const availableTargets = allTables.filter((t) => t.status === 'available' || t._id === table._id);
  const targetTable = availableTargets.find((t) => t._id === targetTableId);
  const activeGameTypes = targetTable?.isPrivateRoom ? (config?.roomGameTypes ?? []) : (config?.gameTypes ?? []);
  const gameType = activeGameTypes[selectedTypeIdx];
  const subtype = gameType?.hasSubtypes ? gameType.subtypes?.[selectedSubIdx] : null;

  useEffect(() => { setSelectedSubIdx(0); }, [selectedTypeIdx]);
  useEffect(() => { setSelectedTypeIdx(0); setSelectedSubIdx(0); }, [targetTableId]);

  // Current bill (ticking live)
  const currentBill = session
    ? computeSessionBill({
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
      }, new Date(now))
    : null;

  // Accumulated totals
  const accumulated = session?.accumulatedCharges ?? [];
  const unsettledRounds = accumulated.filter((c: any) => !c.settled);
  const settledRounds = accumulated.filter((c: any) => c.settled);
  const unsettledTotal = unsettledRounds.reduce((sum: number, c: any) => sum + c.gameTotal + c.foodTotal, 0);
  const settledTotal = settledRounds.reduce((sum: number, c: any) => sum + c.gameTotal + c.foodTotal, 0);

  // Grand total if ending now (unsettled only)
  const ifEndNow = (currentBill?.total ?? 0) + unsettledTotal;

  const currentGameLabel = (session?.gameType ?? session?.pricingType ?? '').replace(/_/g, ' ');
  const moving = targetTableId !== table._id;
  const loser = loserName.trim();

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

  function handleNameChange(val: string) {
    setLoserName(val);
    setHighlightIdx(-1);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(() => fetchSuggestions(val), 200);
  }

  function selectSuggestion(name: string) {
    setLoserName(name);
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

  async function handleAction(billNow: boolean) {
    if (!gameType) { setError('Pick a game type.'); return; }
    if (billNow && !loser) { setError('Enter the loser\'s name to bill them.'); return; }
    setBusy(true);
    setError(null);
    try {
      const price = subtype ? subtype.price : gameType.flatPrice;
      const perMin = subtype ? subtype.perMinuteRate : gameType.perMinuteRate;
      const mins = subtype ? subtype.gameMinutes : 60;
      const label = subtype ? `${gameType.name} - ${subtype.name}` : gameType.name;

      await api.post(`/api/tables/${table._id}/new-game`, {
        targetTableId,
        gameType: label,
        pricingType: label.toLowerCase().replace(/\s+/g, '_'),
        billingMode: 'flat_rate',
        hourlyRate: (price / mins) * 60,
        flatPrice: price,
        durationMinutes: mins,
        overtimeRate: perMin,
        gracePeriodMinutes: 0,
        flatSurcharge: 0,
        minimumMinutes: null,
        loser,
        billNow,
      });
      onDone();
    } catch (e: any) {
      setError(e.message ?? 'Failed to start new game');
    } finally {
      setBusy(false);
    }
  }

  // End current session and start fresh (for different player pairs)
  async function handleNewSession() {
    if (!loser) { setError('Enter the loser\'s name to end this session.'); return; }
    setBusy(true);
    setError(null);
    try {
      // End current session with the loser paying
      await api.post(`/api/tables/${table._id}/end`, {
        closedBy: 'Staff',
        customerName: loser,
      });
      onDone();
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
      {/* New Session — ends current, starts fresh (different players) */}
      <button
        disabled={busy || !loser}
        onClick={handleNewSession}
        className="px-5 py-3 rounded-xl text-base font-bold bg-occupied text-white shadow-md hover:bg-occupied/90 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {busy ? '…' : `End Session`}
      </button>
      {/* Bill Now — primary action */}
      <button
        disabled={busy || !config || !loser}
        onClick={() => handleAction(true)}
        className="px-5 py-3 rounded-xl text-base font-bold bg-available text-white shadow-md hover:bg-available/90 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {busy ? 'Processing…' : `💰 Bill ${loser || '…'} — Rs ${(currentBill?.total ?? 0).toLocaleString()}`}
      </button>
      {/* Keep on Tab — secondary action */}
      <button
        disabled={busy || !config}
        onClick={() => handleAction(false)}
        className="px-5 py-3 rounded-xl text-base font-bold bg-brass text-white shadow-md hover:bg-brass-light active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {busy ? '…' : 'Keep on Tab'}
      </button>
    </div>
  );

  return (
    <ModalShell
      title="New Game"
      subtitle={`${table.label ?? `Table ${table.tableNumber}`} — game ending, who lost?`}
      onClose={onClose}
      busy={busy}
      footer={footer}
    >
      {/* ── Pause Warning ──────────────────────────────────────── */}
      {isPaused && (
        <div className="mb-4 flex items-center gap-2 bg-reserved-bg border-2 border-reserved/30 rounded-xl px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-reserved shrink-0"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          <span className="text-sm font-bold text-reserved">Session is paused — the table may still be unavailable. Resume first or end the session.</span>
        </div>
      )}

      {/* ── Current Game Summary ──────────────────────────────── */}
      <div className="mb-4 rounded-xl border-2 border-occupied/20 bg-occupied-bg/30 overflow-hidden">
        <div className="px-4 py-2.5 bg-occupied/5 border-b border-occupied/10">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Current Game — Ending</div>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-base font-bold text-ink">{currentGameLabel || 'Game'}</span>
            <span className="font-mono text-xl font-extrabold text-ink tabular-nums">
              Rs {currentBill?.tableTotal.toLocaleString() ?? 0}
            </span>
          </div>
          <div className="text-sm text-slate-400 font-semibold">
            {formatElapsed(currentBill?.elapsedMs ?? 0)} played
            {currentBill?.overtimeMinutes ? <span className="text-occupied ml-2">+{currentBill.overtimeMinutes} min OT</span> : null}
          </div>
          {currentBill && currentBill.foodTotal > 0 && (
            <div className="text-sm text-slate-400 font-semibold mt-0.5">
              Food: Rs {currentBill.foodTotal.toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* ── Previous Rounds ───────────────────────────────────── */}
      {accumulated.length > 0 && (
        <div className="mb-4 space-y-2">
          {settledRounds.length > 0 && (
            <div>
              <div className="text-[10px] text-available font-bold uppercase tracking-wider mb-1">✓ Already Billed</div>
              <div className="space-y-1">
                {settledRounds.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-available-bg/30 rounded-lg px-3 py-1.5 border border-available/10 text-xs">
                    <span className="text-ink">{(c.gameType || 'Game').replace(/_/g, ' ')} · T{c.tableNumber} → {c.loser}</span>
                    <span className="font-mono text-available font-bold">Rs {(c.gameTotal + c.foodTotal).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {unsettledRounds.length > 0 && (
            <div>
              <div className="text-[10px] text-brass font-bold uppercase tracking-wider mb-1">On Tab</div>
              <div className="space-y-1">
                {unsettledRounds.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-1.5 border border-surface-border text-xs">
                    <span className="text-ink">{(c.gameType || 'Game').replace(/_/g, ' ')} · T{c.tableNumber} → {c.loser || '—'}</span>
                    <span className="font-mono text-brass font-bold">Rs {(c.gameTotal + c.foodTotal).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Running Total ─────────────────────────────────────── */}
      <div className="mb-4 rounded-xl border-2 border-brass/30 bg-brass-bg px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">Unsettled total (if ended now)</span>
          <span className="font-mono text-xl font-extrabold text-brass tabular-nums">
            Rs {ifEndNow.toLocaleString()}
          </span>
        </div>
        {settledTotal > 0 && (
          <div className="text-xs text-slate-400 text-right mt-0.5">
            + Rs {settledTotal.toLocaleString()} already billed
          </div>
        )}
      </div>

      {/* ── Loser Name ────────────────────────────────────────── */}
      <div className="mb-4 relative">
        <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
          Who lost this round?
        </label>
        <input
          ref={inputRef}
          value={loserName}
          onChange={(e) => handleNameChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
          onKeyDown={handleNameKeyDown}
          placeholder="Enter loser's name"
          autoFocus
          className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-3 text-base font-semibold text-white focus:outline-none focus:border-brass transition-colors"
        />

        {loserName && (
          <button
            type="button"
            onClick={() => { setLoserName(''); setShowSuggestions(false); }}
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

      {/* ── Move to different table ───────────────────────────── */}
      {allTables.filter((t) => t.status === 'available').length > 1 && (
        <div className="mb-4">
          <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Next Game On</label>
          <div className="grid grid-cols-3 gap-2">
            {availableTargets.map((t) => (
              <button
                key={t._id}
                onClick={() => setTargetTableId(t._id)}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-all ${
                  targetTableId === t._id
                    ? 'border-brass bg-brass-bg text-brass shadow-sm'
                    : 'border-surface-border hover:border-slate-500 bg-slate-800 text-ink'
                }`}
              >
                {t.label ?? `Table ${t.tableNumber}`}
                {t._id === table._id && <div className="text-[10px] text-slate-400 mt-0.5">(current)</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── New Game Type ─────────────────────────────────────── */}
      <div className="mb-2">
        <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
          {moving ? 'Game Type on New Table' : 'Next Game Type'}
        </label>
        {!config ? (
          <div className="text-sm text-slate-400 py-2">Loading rates…</div>
        ) : activeGameTypes.length === 0 ? (
          <div className="text-sm text-slate-400 py-2">No rates configured.</div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-col gap-1.5">
              {activeGameTypes.map((gt, i) => (
                <button
                  key={gt._id}
                  onClick={() => setSelectedTypeIdx(i)}
                  className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    selectedTypeIdx === i
                      ? 'border-brass bg-brass-bg shadow-sm'
                      : 'border-surface-border hover:border-slate-500 bg-slate-800'
                  }`}
                >
                  <span className="text-base font-bold text-ink">{gt.name}</span>
                  <span className="text-sm text-slate-400 font-semibold">
                    {gt.hasSubtypes ? `${gt.subtypes.length} options` : `Rs ${gt.flatPrice}/hr`}
                  </span>
                </button>
              ))}
            </div>

            {gameType && gameType.hasSubtypes && gameType.subtypes.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-2">
                {gameType.subtypes.map((sub, i) => (
                  <button
                    key={sub._id}
                    onClick={() => setSelectedSubIdx(i)}
                    className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
                      selectedSubIdx === i
                        ? 'border-brass bg-brass-bg shadow-sm'
                        : 'border-surface-border hover:border-slate-500 bg-slate-800'
                    }`}
                  >
                    <span className="text-base font-semibold text-ink">{sub.name}</span>
                    <span className="text-xl font-extrabold text-brass">Rs {sub.price}</span>
                  </button>
                ))}
              </div>
            )}

            {gameType && !gameType.hasSubtypes && (
              <div className="rounded-xl border-2 border-brass/20 bg-brass-bg p-4 text-center">
                <div className="text-3xl font-extrabold text-brass">Rs {gameType.flatPrice}/hr</div>
                <div className="text-sm text-slate-400 font-semibold mt-0.5">
                  Then Rs {gameType.perMinuteRate}/min overtime
                </div>
              </div>
            )}
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
