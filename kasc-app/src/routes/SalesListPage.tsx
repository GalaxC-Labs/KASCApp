import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { formatCurrency as fmt } from '../lib/format';

type Sale = {
  id: string;
  bill_no: string;
  customer_name: string;
  total: number;
  amount_paid: number;
  refunded_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  status: 'completed' | 'voided';
  created_at: string;
};

type StatusFilter = 'all' | 'unpaid' | 'partial' | 'paid' | 'voided';

export function SalesListPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('sales')
        .select(
          'id, bill_no, customer_name, total, amount_paid, refunded_amount, payment_status, status, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(200);
      if (!active) return;
      if (error) setError(error.message);
      else setSales(data as Sale[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      if (
        q &&
        !s.bill_no.toLowerCase().includes(q) &&
        !s.customer_name.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (dateFrom && new Date(s.created_at) < new Date(dateFrom)) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setDate(end.getDate() + 1);
        if (new Date(s.created_at) >= end) return false;
      }
      if (statusFilter === 'voided') return s.status === 'voided';
      if (statusFilter !== 'all') {
        return s.status === 'completed' && s.payment_status === statusFilter;
      }
      return true;
    });
  }, [sales, search, dateFrom, dateTo, statusFilter]);

  const summary = useMemo(() => {
    const completed = filtered.filter((s) => s.status === 'completed');
    const gross = completed.reduce((a, s) => a + Number(s.total), 0);
    const collected = completed.reduce((a, s) => a + Number(s.amount_paid), 0);
    const refunded = completed.reduce((a, s) => a + Number(s.refunded_amount), 0);
    const outstanding = completed.reduce(
      (a, s) => a + Math.max(0, Number(s.total) - Number(s.amount_paid)),
      0,
    );
    return { count: completed.length, gross, collected, refunded, outstanding };
  }, [filtered]);

  const showOwnerColumn = profile?.role === 'owner';

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Sales</h1>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/sales/new')}
              className="bg-slate-900 text-white rounded px-3 py-1.5 text-sm"
            >
              New sale
            </button>
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

        <div className="bg-white rounded-xl shadow p-4 space-y-3">
          <div className="grid sm:grid-cols-4 gap-2">
            <input
              type="search"
              placeholder="Bill no. or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border rounded px-3 py-2 text-sm sm:col-span-2"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="voided">Voided</option>
            </select>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border rounded px-2 py-2 text-sm w-full"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border rounded px-2 py-2 text-sm w-full"
              />
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm border-t pt-3">
            <div>
              <dt className="text-slate-500 text-xs">Sales</dt>
              <dd className="font-semibold">{summary.count}</dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs">Gross</dt>
              <dd className="font-semibold">{fmt(summary.gross)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs">Collected</dt>
              <dd className="font-semibold">{fmt(summary.collected)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs">Outstanding</dt>
              <dd className="font-semibold text-amber-700">{fmt(summary.outstanding)}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          {loading ? (
            <div className="p-6 text-slate-500 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-slate-500 text-sm">No sales match these filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b bg-slate-50">
                <tr>
                  <th className="px-4 py-2">Bill</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const outstanding = Math.max(0, Number(s.total) - Number(s.amount_paid));
                  return (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/sales/${s.id}`)}
                      className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-4 py-2 font-mono text-xs">{s.bill_no}</td>
                      <td className="px-4 py-2">{s.customer_name}</td>
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                        {new Date(s.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-right">{fmt(s.total)}</td>
                      <td className="px-4 py-2 text-right">
                        {fmt(s.amount_paid)}
                        {outstanding > 0.005 && s.status === 'completed' && (
                          <span className="block text-xs text-amber-700">
                            {fmt(outstanding)} due
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {s.status === 'voided' ? (
                          <span className="text-xs bg-red-100 text-red-700 rounded px-2 py-0.5">
                            voided
                          </span>
                        ) : (
                          <span
                            className={
                              'text-xs rounded px-2 py-0.5 ' +
                              (s.payment_status === 'paid'
                                ? 'bg-emerald-100 text-emerald-700'
                                : s.payment_status === 'partial'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700')
                            }
                          >
                            {s.payment_status}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Showing up to 200 most recent sales{showOwnerColumn ? ' across all employees' : ' you recorded'}.
        </p>
      </div>
    </div>
  );
}
