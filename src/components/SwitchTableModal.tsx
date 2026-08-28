'use client';

import { useState, useEffect } from 'react';
import { TableDoc } from '@/lib/types';
import { api } from '@/lib/api';
import { useClock } from '@/lib/useClock';
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

/** Compute bill client-side from session data (mirrors billing.ts logic) */
function computeBill(session: any, asOf: Date) {
  const start = new Date(session.startTime).getTime();
  const now = asOf.getTime();
  let elapsedMs = Math.max(0, now - start);

  let pausedMs = session.pausedDurationMs ?? 0;
  if (session.isPaused && session.pauseStartedAt) {
    pausedMs += now - new Date(session.pauseStartedAt).getTime();
  }
  elapsedMs = Math.max(0, elapsedMs - pausedMs);

  // Food
  let foodTotal = 0;
  for (const item of session.activeOrders ?? []) {
    const lineGross = item.price * item.quantity;
    if (item.isComp) continue;
    if (item.discountPercent && item.discountPercent > 0) {
      foodTotal += lineGross * (1 - item.discountPercent / 100);
    } else {
      foodTotal += lineGross;
    }
  }

  // Table
  let tableTotal = 0;
  const mode = session.billingMode ??
    (session.pricingType === 'per_minute' ? 'time_based' : 'flat_rate');

  if (mode === 'time_based' || mode === 'manual_override') {
    const rawMinutes = Math.ceil(elapsedMs / 60000);
    const minimum = session.minimumMinutes ?? 0;
    const billableMinutes = minimum > 0 ? Math.max(rawMinutes, minimum) : rawMinutes;
    tableTotal = (session.hourlyRate / 60) * billableMinutes;
  } else {
    const basePrice = session.flatPrice ?? session.hourlyRate;
    const surcharge = session.flatSurcharge ?? 0;
    const includedMinutes = session.durationMinutes ?? 0;
    const overtimePerMin = session.overtimeRate ?? 0;
    const graceMinutes = session.gracePeriodMinutes ?? 0;
    const elapsedMinutes = Math.ceil(elapsedMs / 60000);
    const overtimeThreshold = includedMinutes + graceMinutes;
    if (includedMinutes > 0 && overtimePerMin > 0 && elapsedMinutes > overtimeThreshold) {
      const overtimeMinutes = elapsedMinutes - overtimeThreshold;
      tableTotal = basePrice + surcharge + overtimeMinutes * overtimePerMin;
    } else {
      tableTotal = basePrice + surcharge;
    }
  }

  const total = Math.round((tableTotal + foodTotal) * 100) / 100;
  const elapsedMinutes = Math.ceil(elapsedMs / 60000);

  return {
    tableTotal: Math.round(tableTotal * 100) / 100,
    foodTotal: Math.round(foodTotal * 100) / 100,
    total,
    elapsedMs,
    elapsedMinutes,
    foodItems: (session.activeOrders ?? []).filter((o: any) => !o.isComp).length,
  };
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function SwitchTableModal({
  table,
  allTables,
  staffName,
  onClose,
  onSwitched,
}: {
  table: TableDoc;
  allTables: TableDoc[];
  staffName?: string;
  onClose: () => void;
  onSwitched: () => void;
}) {
  const availableTargets = allTables.filter((t) => t._id !== table._id && t.status === 'available');

  const [targetTableId, setTargetTableId] = useState(availableTargets[0]?._id ?? '');
  const [selectedTypeIdx, setSelectedTypeIdx] = useState(0);
  const [selectedSubIdx, setSelectedSubIdx] = useState(0);
  const [customerName, setCustomerName] = useState(table.currentSession?.customerName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ClubConfig | null>(null);

  // Live clock for ticking source bill
  const now = useClock(1000);

  useEffect(() => {
    api.get<ClubConfig>('/api/config').then(setConfig).catch(() => {});
  }, []);

  const targetTable = availableTargets.find((t) => t._id === targetTableId);
  const activeGameTypes = targetTable?.isPrivateRoom ? (config?.roomGameTypes ?? []) : (config?.gameTypes ?? []);
  const gameType = activeGameTypes[selectedTypeIdx];
  const subtype = gameType?.hasSubtypes ? gameType.subtypes?.[selectedSubIdx] : null;

  useEffect(() => { setSelectedSubIdx(0); }, [selectedTypeIdx]);
  useEffect(() => { setSelectedTypeIdx(0); setSelectedSubIdx(0); }, [targetTableId]);

  // ── Source bill (current table) ──────────────────────────────
  const session = table.currentSession as any;
  const sourceBill = session ? computeBill(session, new Date(now)) : null;

  // ── New bill estimate (destination table) ────────────────────
  const newPrice = subtype ? subtype.price : (gameType?.flatPrice ?? 0);
  const newPerMin = subtype ? subtype.perMinuteRate : (gameType?.perMinuteRate ?? 0);
  const newMins = subtype ? subtype.gameMinutes : 60;

  async function handleSwitch() {
    if (!targetTableId) { setError('Pick a destination table.'); return; }
    if (!gameType) { setError('Pick a game type.'); return; }
    setBusy(true);
    setError(null);
    try {
      const price = subtype ? subtype.price : gameType.flatPrice;
      const perMin = subtype ? subtype.perMinuteRate : gameType.perMinuteRate;
      const mins = subtype ? subtype.gameMinutes : 60;
      const label = subtype ? `${gameType.name} - ${subtype.name}` : gameType.name;

      await api.post(`/api/tables/${table._id}/switch`, {
        targetTableId,
        gameType: label,
        billingMode: 'flat_rate',
        pricingType: label.toLowerCase().replace(/\s+/g, '_'),
        hourlyRate: (price / mins) * 60,
        flatPrice: price,
        durationMinutes: mins,
        overtimeRate: perMin,
        gracePeriodMinutes: 0,
        flatSurcharge: 0,
        minimumMinutes: null,
        customerName: customerName.trim(),
        closedBy: staffName,
      });
      onSwitched();
    } catch (e: any) {
      setError(e.message ?? 'Failed to switch table');
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
        disabled={busy || availableTargets.length === 0}
        onClick={handleSwitch}
        className="px-6 py-3 rounded-xl text-base font-bold bg-available text-white shadow-md hover:bg-available/90 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {busy ? 'Switching…' : 'Confirm Switch'}
      </button>
    </div>
  );

  return (
    <ModalShell
      title="Switch Table"
      subtitle={`${table.label ?? `Table ${table.tableNumber}`} → ${targetTable?.label ?? (targetTable ? `Table ${targetTable.tableNumber}` : '…')}`}
      onClose={onClose}
      busy={busy}
      footer={footer}
    >
      {/* ── BILL PREVIEW: Source → Destination ───────────────── */}
      {sourceBill && (
        <div className="mb-5 rounded-xl border-2 border-surface-border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
            {/* Source table bill */}
            <div className="bg-occupied-bg/40 px-4 py-3">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                {table.label ?? `Table ${table.tableNumber}`} — Closing
              </div>
              <div className="font-mono text-2xl font-extrabold text-ink tabular-nums">
                Rs {sourceBill.total.toLocaleString()}
              </div>
              <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-400 font-semibold">
                <div className="flex justify-between">
                  <span>Game ({sourceBill.elapsedMinutes} min)</span>
                  <span className="font-mono">Rs {sourceBill.tableTotal.toLocaleString()}</span>
                </div>
                {sourceBill.foodItems > 0 && (
                  <div className="flex justify-between">
                    <span>Food ({sourceBill.foodItems} item{sourceBill.foodItems > 1 ? 's' : ''})</span>
                    <span className="font-mono">Rs {sourceBill.foodTotal.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center px-3">
              <div className="w-8 h-8 rounded-full bg-brass-bg border-2 border-brass/30 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-brass">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* New table bill estimate */}
            <div className="bg-available-bg/40 px-4 py-3">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                {targetTable?.label ?? (targetTable ? `Table ${targetTable.tableNumber}` : 'Destination')} — New
              </div>
              <div className="font-mono text-2xl font-extrabold text-ink tabular-nums">
                {gameType ? (
                  <>
                    Rs {newPrice.toLocaleString()}
                    <span className="text-sm font-semibold text-slate-400 ml-1">
                      {subtype ? '' : '/hr'}
                    </span>
                  </>
                ) : (
                  <span className="text-base text-slate-400">Pick a rate →</span>
                )}
              </div>
              {gameType && (
                <div className="mt-1.5 text-[11px] text-slate-400 font-semibold">
                  {subtype ? (
                    <span>{subtype.gameMinutes} min included, then Rs {subtype.perMinuteRate}/min</span>
                  ) : (
                    <span>Then Rs {newPerMin}/min overtime</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Combined note */}
          <div className="bg-surface-dark/60 px-4 py-2 text-[11px] text-slate-400 font-semibold text-center border-t border-surface-border">
            Old bill is finalized · New timer starts fresh on the destination table
          </div>
        </div>
      )}

      {/* Customer Name */}
      <div className="mb-4">
        <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Customer Name</label>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Customer name"
          className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-3 text-base font-semibold text-white focus:outline-none focus:border-brass transition-colors"
        />
      </div>

      {/* Destination table picker */}
      <div className="mb-4">
        <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Move To</label>
        {availableTargets.length === 0 ? (
          <div className="flex items-center gap-2 text-occupied bg-occupied-bg border-2 border-occupied/20 rounded-xl px-4 py-3 text-sm font-semibold">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            No other tables are free right now.
          </div>
        ) : (
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
                {t.isPrivateRoom && <div className="text-[10px] uppercase text-brass/70 mt-0.5">Private</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Game Type */}
      <div className="mb-2">
        <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Game Type on New Table</label>
        {!config ? (
          <div className="text-sm text-slate-400 py-2">Loading rates…</div>
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
