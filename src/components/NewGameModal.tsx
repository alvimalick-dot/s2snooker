'use client';

import { useState, useEffect } from 'react';
import { TableDoc } from '@/lib/types';
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
  const [targetTableId, setTargetTableId] = useState(table._id); // same table by default
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = table.currentSession as any;

  useEffect(() => {
    api.get<ClubConfig>('/api/config').then(setConfig).catch(() => {});
  }, []);

  // Available tables (including current)
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
  const accGameTotal = accumulated.reduce((sum: number, c: any) => sum + c.gameTotal, 0);
  const accFoodTotal = accumulated.reduce((sum: number, c: any) => sum + c.foodTotal, 0);
  const accCount = accumulated.length;

  // Grand total if ending now
  const grandTotal = (currentBill?.total ?? 0) + accGameTotal + accFoodTotal;

  async function handleNewGame() {
    if (!gameType) { setError('Pick a game type.'); return; }
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
      });
      onDone();
    } catch (e: any) {
      setError(e.message ?? 'Failed to start new game');
    } finally {
      setBusy(false);
    }
  }

  const currentGameLabel = (session?.gameType ?? session?.pricingType ?? '').replace(/_/g, ' ');
  const moving = targetTableId !== table._id;

  const footer = (
    <div className="flex gap-3 justify-end">
      <button
        onClick={onClose}
        className="px-5 py-3 rounded-xl text-base font-semibold border-2 border-surface-border text-ink hover:bg-slate-700 active:scale-[0.98] transition-all"
      >
        Cancel
      </button>
      <button
        disabled={busy || !config}
        onClick={handleNewGame}
        className="px-6 py-3 rounded-xl text-base font-bold bg-brass text-white shadow-md hover:bg-brass-light active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {busy ? 'Starting…' : moving ? 'Move & Start New Game' : 'Start New Game'}
      </button>
    </div>
  );

  return (
    <ModalShell
      title="New Game"
      subtitle={`${table.label ?? `Table ${table.tableNumber}`} — game ending, new one starting`}
      onClose={onClose}
      busy={busy}
      footer={footer}
    >
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

      {/* ── Previous Games (if any) ──────────────────────────── */}
      {accCount > 0 && (
        <div className="mb-4 rounded-xl border border-surface-border overflow-hidden">
          <div className="px-4 py-2.5 bg-surface-dark/40 border-b border-surface-border">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Previous Games ({accCount})
            </div>
          </div>
          <div className="divide-y divide-surface-border">
            {accumulated.map((c: any, i: number) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <div>
                  <span className="font-bold text-ink">{c.gameType || 'Game'}</span>
                  <span className="text-slate-400 ml-2">T{c.tableNumber}</span>
                  <span className="text-slate-400 ml-2">{c.elapsedMinutes} min</span>
                </div>
                <span className="font-mono font-bold text-brass tabular-nums">
                  Rs {(c.gameTotal + c.foodTotal).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 bg-surface-dark/40 flex items-center justify-between text-sm font-bold">
            <span className="text-slate-400">Previous total</span>
            <span className="font-mono text-brass tabular-nums">Rs {(accGameTotal + accFoodTotal).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* ── Running Total ─────────────────────────────────────── */}
      <div className="mb-5 rounded-xl border-2 border-brass/30 bg-brass-bg px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">Running Total (if ended now)</span>
          <span className="font-mono text-2xl font-extrabold text-brass tabular-nums">
            Rs {grandTotal.toLocaleString()}
          </span>
        </div>
      </div>

      {/* ── Move to different table ───────────────────────────── */}
      {allTables.filter((t) => t.status === 'available').length > 1 && (
        <div className="mb-4">
          <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Play Next On</label>
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
                {t.isPrivateRoom && <div className="text-[10px] uppercase text-brass/70 mt-0.5">Private</div>}
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
          <div className="text-sm text-slate-400 py-2">No rates configured for this table.</div>
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
