'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Subtype {
  _id?: string;
  name: string;
  price: number;
  perMinuteRate: number;
  gameMinutes: number;
}

interface GameType {
  _id?: string;
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

type Section = 'tables' | 'room';

export default function TableRatesManager() {
  const [config, setConfig] = useState<ClubConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Per-section state
  const [showAddType, setShowAddType] = useState<Section | null>(null);
  const [newTypeName, setNewTypeName] = useState('');

  useEffect(() => {
    api.get<ClubConfig>('/api/config').then(setConfig).catch(() => {});
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────
  function getTypes(section: Section): GameType[] {
    return section === 'tables' ? (config?.gameTypes ?? []) : (config?.roomGameTypes ?? []);
  }

  function saveConfig(newGameTypes: GameType[], newRoomGameTypes: GameType[]) {
    setBusy(true);
    try {
      api.patch('/api/config', { gameTypes: newGameTypes, roomGameTypes: newRoomGameTypes }).then(() => {
        setConfig({ gameTypes: newGameTypes, roomGameTypes: newRoomGameTypes });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }).finally(() => setBusy(false));
    } catch { setBusy(false); }
  }

  function applyChange(section: Section, updater: (types: GameType[]) => GameType[]) {
    if (!config) return;
    const tables = [...config.gameTypes];
    const room = [...config.roomGameTypes];
    if (section === 'tables') {
      saveConfig(updater(tables), room);
    } else {
      saveConfig(tables, updater(room));
    }
  }

  function updateSubtype(section: Section, typeIdx: number, subIdx: number, field: keyof Subtype, value: any) {
    applyChange(section, (types) => {
      const updated = JSON.parse(JSON.stringify(types));
      updated[typeIdx].subtypes[subIdx][field] = value;
      return updated;
    });
  }

  function updateGameType(section: Section, typeIdx: number, field: keyof GameType, value: any) {
    applyChange(section, (types) => {
      const updated = JSON.parse(JSON.stringify(types));
      updated[typeIdx][field] = value;
      return updated;
    });
  }

  function addSubtype(section: Section, typeIdx: number) {
    applyChange(section, (types) => {
      const updated = JSON.parse(JSON.stringify(types));
      const defaultRate = 8;
      updated[typeIdx].subtypes.push({ name: 'New Game', price: 200, perMinuteRate: 8, gameMinutes: 25 });
      return updated;
    });
  }

  function removeSubtype(section: Section, typeIdx: number, subIdx: number) {
    if (!confirm('Remove this subtype?')) return;
    applyChange(section, (types) => {
      const updated = JSON.parse(JSON.stringify(types));
      updated[typeIdx].subtypes.splice(subIdx, 1);
      return updated;
    });
  }

  function addGameType(section: Section) {
    if (!config || !newTypeName.trim()) return;
    const defaultRate = section === 'room' ? 20 : 8;
    const newType: GameType = {
      name: newTypeName.trim(),
      hasSubtypes: false,
      flatPrice: section === 'room' ? 1200 : 0,
      perMinuteRate: defaultRate,
      subtypes: [],
    };
    applyChange(section, (types) => [...types, newType]);
    setNewTypeName('');
    setShowAddType(null);
  }

  function removeGameType(section: Section, typeIdx: number) {
    const types = getTypes(section);
    if (!confirm(`Remove "${types[typeIdx].name}" and all its subtypes?`)) return;
    applyChange(section, (types) => types.filter((_, i) => i !== typeIdx));
  }

  if (!config) return <div className="text-slate-400 py-8 text-center">Loading rates…</div>;

  return (
    <div className="space-y-4 p-3 sm:p-5">
      {/* ── Standard Tables Section ──────────────────────────── */}
      <SectionPanel
        section="tables"
        label="Standard Tables"
        subtitle="Rates for tables 1–4 (Single, Double, Century)"
        types={config.gameTypes}
        busy={busy}
        showAdd={showAddType === 'tables'}
        newTypeName={newTypeName}
        onNewNameChange={setNewTypeName}
        onToggleAdd={() => { setShowAddType(showAddType === 'tables' ? null : 'tables'); setNewTypeName(''); }}
        onAdd={() => addGameType('tables')}
        onRemoveType={(i) => removeGameType('tables', i)}
        onUpdateType={(i, f, v) => updateGameType('tables', i, f, v)}
        onAddSub={(i) => addSubtype('tables', i)}
        onRemoveSub={(i, j) => removeSubtype('tables', i, j)}
        onUpdateSub={(i, j, f, v) => updateSubtype('tables', i, j, f, v)}
        defaultOvertimeRate={8}
      />

      {/* ── Room Section ─────────────────────────────────────── */}
      <SectionPanel
        section="room"
        label="Private Room"
        subtitle="Rates for table 5 (Room Booking)"
        types={config.roomGameTypes}
        busy={busy}
        showAdd={showAddType === 'room'}
        newTypeName={newTypeName}
        onNewNameChange={setNewTypeName}
        onToggleAdd={() => { setShowAddType(showAddType === 'room' ? null : 'room'); setNewTypeName(''); }}
        onAdd={() => addGameType('room')}
        onRemoveType={(i) => removeGameType('room', i)}
        onUpdateType={(i, f, v) => updateGameType('room', i, f, v)}
        onAddSub={(i) => addSubtype('room', i)}
        onRemoveSub={(i, j) => removeSubtype('room', i, j)}
        onUpdateSub={(i, j, f, v) => updateSubtype('room', i, j, f, v)}
        defaultOvertimeRate={15}
      />

      {saved && (
        <div className="text-xs text-available text-center font-semibold">✓ Saved</div>
      )}
    </div>
  );
}

// ── Section Panel (reusable for tables and room) ────────────────
function SectionPanel({
  section,
  label,
  subtitle,
  types,
  busy,
  showAdd,
  newTypeName,
  onNewNameChange,
  onToggleAdd,
  onAdd,
  onRemoveType,
  onUpdateType,
  onAddSub,
  onRemoveSub,
  onUpdateSub,
  defaultOvertimeRate,
}: {
  section: Section;
  label: string;
  subtitle: string;
  types: GameType[];
  busy: boolean;
  showAdd: boolean;
  newTypeName: string;
  onNewNameChange: (v: string) => void;
  onToggleAdd: () => void;
  onAdd: () => void;
  onRemoveType: (i: number) => void;
  onUpdateType: (i: number, field: keyof GameType, value: any) => void;
  onAddSub: (i: number) => void;
  onRemoveSub: (i: number, j: number) => void;
  onUpdateSub: (i: number, j: number, field: keyof Subtype, value: any) => void;
  defaultOvertimeRate: number;
}) {
  return (
    <div className="bg-surface-card rounded-2xl border border-surface-border overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-4 border-b border-surface-border bg-surface-dark/40">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${section === 'tables' ? 'bg-brass' : 'bg-occupied'}`} />
              <span className="font-extrabold text-lg text-ink">{label}</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5 ml-[18px]">{subtitle}</div>
          </div>
        </div>
      </div>

      {/* Game types */}
      <div className="p-5 space-y-4">
        {types.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-3xl mb-2">🎱</div>
            <div className="text-sm font-semibold text-slate-400">No rates configured</div>
            <div className="text-xs text-slate-400/70 mt-1">Add a game type below to get started.</div>
          </div>
        ) : types.map((gt, typeIdx) => (
          <GameTypeCard
            key={gt._id ?? typeIdx}
            gt={gt}
            typeIdx={typeIdx}
            defaultOvertimeRate={defaultOvertimeRate}
            onRemove={() => onRemoveType(typeIdx)}
            onUpdateField={(field, value) => onUpdateType(typeIdx, field, value)}
            onAddSub={() => onAddSub(typeIdx)}
            onRemoveSub={(subIdx) => onRemoveSub(typeIdx, subIdx)}
            onUpdateSub={(subIdx, field, value) => onUpdateSub(typeIdx, subIdx, field, value)}
          />
        ))}

        {/* Add new game type */}
        {showAdd ? (
          <div className="bg-surface-dark rounded-xl border border-surface-border p-4 flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 uppercase mb-1.5">Game Type Name</label>
              <input
                value={newTypeName}
                onChange={(e) => onNewNameChange(e.target.value)}
                placeholder={section === 'room' ? 'e.g. VIP Room' : 'e.g. Tournament'}
                className="w-full rounded-xl bg-slate-800 border border-surface-border px-4 py-3 text-sm text-white focus:outline-none focus:border-brass/50"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && newTypeName.trim()) onAdd(); }}
              />
            </div>
            <button
              disabled={!newTypeName.trim()}
              onClick={onAdd}
              className="px-5 py-3 rounded-xl bg-brass/20 hover:bg-brass/30 border border-brass/30 text-sm font-semibold text-brass disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={onToggleAdd}
              className="px-4 py-3 rounded-xl text-sm text-slate-400 hover:text-white border border-surface-border hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={onToggleAdd}
            className="w-full py-4 rounded-xl border-2 border-dashed border-surface-border text-sm font-semibold text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
          >
            + Add Game Type
          </button>
        )}
      </div>
    </div>
  );
}

// ── Individual Game Type Card ───────────────────────────────────
function GameTypeCard({
  gt,
  typeIdx,
  defaultOvertimeRate,
  onRemove,
  onUpdateField,
  onAddSub,
  onRemoveSub,
  onUpdateSub,
}: {
  gt: GameType;
  typeIdx: number;
  defaultOvertimeRate: number;
  onRemove: () => void;
  onUpdateField: (field: keyof GameType, value: any) => void;
  onAddSub: () => void;
  onRemoveSub: (subIdx: number) => void;
  onUpdateSub: (subIdx: number, field: keyof Subtype, value: any) => void;
}) {
  return (
    <div className="bg-surface-dark rounded-xl border border-surface-border p-4">
      {/* Type header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <input
            value={gt.name}
            onChange={(e) => onUpdateField('name', e.target.value)}
            className="text-lg font-bold bg-transparent border-b-2 border-surface-border focus:outline-none focus:border-brass/50 w-48 text-white"
          />
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={gt.hasSubtypes}
              onChange={(e) => onUpdateField('hasSubtypes', e.target.checked)}
              className="accent-brass w-4 h-4"
            />
            Has subtypes
          </label>
        </div>
        <button
          onClick={onRemove}
          className="text-sm text-occupied/60 hover:text-occupied px-3 py-1 rounded-lg hover:bg-occupied/10 transition-colors"
        >
          Remove
        </button>
      </div>

      {/* No subtypes — single flat rate */}
      {!gt.hasSubtypes && (
        <div className="grid grid-cols-2 gap-4 mb-2">
          <div>
            <label className="block text-[10px] text-slate-400 uppercase mb-1.5">Flat Rate (Rs/hr)</label>
            <input
              type="number"
              value={gt.flatPrice}
              onChange={(e) => onUpdateField('flatPrice', Number(e.target.value) || 0)}
              className="w-full rounded-xl bg-slate-800 border border-surface-border px-4 py-3 text-lg font-mono text-white focus:outline-none focus:border-brass/50"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 uppercase mb-1.5">Overtime Per Min (Rs)</label>
            <input
              type="number"
              value={gt.perMinuteRate}
              onChange={(e) => onUpdateField('perMinuteRate', Number(e.target.value) || defaultOvertimeRate)}
              className="w-full rounded-xl bg-slate-800 border border-surface-border px-4 py-3 text-lg font-mono text-white focus:outline-none focus:border-brass/50"
            />
          </div>
        </div>
      )}

      {/* Subtypes table */}
      {gt.hasSubtypes && (
        <>
          <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[500px]">
          <div className="grid grid-cols-4 gap-2 sm:gap-3 text-[10px] text-slate-400 uppercase tracking-wider mb-2 px-1">
            <div>Name</div>
            <div>Rate (Rs)</div>
            <div>Per Min (Rs)</div>
            <div>Window (min)</div>
          </div>
          {gt.subtypes.map((sub, subIdx) => (
            <div key={sub._id ?? subIdx} className="grid grid-cols-4 gap-2 sm:gap-3 mb-2 items-center">
              <input
                value={sub.name}
                onChange={(e) => onUpdateSub(subIdx, 'name' as any, e.target.value)}
                className="rounded-xl bg-slate-800 border border-surface-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brass/50"
              />
              <input
                type="number"
                value={sub.price}
                onChange={(e) => onUpdateSub(subIdx, 'price', Number(e.target.value) || 0)}
                className="rounded-xl bg-slate-800 border border-surface-border px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brass/50"
              />
              <input
                type="number"
                value={sub.perMinuteRate}
                onChange={(e) => onUpdateSub(subIdx, 'perMinuteRate', Number(e.target.value) || defaultOvertimeRate)}
                className="rounded-xl bg-slate-800 border border-surface-border px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brass/50"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={sub.gameMinutes}
                  onChange={(e) => onUpdateSub(subIdx, 'gameMinutes', Number(e.target.value) || 0)}
                  className="rounded-xl bg-slate-800 border border-surface-border px-3 py-2.5 text-sm font-mono w-20 text-white focus:outline-none focus:border-brass/50"
                />
                <button
                  onClick={() => onRemoveSub(subIdx)}
                  className="text-xs text-occupied/50 hover:text-occupied px-2 py-1 rounded-lg hover:bg-occupied/10 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          </div>
          </div>
          <button
            onClick={onAddSub}
            className="mt-3 text-xs text-brass hover:text-brass-light font-semibold px-3 py-1.5 rounded-lg hover:bg-brass/10 transition-colors"
          >
            + Add Subtype
          </button>
        </>
      )}
    </div>
  );
}
