'use client';

import { useState, useEffect } from 'react';
import { TableDoc } from '@/lib/types';
import { api } from '@/lib/api';
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

export default function StartSessionModal({
  table,
  onClose,
  onStarted,
}: {
  table: TableDoc;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [config, setConfig] = useState<ClubConfig | null>(null);
  const [selectedTypeIdx, setSelectedTypeIdx] = useState(0);
  const [selectedSubIdx, setSelectedSubIdx] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ClubConfig>('/api/config').then(setConfig).catch(() => {});
  }, []);

  const activeGameTypes = table.isPrivateRoom ? (config?.roomGameTypes ?? []) : (config?.gameTypes ?? []);
  const gameType = activeGameTypes[selectedTypeIdx];
  const subtype = gameType?.hasSubtypes ? gameType.subtypes?.[selectedSubIdx] : null;

  useEffect(() => { setSelectedSubIdx(0); }, [selectedTypeIdx]);

  async function handleStart() {
    if (!gameType) { setError('Pick a game type.'); return; }
    setBusy(true);
    setError(null);
    try {
      const price = subtype ? subtype.price : gameType.flatPrice;
      const perMin = subtype ? subtype.perMinuteRate : gameType.perMinuteRate;
      const mins = subtype ? subtype.gameMinutes : 60;
      const label = subtype ? `${gameType.name} - ${subtype.name}` : gameType.name;

      await api.post(`/api/tables/${table._id}/start`, {
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
        customerName: customerName.trim() || undefined,
      });
      onStarted();
    } catch (e: any) {
      setError(e.message ?? 'Failed to start session');
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
        disabled={busy || !config}
        onClick={handleStart}
        className="px-6 py-3 rounded-xl text-base font-bold bg-available text-white shadow-md hover:bg-available/90 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {busy ? 'Starting…' : 'Start Session'}
      </button>
    </div>
  );

  return (
    <ModalShell
      title="Start Session"
      subtitle={`${table.label ?? `Table ${table.tableNumber}`}${table.isPrivateRoom ? ' · Private Room' : ''}`}
      onClose={onClose}
      busy={busy}
      footer={footer}
    >
      {!config ? (
        <div className="text-sm text-slate-400 py-6 text-center">Loading rates…</div>
      ) : activeGameTypes.length === 0 ? (
        <div className="text-sm text-slate-400 py-6 text-center">
          No {table.isPrivateRoom ? 'room' : 'table'} rates configured. Go to Settings → Game Rates to add rates first.
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider">Game Type</label>
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
                  {gt.hasSubtypes
                    ? `${gt.subtypes.length} option${gt.subtypes.length > 1 ? 's' : ''}`
                    : `Rs ${gt.flatPrice}/hr`
                  }
                </span>
              </button>
            ))}
          </div>

          {/* Subtype picker */}
          {gameType && gameType.hasSubtypes && gameType.subtypes.length > 0 && (
            <div>
              <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-3 mb-1.5">Select Game</label>
              <div className="flex flex-col gap-1.5">
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
                    <div>
                      <span className="text-base font-semibold text-ink">{sub.name}</span>
                      <div className="text-sm text-slate-400">
                        {sub.gameMinutes} min included, then Rs {sub.perMinuteRate}/min
                      </div>
                    </div>
                    <span className="text-xl font-extrabold text-brass">Rs {sub.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Flat rate display */}
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

      {/* ── Customer Name (optional) ─────────────────────────── */}
      <div className="mt-4">
        <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
          Customer Name <span className="normal-case font-normal">(optional)</span>
        </label>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Leave blank for Guest"
          className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-3 text-base font-semibold text-white focus:outline-none focus:border-brass transition-colors"
        />
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
