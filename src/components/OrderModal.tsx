'use client';

import { useState } from 'react';
import { MenuItemDoc, TableDoc } from '@/lib/types';
import { api } from '@/lib/api';
import ModalShell from './ModalShell';

export default function OrderModal({
  table,
  menu,
  onClose,
  onChanged,
}: {
  table: TableDoc;
  menu: MenuItemDoc[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addItem(item: MenuItemDoc) {
    setBusyId(item._id);
    try {
      await api.post(`/api/tables/${table._id}/order`, { menuItemId: item._id, quantity: 1 });
      onChanged();
    } catch (e: any) {
      alert(e.message ?? 'Failed to add item');
    } finally { setBusyId(null); }
  }

  async function removeOrder(orderId: string) {
    setBusyId(orderId);
    try {
      await api.del(`/api/tables/${table._id}/order?orderId=${orderId}`);
      onChanged();
    } catch (e: any) {
      alert(e.message ?? 'Failed to remove item');
    } finally { setBusyId(null); }
  }

  const grouped = menu.reduce<Record<string, MenuItemDoc[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  const orders = table.currentSession?.activeOrders ?? [];

  return (
    <ModalShell
      title="Quick Menu"
      subtitle={table.label ?? `Table ${table.tableNumber}`}
      onClose={onClose}
      width="max-w-lg"
      footer={
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-xl text-base font-semibold border-2 border-surface-border text-ink hover:bg-slate-700 active:scale-[0.98] transition-all"
          >
            Done
          </button>
        </div>
      }
    >
      {/* Active orders */}
      {orders.length > 0 && (
        <div className="mb-5">
          <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Active Order</label>
          <div className="flex flex-col gap-1.5">
            {orders.map((o) => {
              const lineGross = o.price * o.quantity;
              return (
                <div key={o._id} className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-2.5 border border-surface-border">
                  <span className="text-base font-semibold text-ink">
                    {o.quantity}x {o.itemName}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono font-bold text-brass">
                      Rs {lineGross.toLocaleString()}
                    </span>
                    <button
                      disabled={busyId === o._id}
                      onClick={() => removeOrder(o._id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-occupied/60 hover:text-occupied hover:bg-occupied/10 transition-colors disabled:opacity-50"
                      title="Remove item"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Menu items by category */}
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="mb-4">
          <label className="block text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">{category}</label>
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => (
              <button
                key={item._id}
                disabled={busyId === item._id || !item.inStock}
                onClick={() => addItem(item)}
                className="rounded-xl bg-slate-800 border-2 border-surface-border hover:border-brass/40 hover:bg-brass-bg px-4 py-3 text-left transition-all disabled:opacity-40 active:scale-[0.97]"
              >
                <div className="text-base font-semibold text-ink">{item.itemName}</div>
                <div className="text-sm text-brass font-bold">Rs {item.price.toLocaleString()}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </ModalShell>
  );
}
