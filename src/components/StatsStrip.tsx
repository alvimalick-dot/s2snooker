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
    { label: 'Active', value: active, color: 'text-occupied', bg: 'bg-occupied-bg', border: 'border-occupied/30' },
    { label: 'Available', value: available, color: 'text-available', bg: 'bg-available-bg', border: 'border-available/30' },
    { label: "Today's Revenue", value: todayRevenue !== null ? `Rs ${todayRevenue.toLocaleString()}` : '—', color: 'text-ink', bg: 'bg-surface-card', border: 'border-surface-border' },
    { label: 'Orders', value: pendingOrders, color: 'text-reserved', bg: 'bg-reserved-bg', border: 'border-reserved/30' },
    { label: 'Outstanding', value: outstandingBalance > 0 ? `Rs ${outstandingBalance.toLocaleString()}` : '—', color: outstandingBalance > 0 ? 'text-occupied' : 'text-slate-400', bg: outstandingBalance > 0 ? 'bg-occupied-bg' : 'bg-slate-800/60', border: outstandingBalance > 0 ? 'border-occupied/30' : 'border-surface-border' },
  ];

  return (
    <div className="grid grid-cols-5 gap-4">
      {stats.map((s) => (
        <div key={s.label} className={`${s.bg} rounded-2xl border-2 ${s.border} px-5 py-4 text-center shadow-card`}>
          <div className={`font-mono text-2xl font-extrabold tabular-nums ${s.color}`}>{s.value}</div>
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
