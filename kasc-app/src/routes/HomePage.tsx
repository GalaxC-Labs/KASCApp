import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/format';

type LowStockItem = {
  id: string;
  name: string;
  sku: string | null;
  stock_qty: number;
  reorder_level: number;
  unit: string;
};

type TodayStats = {
  count: number;
  collected: number;
  outstanding: number;
};

export function HomePage() {
  const { profile } = useAuth();

  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [lowStockLoading, setLowStockLoading] = useState(true);
  const [stats, setStats] = useState<TodayStats>({ count: 0, collected: 0, outstanding: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [productsRes, salesRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, sku, stock_qty, reorder_level, unit')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('sales')
          .select('total, amount_paid, status')
          .gte('created_at', today.toISOString())
          .eq('status', 'completed'),
      ]);

      if (!active) return;

      const low = ((productsRes.data ?? []) as LowStockItem[]).filter(
        (p) => Number(p.stock_qty) <= Number(p.reorder_level),
      );
      setLowStock(low);
      setLowStockLoading(false);

      const rows = (salesRes.data ?? []) as Array<{
        total: number;
        amount_paid: number;
      }>;
      const count = rows.length;
      const collected = rows.reduce((a, r) => a + Number(r.amount_paid), 0);
      const outstanding = rows.reduce(
        (a, r) => a + Math.max(0, Number(r.total) - Number(r.amount_paid)),
        0,
      );
      setStats({ count, collected, outstanding });
      setStatsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {greeting}
            {profile?.display_name ? `, ${profile.display_name}` : ''}
          </h1>
          <p className="text-slate-500 text-sm capitalize">{profile?.role}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-4 grid grid-cols-3 gap-4">
          {statsLoading ? (
            <>
              <div className="text-xs text-slate-400">Loading today…</div>
            </>
          ) : (
            <>
              <div>
                <div className="text-xs text-slate-500">Sales today</div>
                <div className="text-xl font-semibold mt-1">{stats.count}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Collected</div>
                <div className="text-xl font-semibold mt-1 text-emerald-700">
                  {formatCurrency(stats.collected)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Outstanding</div>
                <div className="text-xl font-semibold mt-1 text-amber-700">
                  {formatCurrency(stats.outstanding)}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Link
            to="/sales/new"
            className="block bg-slate-900 text-white rounded-xl shadow p-5 hover:bg-slate-800"
          >
            <div className="text-lg font-semibold">New sale</div>
            <div className="text-xs text-slate-300 mt-1">
              Start a bill — add items, take payment
            </div>
          </Link>
          <Link
            to="/sales"
            className="block bg-white rounded-xl shadow p-5 hover:bg-slate-50"
          >
            <div className="text-lg font-semibold">Sales history</div>
            <div className="text-xs text-slate-500 mt-1">
              Search, filter, follow up on payments
            </div>
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-baseline justify-between mb-3">
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
              All products are above their reorder level.
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
              className="block text-sm text-slate-700 underline pt-2"
            >
              See all {lowStock.length} →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}