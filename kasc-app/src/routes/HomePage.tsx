import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatRelative } from '../lib/format';

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

type RecentSale = {
  id: string;
  bill_no: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  amount_paid: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  created_at: string;
};

type UnpaidSummary = {
  count: number;
  total_due: number;
};

const UNPAID_DAYS = 7;

export function HomePage() {
  const { profile } = useAuth();

  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [lowStockLoading, setLowStockLoading] = useState(true);
  const [stats, setStats] = useState<TodayStats>({ count: 0, collected: 0, outstanding: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [recent, setRecent] = useState<RecentSale[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [unpaid, setUnpaid] = useState<UnpaidSummary>({ count: 0, total_due: 0 });
  const [unpaidLoading, setUnpaidLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cutoff = new Date(Date.now() - UNPAID_DAYS * 24 * 60 * 60 * 1000);

      const [productsRes, todaySalesRes, recentRes, unpaidRes] = await Promise.all([
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
        supabase
          .from('sales')
          .select('id, bill_no, customer_name, customer_phone, total, amount_paid, payment_status, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('sales')
          .select('total, amount_paid')
          .eq('status', 'completed')
          .in('payment_status', ['unpaid', 'partial'])
          .lt('created_at', cutoff.toISOString()),
      ]);

      if (!active) return;

      const low = ((productsRes.data ?? []) as LowStockItem[]).filter(
        (p) => Number(p.stock_qty) <= Number(p.reorder_level),
      );
      setLowStock(low);
      setLowStockLoading(false);

      const rows = (todaySalesRes.data ?? []) as Array<{ total: number; amount_paid: number }>;
      const count = rows.length;
      const collected = rows.reduce((a, r) => a + Number(r.amount_paid), 0);
      const outstanding = rows.reduce(
        (a, r) => a + Math.max(0, Number(r.total) - Number(r.amount_paid)),
        0,
      );
      setStats({ count, collected, outstanding });
      setStatsLoading(false);

      setRecent((recentRes.data ?? []) as RecentSale[]);
      setRecentLoading(false);

      const unpaidRows = (unpaidRes.data ?? []) as Array<{ total: number; amount_paid: number }>;
      setUnpaid({
        count: unpaidRows.length,
        total_due: unpaidRows.reduce(
          (a, r) => a + Math.max(0, Number(r.total) - Number(r.amount_paid)),
          0,
        ),
      });
      setUnpaidLoading(false);
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
      <div className="max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {greeting}
            {profile?.display_name ? `, ${profile.display_name}` : ''}
          </h1>
          <p className="text-slate-500 text-sm capitalize">{profile?.role}</p>
        </div>

        {/* Today's stats */}
        <div className="bg-white rounded-xl shadow p-4 grid grid-cols-3 gap-4">
          {statsLoading ? (
            <div className="text-xs text-slate-400">Loading today…</div>
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

        {/* Actions */}
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

        {/* Alerts row */}
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Stock alerts */}
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-semibold">Stock alerts</h2>
              {lowStock.length > 0 && (
                <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                  {lowStock.length}
                </span>
              )}
            </div>
            {lowStockLoading ? (
              <p className="text-slate-500 text-sm">Checking…</p>
            ) : lowStock.length === 0 ? (
              <div className="py-4 text-center space-y-1">
                <div className="text-2xl">✅</div>
                <p className="text-sm text-slate-500">
                  Nothing to reorder. All products are above their thresholds.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {lowStock.slice(0, 5).map((p) => (
                  <li key={p.id} className="py-2 flex justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-slate-500">
                        reorder at {p.reorder_level} {p.unit}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-amber-700 font-medium">
                        {p.stock_qty} {p.unit}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {lowStock.length > 5 && (
              <Link to="/products" className="block text-sm text-slate-700 underline pt-2">
                See all {lowStock.length} →
              </Link>
            )}
          </div>

          {/* Overdue unpaid bills */}
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-semibold">Unpaid bills</h2>
              {unpaid.count > 0 && (
                <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5">
                  {unpaid.count}
                </span>
              )}
            </div>
            {unpaidLoading ? (
              <p className="text-slate-500 text-sm">Checking…</p>
            ) : unpaid.count === 0 ? (
              <div className="py-4 text-center space-y-1">
                <div className="text-2xl">👍</div>
                <p className="text-sm text-slate-500">
                  No bills older than {UNPAID_DAYS} days with a balance.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  <strong>{unpaid.count}</strong> bill{unpaid.count === 1 ? '' : 's'} with
                  a balance over {UNPAID_DAYS} days old.
                </p>
                <p className="text-xl font-semibold text-red-700 mt-2">
                  {formatCurrency(unpaid.total_due)}
                </p>
                <Link
                  to="/sales"
                  className="block text-sm text-slate-700 underline pt-2"
                >
                  Follow up →
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Recent sales */}
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">Recent sales</h2>
            <Link to="/sales" className="text-xs text-slate-500 hover:underline">
              See all →
            </Link>
          </div>
          {recentLoading ? (
            <p className="text-slate-500 text-sm">Loading…</p>
          ) : recent.length === 0 ? (
            <div className="py-6 text-center space-y-1">
              <div className="text-3xl">🧾</div>
              <p className="text-sm text-slate-500">
                No sales yet. Your first sale will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {recent.map((s) => {
                const due = Math.max(0, Number(s.total) - Number(s.amount_paid));
                return (
                  <li key={s.id}>
                    <Link
                      to={`/sales/${s.id}`}
                      className="py-2 flex justify-between gap-3 text-sm hover:bg-slate-50 -mx-2 px-2 rounded"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-slate-500">{s.bill_no}</div>
                        <div className="font-medium truncate">
                          {s.customer_name}
                          {s.customer_phone && (
                            <span className="text-slate-500 font-normal">
                              {' '}· {s.customer_phone}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatRelative(s.created_at)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-medium">{formatCurrency(s.total)}</div>
                        {due > 0.005 && (
                          <div className="text-xs text-amber-700">
                            {formatCurrency(due)} due
                          </div>
                        )}
                        {s.payment_status === 'paid' && (
                          <div className="text-xs text-emerald-600">paid</div>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}