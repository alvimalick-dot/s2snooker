'use client';

import { useCallback, useEffect, useState } from 'react';
import { ReactNode } from 'react';
import { MenuItemDoc, TableDoc, ShiftDoc, CustomerAccountDoc } from '@/lib/types';
import { api } from '@/lib/api';
import { todayPKT } from '@/lib/useClock';
import Header from '@/components/Header';
import StatsStrip from '@/components/StatsStrip';
import TableCard from '@/components/TableCard';
import StartSessionModal from '@/components/StartSessionModal';
import OrderModal from '@/components/OrderModal';
import EndSessionModal from '@/components/EndSessionModal';
import NewGameModal from '@/components/NewGameModal';
import MenuManager from '@/components/MenuManager';
import TableRatesManager from '@/components/TableRatesManager';
import RevenueReport from '@/components/RevenueReport';
import CustomerHistory from '@/components/CustomerHistory';
import Sidebar, { AdminTab } from '@/components/Sidebar';
import LoginScreen from '@/components/LoginScreen';

const POLL_MS = 4000;
const CLUB_NAME = process.env.NEXT_PUBLIC_CLUB_NAME || 'The Break Snooker Club';

function FitGrid<T extends { _id: string }>({
  tables,
  cols,
  children,
}: {
  tables: T[];
  cols: number;
  children: (t: T) => ReactNode;
}) {
  const rows = Math.max(1, Math.ceil(tables.length / cols));
  return (
    <div
      className="flex-1 min-h-0 grid gap-4"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {tables.map((t) => (
        <div key={t._id} className="min-h-0 overflow-hidden">{children(t)}</div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<'floor' | 'admin'>('floor');
  const [adminTab, setAdminTab] = useState<AdminTab>('rates');
  const [tables, setTables] = useState<TableDoc[]>([]);
  const [menu, setMenu] = useState<MenuItemDoc[]>([]);
  const [todayRevenue, setTodayRevenue] = useState<number | null>(null);
  const [activeShift, setActiveShift] = useState<ShiftDoc | null>(null);
  const [customerAccounts, setCustomerAccounts] = useState<CustomerAccountDoc[]>([]);
  const [staffName, setStaffName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [startModalTable, setStartModalTable] = useState<TableDoc | null>(null);
  const [orderModalTable, setOrderModalTable] = useState<TableDoc | null>(null);
  const [endModalTable, setEndModalTable] = useState<TableDoc | null>(null);
  const [newGameModalTable, setNewGameModalTable] = useState<TableDoc | null>(null);

  const refresh = useCallback(async () => {
    try {
      const todayLocal = todayPKT();
      const [t, m, rep, shifts, accts] = await Promise.all([
        api.get<TableDoc[]>('/api/tables'),
        api.get<MenuItemDoc[]>('/api/menu'),
        api.get<{ totals: { totalRevenue: number } }>(`/api/reports?from=${todayLocal}&to=${todayLocal}`),
        api.get<ShiftDoc[]>('/api/shifts'),
        api.get<CustomerAccountDoc[]>('/api/customers/account'),
      ]);

      // Auto-create tables + config on first load
      if (t.length === 0) {
        await api.post('/api/seed');
        const [t2, m2] = await Promise.all([
          api.get<TableDoc[]>('/api/tables'),
          api.get<MenuItemDoc[]>('/api/menu'),
        ]);
        setTables(t2);
        setMenu(m2);
      } else {
        setTables(t);
        setMenu(m);
      }
      setTodayRevenue(rep.totals.totalRevenue);
      const current = (shifts as ShiftDoc[]).find((s) => s.status === 'active') ?? null;
      setActiveShift(current);
      setCustomerAccounts(accts as CustomerAccountDoc[]);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to reach the API.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Check auth on mount
  useEffect(() => {
    const authed = localStorage.getItem('snooker-auth') === '1';
    setAuthenticated(authed);
    setAuthChecked(true);
  }, []);

  // Load data only when authenticated
  useEffect(() => {
    if (!authenticated) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [authenticated, refresh]);

  useEffect(() => {
    const saved = window.localStorage.getItem('snooker-staff-name');
    if (saved) setStaffName(saved);
  }, []);

  function updateStaffName(name: string) {
    setStaffName(name);
    window.localStorage.setItem('snooker-staff-name', name);
  }

  function handleLogout() {
    localStorage.removeItem('snooker-auth');
    setAuthenticated(false);
  }

  // keep open modals fresh
  useEffect(() => {
    if (startModalTable) {
      const fresh = tables.find((t) => t._id === startModalTable._id);
      if (fresh) setStartModalTable(fresh);
    }
    if (orderModalTable) {
      const fresh = tables.find((t) => t._id === orderModalTable._id);
      if (fresh) setOrderModalTable(fresh);
    }
    if (endModalTable) {
      const fresh = tables.find((t) => t._id === endModalTable._id);
      if (fresh) setEndModalTable(fresh);
    }
    if (newGameModalTable) {
      const fresh = tables.find((t) => t._id === newGameModalTable._id);
      if (fresh) setNewGameModalTable(fresh);
    }
  }, [tables]);

  const mainTables = tables.filter((t) => !t.isPrivateRoom);
  const privateTables = tables.filter((t) => t.isPrivateRoom);

  // Auth gate — show login if not authenticated
  if (!authChecked) return null;
  if (!authenticated) return <LoginScreen onLogin={() => setAuthenticated(true)} />;

  return (
    <div className="h-dvh flex flex-col bg-surface-dark">
      <Header
        clubName={CLUB_NAME}
        tab={tab}
        onTabChange={setTab}
        staffName={staffName}
        onStaffNameChange={updateStaffName}
        activeShift={activeShift}
        onShiftChange={refresh}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* === FLOOR VIEW === */}
        {tab === 'floor' && (
          <main className="flex-1 min-h-0 overflow-hidden p-6 flex flex-col gap-4">
            {loadError && (
              <div className="shrink-0 bg-occupied/10 border border-occupied/30 rounded-xl p-4 text-sm text-occupied">
                {loadError}
              </div>
            )}

            <div className="shrink-0">
              <StatsStrip tables={tables} todayRevenue={todayRevenue} customerAccounts={customerAccounts} />
            </div>

            {tables.length > 0 ? (
              <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="shrink-0 text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Standard Tables</div>
                  <FitGrid tables={mainTables} cols={4}>
                    {(t) => (
                      <TableCard
                        key={t._id}
                        table={t}
                        staffName={staffName}
                        onChanged={refresh}
                        onOpenStart={setStartModalTable}
                        onOpenOrder={setOrderModalTable}
                        onOpenEnd={setEndModalTable}
                        onOpenNewGame={setNewGameModalTable}
                      />
                    )}
                  </FitGrid>
                </div>

                {privateTables.length > 0 && (
                  <div className="w-[22rem] shrink-0 min-h-0 flex flex-col">
                    <div className="shrink-0 text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Private Room</div>
                    <FitGrid tables={privateTables} cols={1}>
                      {(t) => (
                        <TableCard
                          key={t._id}
                          table={t}
                          staffName={staffName}
                          onChanged={refresh}
                          onOpenStart={setStartModalTable}
                          onOpenOrder={setOrderModalTable}
                          onOpenEnd={setEndModalTable}
                          onOpenNewGame={setNewGameModalTable}
                        />
                      )}
                    </FitGrid>
                  </div>
                )}
              </div>
            ) : !loading ? (
              <div className="text-center py-12 text-slate-400">
                <div className="text-lg font-bold mb-2">No tables configured</div>
                <div className="text-sm">Run /api/seed to initialize tables and rates.</div>
              </div>
            ) : null}
          </main>
        )}

        {/* === ADMIN VIEW with SIDEBAR === */}
        {tab === 'admin' && (
          <>
            <Sidebar active={adminTab} onSelect={setAdminTab} />
            <main className="flex-1 min-h-0 overflow-hidden p-6 flex flex-col">
              <div className={`flex-1 min-h-0 ${adminTab === 'customers' ? 'overflow-y-auto' : 'overflow-y-auto rounded-2xl border-2 border-surface-border bg-surface-card/40'}`}>
                {adminTab === 'rates' && <TableRatesManager />}
                {adminTab === 'menu' && <MenuManager menu={menu} onChanged={refresh} />}
                {adminTab === 'customers' && <CustomerHistory />}
                {adminTab === 'reports' && <RevenueReport />}
              </div>
            </main>
          </>
        )}
      </div>

      {/* Modals */}
      {startModalTable && (
        <StartSessionModal
          table={startModalTable}
          onClose={() => setStartModalTable(null)}
          onStarted={() => { setStartModalTable(null); refresh(); }}
        />
      )}
      {orderModalTable && (
        <OrderModal
          table={orderModalTable}
          menu={menu}
          onClose={() => setOrderModalTable(null)}
          onChanged={refresh}
        />
      )}
      {endModalTable && (
        <EndSessionModal
          table={endModalTable}
          onClose={() => setEndModalTable(null)}
          onEnded={() => { setEndModalTable(null); refresh(); }}
        />
      )}
      {newGameModalTable && (
        <NewGameModal
          table={newGameModalTable}
          allTables={tables}
          onClose={() => setNewGameModalTable(null)}
          onDone={() => { setNewGameModalTable(null); refresh(); }}
        />
      )}
    </div>
  );
}
