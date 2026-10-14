'use client';

import { useEffect, useState } from 'react';
import { ShiftDoc } from '@/lib/types';
import { api } from '@/lib/api';

export default function Header({
  clubName, tab, onTabChange, staffName, onStaffNameChange, activeShift, onShiftChange, onLogout,
}: {
  clubName: string;
  tab: 'floor' | 'admin';
  onTabChange: (tab: 'floor' | 'admin') => void;
  staffName: string;
  onStaffNameChange: (name: string) => void;
  activeShift: ShiftDoc | null;
  onShiftChange: () => void;
  onLogout: () => void;
}) {
  const [time, setTime] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [endingCash, setEndingCash] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [reconciliation, setReconciliation] = useState<any>(null);

  useEffect(() => {
    setTime(new Date());
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  async function handleStartShift() {
    if (!staffName.trim()) { alert('Enter your name first.'); return; }
    setBusy(true);
    try {
      await api.post('/api/shifts', { staffName: staffName.trim(), startingCash: 0 });
      onShiftChange();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  async function handleEndShift() {
    setBusy(true);
    try {
      const result = await api.post<{ data: { summary: any } }>('/api/shifts/end', {
        endingCash: Number(endingCash) || 0, notes: shiftNotes,
      });
      setReconciliation(result.data.summary);
      setShowEndModal(false);
      onShiftChange();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <header className="bg-surface-card border-b-2 border-surface-border px-3 sm:px-5 py-2.5 sm:py-3">
        <div className="dashboard-header flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          {/* Logo + Club Name */}
          <div className="dashboard-brand flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-available flex items-center justify-center shadow-card shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="sm:w-5 sm:h-5">
                <circle cx="12" cy="12" r="10" fill="white" />
                <circle cx="12" cy="12" r="5" fill="#16a34a" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-extrabold text-ink tracking-tight truncate max-w-[120px] sm:max-w-[200px] lg:max-w-none">{clubName}</div>
              <div className="text-[9px] sm:text-[10px] text-slate-400 font-semibold uppercase tracking-widest hidden sm:block">Table Management</div>
            </div>
          </div>

          {/* Nav tabs */}
          <nav className="dashboard-nav flex items-center gap-1 bg-slate-800 rounded-xl p-1 shrink-0">
            <button
              onClick={() => onTabChange('floor')}
              className={`px-2.5 sm:px-5 py-1.5 sm:py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                tab === 'floor'
                  ? 'bg-available text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >Floor</button>
            <button
              onClick={() => onTabChange('admin')}
              className={`px-2.5 sm:px-5 py-1.5 sm:py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                tab === 'admin'
                  ? 'bg-brass text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >Settings</button>
          </nav>

          {/* Staff + Shift + Clock — desktop */}
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 font-semibold uppercase shrink-0">Staff</label>
              <input
                value={staffName}
                onChange={(e) => onStaffNameChange(e.target.value)}
                placeholder="Your name"
                className="w-28 rounded-xl bg-slate-800 border-2 border-surface-border px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:border-brass"
              />
            </div>

            {activeShift ? (
              <button
                onClick={() => { setShowEndModal(true); setEndingCash(''); setShiftNotes(''); setReconciliation(null); }}
                className="px-4 py-2 rounded-xl bg-occupied text-white text-sm font-bold shadow-md hover:bg-occupied/90"
              >End Shift</button>
            ) : (
              <button disabled={busy} onClick={handleStartShift}
                className="px-4 py-2 rounded-xl bg-available text-white text-sm font-bold shadow-md hover:bg-available/90 disabled:opacity-50"
              >Start Shift</button>
            )}

            <button onClick={onLogout}
              className="px-3 py-2 rounded-xl bg-slate-800 border-2 border-surface-border text-sm font-semibold text-slate-400 hover:text-occupied hover:border-occupied/30 transition-all">
              Logout
            </button>

            <div className="font-mono text-sm font-bold text-ink tabular-nums min-w-[80px] text-right">
              {time ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
            </div>
          </div>

          {/* Mobile compact controls */}
          <div className="dashboard-mobile-controls flex md:hidden items-center gap-1.5 shrink-0">
            <input
              value={staffName}
              onChange={(e) => onStaffNameChange(e.target.value)}
              placeholder="Name"
              className="w-16 rounded-lg bg-slate-800 border border-surface-border px-2 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-brass"
            />
            {activeShift ? (
              <button
                onClick={() => { setShowEndModal(true); setEndingCash(''); setShiftNotes(''); setReconciliation(null); }}
                className="px-2.5 py-1.5 rounded-lg bg-occupied text-white text-xs font-bold"
              >End</button>
            ) : (
              <button disabled={busy} onClick={handleStartShift}
                className="px-2.5 py-1.5 rounded-lg bg-available text-white text-xs font-bold disabled:opacity-50"
              >Start</button>
            )}
            <button onClick={onLogout}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-surface-border text-xs font-semibold text-slate-400">
              ↩
            </button>
            <div className="font-mono text-xs font-bold text-ink tabular-nums">
              {time ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
            </div>
          </div>
        </div>
      </header>

      {/* Active shift banner */}
      {activeShift && (
        <div className="bg-available-bg border-b-2 border-available/20 px-4 sm:px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-available animate-pulse" />
            <span className="text-available font-extrabold text-xs sm:text-sm">SHIFT ACTIVE</span>
            <span className="text-slate-300 font-semibold text-xs sm:text-sm">
              {activeShift.staffName} · started {new Date(activeShift.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      )}

      {/* End Shift Modal */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface-card rounded-3xl w-full max-w-lg p-6 sm:p-8 shadow-xl">
            <div className="text-2xl font-extrabold text-ink mb-2">End Shift</div>
            <p className="text-base text-slate-400 mb-6">Count the cash drawer and enter the total.</p>

            {!reconciliation ? (
              <>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-xs text-slate-400 font-semibold uppercase mb-2">Cash in Drawer (Rs)</label>
                    <input type="number" value={endingCash} onChange={(e) => setEndingCash(e.target.value)}
                      placeholder="Counted amount"
                      className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-4 text-2xl font-mono font-bold text-white focus:outline-none focus:border-brass" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 font-semibold uppercase mb-2">Notes (optional)</label>
                    <input value={shiftNotes} onChange={(e) => setShiftNotes(e.target.value)}
                      placeholder="Short discrepancy notes"
                      className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-3 text-base text-white focus:outline-none focus:border-brass" />
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowEndModal(false)}
                    className="px-6 py-3 rounded-xl text-base font-semibold border-2 border-surface-border text-ink hover:bg-slate-700">Cancel</button>
                  <button disabled={busy} onClick={handleEndShift}
                    className="px-6 py-3 rounded-xl text-base font-bold bg-occupied text-white hover:bg-occupied/90 disabled:opacity-50">
                    {busy ? 'Closing…' : 'Close & Reconcile'}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800 rounded-2xl p-4 text-center">
                    <div className="text-xs text-slate-400 font-semibold uppercase">Expected</div>
                    <div className="font-mono text-2xl font-bold text-ink">Rs {reconciliation.expectedCash.toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-800 rounded-2xl p-4 text-center">
                    <div className="text-xs text-slate-400 font-semibold uppercase">Actual</div>
                    <div className="font-mono text-2xl font-bold text-ink">Rs {reconciliation.endingCash.toLocaleString()}</div>
                  </div>
                </div>
                <div className={`rounded-2xl border-2 p-4 text-center ${
                  reconciliation.difference === 0 ? 'border-available bg-available-bg' : 'border-occupied bg-occupied-bg'
                }`}>
                  <div className={`font-mono text-3xl font-extrabold ${
                    reconciliation.difference === 0 ? 'text-available' : 'text-occupied'
                  }`}>
                    {reconciliation.difference === 0 ? '✓ Balanced' :
                     reconciliation.difference > 0 ? `+Rs ${reconciliation.difference.toLocaleString()} over` :
                     `−Rs ${Math.abs(reconciliation.difference).toLocaleString()} short`}
                  </div>
                </div>
                <button onClick={() => { setReconciliation(null); onShiftChange(); }}
                  className="w-full py-4 rounded-xl text-base font-bold bg-available text-white hover:bg-available/90">Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
