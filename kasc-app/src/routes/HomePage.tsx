import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { supabase } from '../lib/supabase';

type LowStockItem = {
  id: string;
  name: string;
  sku: string | null;
  stock_qty: number;
  reorder_level: number;
  unit: string;
};

export function HomePage() {
  const { profile, signOut } = useAuth();
  const isOwner = profile?.role === 'owner';

  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [lowStockLoading, setLowStockLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, stock_qty, reorder_level, unit')
        .eq('is_active', true)
        .order('name');
      if (!active) return;
      const low = ((data ?? []) as LowStockItem[]).filter(
        (p) => Number(p.stock_qty) <= Number(p.reorder_level),
      );
      setLowStock(low);
      setLowStockLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <h1 className="text-2xl font-semibold">
            Welcome, {profile?.display_name || 'user'}
          </h1>
          <p className="text-slate-600 text-sm">
            Role: <span className="font-mono">{profile?.role}</span>
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Link
              to="/sales/new"
              className="bg-slate-900 text-white rounded px-4 py-2 text-center"
            >
              New sale
            </Link>
            <Link
              to="/sales"
              className="border rounded px-4 py-2 text-center"
            >
              Sales history
            </Link>
            <Link
              to="/products"
              className="border rounded px-4 py-2 text-center"
            >
              Products
            </Link>
          </div>
          <button onClick={signOut} className="border rounded px-3 py-1.5 text-sm">
            Sign out
          </button>
        </div>

        <div className="bg-white rounded-xl shadow p-6 space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Low stock</h2>
            {lowStock.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                {lowStock.length} item{lowStock.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {lowStockLoading ? (
            <p className="text-slate-500 text-sm">Checking…</p>
          ) : lowStock.length === 0 ? (
            <p className="text-slate-500 text-sm">
              All products are above their reorder level. 🎉
            </p>
          ) : (
            <ul className="divide-y">
              {lowStock.slice(0, 8).map((p) => (
                <li key={p.id} className="py-2 flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.sku ? `${p.sku} · ` : ''}
                      reorder at {p.reorder_level} {p.unit}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-amber-700 font-medium">
                      {p.stock_qty} {p.unit}
                    </div>
                    <div className="text-xs text-slate-500">left</div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {lowStock.length > 8 && (
            <Link
              to="/products"
              className="block text-sm text-slate-700 underline pt-1"
            >
              See all {lowStock.length} low-stock items →
            </Link>
          )}

          {isOwner && lowStock.length > 0 && (
            <p className="text-xs text-slate-500 pt-1">
              Use <strong>Products → Adjust</strong> to record incoming stock.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
