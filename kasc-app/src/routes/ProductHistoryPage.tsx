import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDateTime } from '../lib/format';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  category: string;
  selling_price: number;
  stock_qty: number;
  reorder_level: number;
  is_active: boolean;
};

type Movement = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity_delta: number;
  reference_type: string | null;
  reference_id: string | null;
  note: string;
  created_at: string;
};

type Row = Movement & { running_stock: number };

const TYPE_LABEL: Record<string, string> = {
  opening: 'Opening',
  purchase: 'Purchase',
  sale: 'Sale',
  sale_return: 'Sale return',
  purchase_return: 'Purchase return',
  adjustment: 'Adjustment',
};

export function ProductHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      const [pRes, mRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, sku, unit, category, selling_price, stock_qty, reorder_level, is_active')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('stock_movements')
          .select('id, product_id, movement_type, quantity_delta, reference_type, reference_id, note, created_at')
          .eq('product_id', id)
          .order('created_at', { ascending: true }),
      ]);
      if (!active) return;
      if (pRes.error) setError(pRes.error.message);
      else setProduct(pRes.data as Product | null);
      setMovements((mRes.data ?? []) as Movement[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const rows: Row[] = useMemo(() => {
    let running = 0;
    return movements.map((m) => {
      running += Number(m.quantity_delta);
      return { ...m, running_stock: running };
    });
  }, [movements]);

  // Reverse for newest-first display
  const display = useMemo(() => [...rows].reverse(), [rows]);

  const totals = useMemo(() => {
    let inQty = 0;
    let outQty = 0;
    for (const m of movements) {
      const d = Number(m.quantity_delta);
      if (d > 0) inQty += d;
      else outQty += Math.abs(d);
    }
    return { inQty, outQty };
  }, [movements]);

  if (loading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>;
  if (error) return <div className="p-6 text-red-600 text-sm">Error: {error}</div>;
  if (!product) {
    return (
      <div className="p-6 max-w-md space-y-3">
        <h1 className="text-xl font-semibold">Product not found</h1>
        <p className="text-slate-600 text-sm">
          This product may have been removed, or you don’t have permission to view it.
        </p>
        <Link to="/products" className="text-slate-900 underline text-sm">
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold truncate">{product.name}</h1>
            <p className="text-slate-500 text-sm">
              {product.sku ? `${product.sku} · ` : ''}
              {product.category} · {product.unit}
            </p>
          </div>
          <Link
            to="/products"
            className="text-sm text-slate-600 hover:underline shrink-0"
          >
            ← Products
          </Link>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-xl shadow p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-500">Current stock</div>
            <div className="text-xl font-semibold mt-1">
              {Number(product.stock_qty)} {product.unit}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Selling price</div>
            <div className="text-xl font-semibold mt-1">
              {formatCurrency(product.selling_price)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total received</div>
            <div className="text-xl font-semibold mt-1 text-emerald-700">
              +{totals.inQty}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total issued</div>
            <div className="text-xl font-semibold mt-1 text-red-700">
              −{totals.outQty}
            </div>
          </div>
        </div>

        {/* History table */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {display.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="text-3xl">📊</div>
              <p className="text-sm text-slate-500">
                No stock movements yet for this product.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500 border-b bg-slate-50">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Invoice / Note</th>
                      <th className="px-4 py-2 text-right">In</th>
                      <th className="px-4 py-2 text-right">Out</th>
                      <th className="px-4 py-2 text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {display.map((r) => {
                      const delta = Number(r.quantity_delta);
                      const inQ = delta > 0 ? delta : null;
                      const outQ = delta < 0 ? Math.abs(delta) : null;
                      return (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                            {formatDateTime(r.created_at)}
                          </td>
                          <td className="px-4 py-2">
                            <span className="text-xs bg-slate-100 rounded px-2 py-0.5">
                              {TYPE_LABEL[r.movement_type] ?? r.movement_type}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-600">
                            {r.note || '—'}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-emerald-700">
                            {inQ !== null ? `+${inQ}` : ''}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-red-700">
                            {outQ !== null ? `−${outQ}` : ''}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">
                            {r.running_stock}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className="md:hidden divide-y">
                {display.map((r) => {
                  const delta = Number(r.quantity_delta);
                  const inQ = delta > 0 ? delta : null;
                  const outQ = delta < 0 ? Math.abs(delta) : null;
                  return (
                    <li key={r.id} className="p-3 space-y-1">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500">
                            {formatDateTime(r.created_at)}
                          </div>
                          <div className="text-xs mt-0.5">
                            <span className="bg-slate-100 rounded px-2 py-0.5">
                              {TYPE_LABEL[r.movement_type] ?? r.movement_type}
                            </span>
                          </div>
                          {r.note && (
                            <div className="text-sm text-slate-600 mt-1">{r.note}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {inQ !== null && (
                            <div className="text-emerald-700 font-medium tabular-nums">
                              +{inQ}
                            </div>
                          )}
                          {outQ !== null && (
                            <div className="text-red-700 font-medium tabular-nums">
                              −{outQ}
                            </div>
                          )}
                          <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                            stock {r.running_stock}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Running total is reconstructed from all recorded movements. If the first
          movement isn’t an opening balance, the earliest rows may show a stock that
          doesn’t match the physical count at that time.
        </p>
      </div>
    </div>
  );
}