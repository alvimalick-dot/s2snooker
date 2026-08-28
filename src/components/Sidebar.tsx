'use client';

export type AdminTab = 'rates' | 'menu' | 'customers' | 'reports';

const NAV_ITEMS: { key: AdminTab; label: string; icon: string }[] = [
  { key: 'rates', label: 'Game Rates', icon: '🏷️' },
  { key: 'menu', label: 'Menu Items', icon: '🍽️' },
  { key: 'customers', label: 'Customers', icon: '👥' },
  { key: 'reports', label: 'Reports', icon: '📊' },
];

export default function Sidebar({
  active, onSelect,
}: {
  active: AdminTab;
  onSelect: (tab: AdminTab) => void;
}) {
  return (
    <aside className="w-64 bg-surface-card border-r-2 border-surface-border flex flex-col shrink-0">
      <div className="px-5 py-4 border-b border-surface-border">
        <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">Settings</div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-base font-bold transition-all ${
              active === item.key
                ? 'bg-brass-bg text-brass border-2 border-brass/30 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800 border-2 border-transparent'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
