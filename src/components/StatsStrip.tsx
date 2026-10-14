'use client';

import { TableDoc, CustomerAccountDoc } from '@/lib/types';

export default function StatsStrip({
  tables, todayRevenue, customerAccounts,
}: {
  tables: TableDoc[];
  todayRevenue: number | null;
  customerAccounts: CustomerAccountDoc[];
}) {
  const active = tables.filter((t) => t.status === 'occupied').length;
  const available = tables.filter((t) => t.status === 'available').length;
  const pendingOrders = tables.reduce((sum, t) => sum + (t.currentSession?.activeOrders.length ?? 0), 0);
  const outstandingBalance = customerAccounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);

  const stats = [
    { label: 'Active', value: active, color: 'text-occupied', bg: 'bg-occupied-bg', border: 'border-occupied/30', icon: '●' },
    { label: 'Available', value: available, color: 'text-available', bg: 'bg-available-bg', border: 'border-available/30', icon: '／' },
    { label: "Today's Revenue", value: todayRevenue !== null ? `Rs ${todayRevenue.toLocaleString()}` : '—', color: 'text-ink', bg: 'bg-surface-card', border: 'border-surface-border', icon: '₹' },
    { label: 'Orders', value: pendingOrders, color: 'text-reserved', bg: 'bg-reserved-bg', border: 'border-reserved/30', icon: '▽' },
    { label: 'Outstanding', value: outstandingBalance > 0 ? `Rs ${outstandingBalance.toLocaleString()}` : '—', color: outstandingBalance > 0 ? 'text-occupied' : 'text-slate-400', bg: outstandingBalance > 0 ? 'bg-occupied-bg' : 'bg-slate-800/60', border: outstandingBalance > 0 ? 'border-occupied/30' : 'border-surface-border', icon: '▤' },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 flex-1 min-w-0">
      {stats.map((s) => (
        <div key={s.label} className={`${s.bg} scoreboard-tile rounded-xl border-2 ${s.border} px-3 py-2 text-center shadow-card shrink-0 min-w-[80px]`}>
          <div className="scoreboard-icon" aria-hidden="true">{s.icon}</div>
          <div className={`font-mono text-base sm:text-lg font-extrabold tabular-nums ${s.color}`}>{s.value}</div>
          <div className="text-[9px] sm:text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5 whitespace-nowrap">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
