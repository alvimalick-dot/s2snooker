'use client';

import { useState } from 'react';
import { MenuItemDoc } from '@/lib/types';
import { api } from '@/lib/api';

export default function MenuManager({
  menu,
  onChanged,
}: {
  menu: MenuItemDoc[];
  onChanged: () => void;
}) {
  const [itemName, setItemName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addItem() {
    if (!itemName.trim() || !price) {
      setError('Item name and price are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/menu', {
        itemName: itemName.trim(),
        price: Number(price),
        description: description.trim(),
      });
      setItemName('');
      setPrice('');
      setDescription('');
      onChanged();
    } catch (e: any) {
      setError(e.message ?? 'Failed to add item');
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    if (!confirm('Remove this menu item?')) return;
    await api.del(`/api/menu/${id}`);
    onChanged();
  }

  async function toggleStock(item: MenuItemDoc) {
    await api.patch(`/api/menu/${item._id}`, { inStock: !item.inStock });
    onChanged();
  }

  return (
    <div className="p-3 sm:p-5">
      <div className="text-xl font-extrabold text-ink mb-4">Pricing &amp; Menu</div>

      <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Price List &amp; Menu</div>
      <div className="flex flex-col gap-1.5 mb-4 max-h-64 overflow-y-auto pr-1">
        {menu.length === 0 && (
          <div className="py-8 text-center">
            <div className="text-base font-bold text-slate-400 mb-1">No menu items yet</div>
            <div className="text-sm text-slate-400">Add your first item below.</div>
          </div>
        )}
        {menu.map((item) => (
          <div key={item._id}
            className="flex items-center justify-between text-base bg-slate-800 rounded-xl px-4 py-2.5 border-2 border-surface-border">
            <button
              onClick={() => toggleStock(item)}
              title={item.inStock ? 'Mark out of stock' : 'Mark in stock'}
              className={`text-left flex-1 font-semibold ${item.inStock ? 'text-ink' : 'text-slate-300 line-through'}`}
            >
              {item.itemName}
            </button>
            <span className="text-brass font-bold mr-3 tabular-nums">Rs {item.price.toLocaleString()}</span>
            <button onClick={() => removeItem(item._id)} className="text-occupied text-sm font-bold hover:underline">remove</button>
          </div>
        ))}
      </div>

      <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">Add New Menu Item</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        <input value={itemName} onChange={(e) => setItemName(e.target.value)}
          placeholder="Item Name"
          className="rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-3 text-base font-semibold text-white focus:outline-none focus:border-brass transition-colors" />
        <input value={price} onChange={(e) => setPrice(e.target.value)}
          placeholder="Price" type="number"
          className="rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-3 text-base font-semibold font-mono text-white focus:outline-none focus:border-brass transition-colors" />
      </div>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="Description" rows={2}
        className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-3 text-base font-semibold text-white mb-2 focus:outline-none focus:border-brass transition-colors" />

      {error && (
        <div className="flex items-center gap-2 text-occupied bg-occupied-bg border-2 border-occupied/20 rounded-xl px-4 py-2.5 text-sm font-semibold mb-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          {error}
        </div>
      )}

      <button disabled={busy} onClick={addItem}
        className="w-full py-3.5 rounded-xl bg-available hover:bg-available/90 text-white text-base font-bold uppercase tracking-wide shadow-md active:scale-[0.98] transition-all disabled:opacity-50">
        {busy ? 'Adding…' : 'Add Item'}
      </button>
    </div>
  );
}
