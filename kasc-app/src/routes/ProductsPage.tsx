import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { makeKasc } from '../lib/kasc';
import { friendlyMessage } from '../lib/errors';
import { useAuth } from '../auth/useAuth';
import { formatCurrency as fmt } from '../lib/format';

const kasc = makeKasc(supabase);

type Product = {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
  selling_price: number;
  stock_qty: number;
  reorder_level: number;
  is_active: boolean;
};

type ProductForm = {
  id?: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  selling_price: string;
  reorder_level: string;
  is_active: boolean;
  cost_price: string;
};

const blankForm: ProductForm = {
  sku: '',
  name: '',
  category: 'General',
  unit: 'bag',
  selling_price: '0',
  reorder_level: '0',
  is_active: true,
  cost_price: '0',
};

type MovementType = 'opening' | 'purchase' | 'purchase_return' | 'adjustment';

export function ProductsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const { push } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<ProductForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [adjDelta, setAdjDelta] = useState('');
  const [adjType, setAdjType] = useState<MovementType>('purchase');
  const [adjNote, setAdjNote] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: pErr } = await supabase
      .from('products')
      .select('id, sku, name, category, unit, selling_price, stock_qty, reorder_level, is_active')
      .order('name');
    if (pErr) {
      setError(pErr.message);
      setLoading(false);
      return;
    }
    setProducts(data as Product[]);

    if (isOwner) {
      const { data: costRows } = await supabase
        .from('product_costs')
        .select('product_id, cost_price');
      const map: Record<string, number> = {};
      (costRows ?? []).forEach((r: { product_id: string; cost_price: number }) => {
        map[r.product_id] = Number(r.cost_price);
      });
      setCosts(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!showInactive && !p.is_active) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, search, showInactive]);

  function openCreate() {
    setEditing({ ...blankForm });
    setFormError(null);
  }

  function openEdit(p: Product) {
    setEditing({
      id: p.id,
      sku: p.sku ?? '',
      name: p.name,
      category: p.category,
      unit: p.unit,
      selling_price: String(p.selling_price),
      reorder_level: String(p.reorder_level),
      is_active: p.is_active,
      cost_price: String(costs[p.id] ?? 0),
    });
    setFormError(null);
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      if (!editing.name.trim()) throw new Error('Name is required');

      const payload = {
        sku: editing.sku.trim() || null,
        name: editing.name.trim(),
        category: editing.category.trim() || 'General',
        unit: editing.unit.trim() || 'bag',
        selling_price: Number(editing.selling_price) || 0,
        reorder_level: Number(editing.reorder_level) || 0,
        is_active: editing.is_active,
      };

      let productId = editing.id;
      if (editing.id) {
        const { error } = await supabase.from('products').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        productId = (data as { id: string }).id;
      }

      if (isOwner && productId) {
        const { error: cErr } = await supabase
          .from('product_costs')
          .upsert(
            { product_id: productId, cost_price: Number(editing.cost_price) || 0 },
            { onConflict: 'product_id' },
          );
        if (cErr) throw cErr;
      }
      push(editing.id ? 'Product updated' : 'Product created', 'success');
      await load();
      setEditing(null);
    } catch (err) {
      setFormError(friendlyMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjusting) return;
    setAdjSaving(true);
    setAdjError(null);
    try {
      const delta = Number(adjDelta);
      if (!delta || Number.isNaN(delta)) throw new Error('Enter a non-zero quantity');
      await kasc.adjustStock({
        productId: adjusting.id,
        delta,
        movementType: adjType,
        note: adjNote,
      });
      push('Stock adjusted', 'success');
      await load();
      setAdjusting(null);
      setAdjDelta('');
      setAdjNote('');
      setAdjType('purchase');
    } catch (err) {
      setAdjError(friendlyMessage(err));
    } finally {
      setAdjSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Products</h1>
          <div className="flex gap-2">
            {isOwner && (
              <button
                onClick={openCreate}
                className="bg-slate-900 text-white rounded px-3 py-1.5 text-sm"
              >
                Add product
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="text-sm text-slate-600 hover:underline self-center"
            >
              ← Home
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded px-4 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex gap-3 flex-wrap items-center">
            <input
              type="search"
              placeholder="Search by name, SKU, category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border rounded px-3 py-2 text-sm flex-1 min-w-[200px]"
            />
            {isOwner && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Show inactive
              </label>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          {loading ? (
            <div className="p-6 text-slate-500 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-slate-500 text-sm">No products.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b bg-slate-50">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  {isOwner && <th className="px-4 py-2 text-right">Cost</th>}
                  <th className="px-4 py-2 text-right">Stock</th>
                  {isOwner && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const low = p.stock_qty <= p.reorder_level;
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span>{p.name}</span>
                          {!p.is_active && (
                            <span className="text-xs bg-slate-200 text-slate-600 rounded px-2 py-0.5">
                              inactive
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {p.category} · {p.unit}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        {p.sku || '—'}
                      </td>
                      <td className="px-4 py-2 text-right">{fmt(p.selling_price)}</td>
                      {isOwner && (
                        <td className="px-4 py-2 text-right text-slate-500">
                          {fmt(costs[p.id] ?? 0)}
                        </td>
                      )}
                      <td
                        className={
                          'px-4 py-2 text-right ' + (low ? 'text-amber-700 font-medium' : '')
                        }
                      >
                        {p.stock_qty}
                        {low && (
                          <div className="text-xs">reorder @ {p.reorder_level}</div>
                        )}
                      </td>
                      {isOwner && (
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              setAdjusting(p);
                              setAdjDelta('');
                              setAdjNote('');
                              setAdjType('purchase');
                              setAdjError(null);
                            }}
                            className="border rounded px-2 py-1 text-xs mr-1"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() => openEdit(p)}
                            className="border rounded px-2 py-1 text-xs"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={submitForm}
            className="bg-white rounded-xl shadow-lg w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-auto"
          >
            <h2 className="text-lg font-semibold">
              {editing.id ? 'Edit product' : 'New product'}
            </h2>

            <label className="block text-sm">
              <span className="text-slate-500">Name</span>
              <input
                type="text"
                required
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-slate-500">SKU</span>
                <input
                  type="text"
                  value={editing.sku}
                  onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                  className="w-full border rounded px-3 py-2 mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-500">Unit</span>
                <input
                  type="text"
                  value={editing.unit}
                  onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                  className="w-full border rounded px-3 py-2 mt-1"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="text-slate-500">Category</span>
              <input
                type="text"
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-slate-500">Selling price</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.selling_price}
                  onChange={(e) =>
                    setEditing({ ...editing, selling_price: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2 mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-500">Reorder level</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={editing.reorder_level}
                  onChange={(e) =>
                    setEditing({ ...editing, reorder_level: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2 mt-1"
                />
              </label>
            </div>

            {isOwner && (
              <label className="block text-sm">
                <span className="text-slate-500">Cost price (owner only)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.cost_price}
                  onChange={(e) =>
                    setEditing({ ...editing, cost_price: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2 mt-1"
                />
              </label>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.is_active}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
              Active (visible for sales)
            </label>

            {formError && (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2 text-sm">
                {formError}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-slate-900 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="border rounded px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {adjusting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={submitAdjust}
            className="bg-white rounded-xl shadow-lg w-full max-w-md p-5 space-y-3"
          >
            <h2 className="text-lg font-semibold">Adjust stock</h2>
            <p className="text-sm text-slate-500">
              {adjusting.name} · current {adjusting.stock_qty} {adjusting.unit}
            </p>

            <label className="block text-sm">
              <span className="text-slate-500">Change (use negative to reduce)</span>
              <input
                type="number"
                step="any"
                required
                value={adjDelta}
                onChange={(e) => setAdjDelta(e.target.value)}
                placeholder="e.g. 50 or -3"
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>

            <label className="block text-sm">
              <span className="text-slate-500">Reason</span>
              <select
                value={adjType}
                onChange={(e) => setAdjType(e.target.value as MovementType)}
                className="w-full border rounded px-3 py-2 mt-1"
              >
                <option value="purchase">Purchase (received stock)</option>
                <option value="purchase_return">Purchase return</option>
                <option value="opening">Opening balance</option>
                <option value="adjustment">Adjustment (count correction)</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-slate-500">Note</span>
              <input
                type="text"
                value={adjNote}
                onChange={(e) => setAdjNote(e.target.value)}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>

            {adjError && (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2 text-sm">
                {adjError}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={adjSaving}
                className="bg-slate-900 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {adjSaving ? 'Saving…' : 'Apply'}
              </button>
              <button
                type="button"
                onClick={() => setAdjusting(null)}
                className="border rounded px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
