'use client';

export type AdminTab = 'rates' | 'menu' | 'reports' | 'reset';

const NAV_ITEMS: { key: AdminTab; label: string; icon: string }[] = [
  { key: 'rates', label: 'Game Rates', icon: '🏷️' },
  { key: 'menu', label: 'Menu Items', icon: '🍽️' },
  { key: 'reports', label: 'Reports', icon: '📊' },
  { key: 'reset', label: 'Data Reset', icon: '🧹' },
];

export default function Sidebar({
  active, onSelect,
}: {
  active: AdminTab;
  onSelect: (tab: AdminTab) => void;
}) {
  return (
    <>
      {/* Mobile: horizontal tab bar */}
      <div className="settings-sidebar md:hidden bg-surface-card border-b-2 border-surface-border px-3 py-2 shrink-0">
        <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2 px-1">Settings</div>
        <div className="flex gap-1.5 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                active === item.key
                  ? 'bg-brass-bg text-brass border-2 border-brass/30 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800 border-2 border-transparent'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: vertical sidebar */}
      <aside className="settings-sidebar hidden md:flex w-64 bg-surface-card border-r-2 border-surface-border flex-col shrink-0">
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
    </>
  );
}
