import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { makeKasc } from '../lib/kasc';
import { formatDateTime } from '../lib/format';

const kasc = makeKasc(supabase);

type Product = {
  id: string;
  name: string;
  unit: string;
};

type LedgerRow = {
  movement_id: string;
  movement_date: string;
  invoice_no: string;
  movement_type: string;
  product_id: string;
  product_name: string;
  product_unit: string;
  quantity_delta: number;
  received: number;
  sales: number;
  open_stock: number;
  remaining_stock: number;
};

const TYPE_LABEL: Record<string, string> = {
  opening: 'Opening',
  purchase: 'Purchase',
  sale: 'Sale',
  sale_return: 'Sale return',
  purchase_return: 'Purchase return',
  adjustment: 'Adjustment',
};

function toLocalIsoDate(dateStr: string, endOfDay: boolean): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return d.toISOString();
}

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function monthStartStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-01`;
}

function escapeCsv(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function StockLedgerPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [dateFrom, setDateFrom] = useState(monthStartStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [productId, setProductId] = useState('');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, unit')
        .eq('is_active', true)
        .order('name');
      setProducts((data ?? []) as Product[]);
    })();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await kasc.getStockLedger({
        productId: productId || undefined,
        dateFrom: toLocalIsoDate(dateFrom, false),
        dateTo: toLocalIsoDate(dateTo, true),
      });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    load();
  }

  const totals = useMemo(() => {
    const received = rows.reduce((a, r) => a + Number(r.received), 0);
    const sales = rows.reduce((a, r) => a + Number(r.sales), 0);
    return { received, sales, count: rows.length };
  }, [rows]);

  function downloadCsv() {
    const headers = [
      'Date',
      'Invoice No',
      'Type',
      'Product',
      'Unit',
      'Open Stock',
      'Received Stock',
      'Sales',
      'Remaining Stock',
    ];
    const body = rows.map((r) => [
      formatDateTime(r.movement_date),
      r.invoice_no || '',
      TYPE_LABEL[r.movement_type] ?? r.movement_type,
      r.product_name,
      r.product_unit,
      Number(r.open_stock),
      Number(r.received) || '',
      Number(r.sales) || '',
      Number(r.remaining_stock),
    ]);
    const csv = [headers, ...body]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-ledger_${dateFrom}_to_${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 sm:p-6 print:p-0">
      <div className="max-w-6xl mx-auto space-y-4 print:max-w-full">
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-2xl font-semibold">Stock ledger</h1>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-white rounded-xl shadow p-4 space-y-3 print:hidden"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="block text-sm">
              <span className="text-xs text-slate-500 block mb-0.5">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border rounded px-2 py-2 text-sm w-full"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-slate-500 block mb-0.5">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border rounded px-2 py-2 text-sm w-full"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-xs text-slate-500 block mb-0.5">Product</span>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="border rounded px-2 py-2 text-sm w-full"
              >
                <option value="">All products</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              type="submit"
              disabled={loading}
              className="bg-slate-900 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Apply filters'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="border rounded px-3 py-1.5 text-sm"
            >
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={rows.length === 0}
              className="border rounded px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Download CSV
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded px-4 py-2 text-sm print:hidden">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow p-4 grid grid-cols-3 gap-4 print:shadow-none print:border print:border-slate-400">
          <div>
            <div className="text-xs text-slate-500">Entries</div>
            <div className="text-xl font-semibold mt-1">{totals.count}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total received</div>
            <div className="text-xl font-semibold mt-1 text-emerald-700">
              {totals.received}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total sold</div>
            <div className="text-xl font-semibold mt-1 text-red-700">
              {totals.sales}
            </div>
          </div>
        </div>

        <div className="hidden print:block text-center mb-2">
          <h2 className="text-lg font-bold">Stock ledger</h2>
          <p className="text-xs text-slate-600">
            {dateFrom} to {dateTo}
            {productId ? ` · ${products.find((p) => p.id === productId)?.name ?? ''}` : ''}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden print:shadow-none print:border print:border-slate-400">
          {loading ? (
            <div className="p-6 text-slate-500 text-sm">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <div className="text-4xl">📋</div>
              <h3 className="font-medium">No movements in this range</h3>
              <p className="text-sm text-slate-500">
                Try a wider date range, or clear the product filter.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full text-sm print:table-auto">
                  <thead className="text-left text-slate-500 border-b bg-slate-50 print:bg-white">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Invoice No</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Open</th>
                      <th className="px-3 py-2 text-right">Received</th>
                      <th className="px-3 py-2 text-right">Sales</th>
                      <th className="px-3 py-2 text-right">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.movement_id}
                        className="border-b last:border-0 print:break-inside-avoid"
                      >
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap tabular-nums">
                          {formatDateTime(r.movement_date)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">
                          {r.invoice_no || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div>{r.product_name}</div>
                          <div className="text-xs text-slate-500">
                            {TYPE_LABEL[r.movement_type] ?? r.movement_type}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(r.open_stock)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                          {Number(r.received) > 0 ? `+${Number(r.received)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-700">
                          {Number(r.sales) > 0 ? `−${Number(r.sales)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {Number(r.remaining_stock)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="md:hidden divide-y print:hidden">
                {rows.map((r) => (
                  <li key={r.movement_id} className="p-3 space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500">
                          {formatDateTime(r.movement_date)}
                        </div>
                        <div className="font-medium truncate">{r.product_name}</div>
                        <div className="text-xs text-slate-500">
                          {TYPE_LABEL[r.movement_type] ?? r.movement_type}
                          {r.invoice_no && ` · ${r.invoice_no}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0 tabular-nums">
                        {Number(r.received) > 0 && (
                          <div className="text-emerald-700">
                            +{Number(r.received)} {r.product_unit}
                          </div>
                        )}
                        {Number(r.sales) > 0 && (
                          <div className="text-red-700">
                            −{Number(r.sales)} {r.product_unit}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 mt-0.5">
                          {Number(r.open_stock)} → {Number(r.remaining_stock)}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <p className="text-xs text-slate-400 print:text-slate-600">
          Open stock is calculated from all recorded movements up to the
          report start date. Products without an opening-balance entry may show a
          starting value of 0.
        </p>
      </div>
    </div>
  );
}