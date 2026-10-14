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
import DataReset from '@/components/DataReset';
import Sidebar, { AdminTab } from '@/components/Sidebar';
import LoginScreen from '@/components/LoginScreen';

const POLL_MS = 4000;
const CLUB_NAME = process.env.NEXT_PUBLIC_CLUB_NAME || 'Break & Game';

function FitGrid<T extends { _id: string }>({
  tables,
  cols,
  children,
}: {
  tables: T[];
  cols: number;
  children: (t: T) => ReactNode;
}) {
  return (
    <div
      className="grid gap-3 sm:gap-4"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      {tables.map((t) => (
        <div key={t._id}>{children(t)}</div>
      ))}
    </div>
  );
}

function useWindowWidth() {
  const [width, setWidth] = useState(1440);
  useEffect(() => {
    setWidth(window.innerWidth);
    function handleResize() { setWidth(window.innerWidth); }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return width;
}

export default function DashboardPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<'floor' | 'admin'>('floor');
  const [floorSubTab, setFloorSubTab] = useState<'dashboard' | 'customers'>('dashboard');
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

  const windowWidth = useWindowWidth();

  // Responsive column counts
  const mainCols = windowWidth < 640 ? 1 : windowWidth < 1024 ? 2 : windowWidth < 1440 ? 3 : 4;
  const isMobile = windowWidth < 768;

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

  // Check auth on mount — ask the server whether the session cookie is valid
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ authenticated: boolean }>('/api/auth/status');
        if (!cancelled) setAuthenticated(!!res.authenticated);
      } catch {
        if (!cancelled) setAuthenticated(false);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => { cancelled = true; };
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

  async function handleLogout() {
    try { await api.post('/api/auth/logout'); } catch { /* session already gone */ }
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
    <div className="min-h-dvh flex flex-col bg-surface-dark">
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

      <div className="flex-1 flex flex-col md:flex-row">
        {/* === FLOOR VIEW === */}
        {tab === 'floor' && (
          <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6 flex flex-col gap-3 sm:gap-4">
            {loadError && (
              <div className="shrink-0 bg-occupied/10 border border-occupied/30 rounded-xl p-3 sm:p-4 text-xs sm:text-sm text-occupied">
                {loadError}
              </div>
            )}

            {/* Floor sub-tabs: Dashboard | Customers */}
            <div className="floor-toolbar shrink-0 flex flex-wrap items-center justify-between gap-2">
              <StatsStrip tables={tables} todayRevenue={todayRevenue} customerAccounts={customerAccounts} />
              <nav className="flex items-center gap-1 bg-slate-800 rounded-2xl p-1 shrink-0">
                <button
                  onClick={() => setFloorSubTab('dashboard')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                    floorSubTab === 'dashboard'
                      ? 'bg-available text-white shadow-lg'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >📊 Dashboard</button>
                <button
                  onClick={() => setFloorSubTab('customers')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                    floorSubTab === 'customers'
                      ? 'bg-brass text-white shadow-lg'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >👥 Customers</button>
              </nav>
            </div>

            {/* Dashboard sub-tab */}
            {floorSubTab === 'dashboard' && tables.length > 0 ? (
              <div className="min-w-0 flex flex-col lg:flex-row gap-3 sm:gap-4">
                <div className="min-w-0 flex-1 flex flex-col">
                  <div className="shrink-0 text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 sm:mb-3">Standard Tables</div>
                  <FitGrid tables={mainTables} cols={mainCols}>
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
                  <div className="min-w-0 w-full lg:w-80 xl:w-96 shrink-0 flex flex-col">
                    <div className="shrink-0 text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 sm:mb-3">Private Room</div>
                    <FitGrid tables={privateTables} cols={isMobile ? mainCols : 1}>
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
            ) : floorSubTab === 'dashboard' && !loading ? (
              <div className="text-center py-12 text-slate-400">
                <div className="text-lg font-bold mb-2">No tables configured</div>
                <div className="text-sm">Run /api/seed to initialize tables and rates.</div>
              </div>
            ) : null}

            {/* Customers sub-tab */}
            {floorSubTab === 'customers' && (
              <div className="flex-1 overflow-y-auto">
                <CustomerHistory />
              </div>
            )}
          </main>
        )}

        {/* === ADMIN VIEW with SIDEBAR === */}
        {tab === 'admin' && (
          <>
            <Sidebar active={adminTab} onSelect={setAdminTab} />
            <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6 flex flex-col">
              <div className="flex-1 overflow-y-auto rounded-2xl border-2 border-surface-border bg-surface-card/40">
                {adminTab === 'rates' && <TableRatesManager />}
                {adminTab === 'menu' && <MenuManager menu={menu} onChanged={refresh} />}
                {adminTab === 'reports' && <RevenueReport />}
                {adminTab === 'reset' && <DataReset />}
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
