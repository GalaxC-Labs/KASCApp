import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { makeKasc } from '../lib/kasc';
import { friendlyMessage } from '../lib/errors';
import { loadAppSettings, AppSettings, defaultSettings } from '../lib/settings';
import { formatCurrency as fmt } from '../lib/format';
import { useToast } from '../lib/toast';
import { SHOP_NAME, SHOP_ADDRESS, SHOP_PHONE } from '../lib/config';

const kasc = makeKasc(supabase);

type Sale = {
  id: string;
  bill_no: string;
  employee_id: string;
  customer_name: string;
  customer_phone: string;
  subtotal: number;
  discount: number;
  total: number;
  amount_paid: number;
  refunded_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  status: 'completed' | 'voided';
  created_at: string;
};
type SaleItem = {
  id: string;
  product_id: string;
  product_name_snapshot: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};
type Ledger = {
  id: string;
  amount: number;
  note: string;
  created_at: string;
  recorded_by: string;
};

type Action = 'pay' | 'refund' | 'void' | null;

export function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [payments, setPayments] = useState<Ledger[]>([]);
  const [refunds, setRefunds] = useState<Ledger[]>([]);

  const [action, setAction] = useState<Action>(null);
  const [amountInput, setAmountInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    const [saleRes, itemsRes, payRes, refRes, settingsData] = await Promise.all([
      supabase.from('sales').select('*').eq('id', id).maybeSingle(),
      supabase.from('sale_items').select('*').eq('sale_id', id).order('id'),
      supabase.from('payments').select('*').eq('sale_id', id).order('created_at'),
      supabase.from('refunds').select('*').eq('sale_id', id).order('created_at'),
      loadAppSettings(supabase),
    ]);
    if (saleRes.error) setError(saleRes.error.message);
    else setSale(saleRes.data as Sale | null);
    setItems((itemsRes.data ?? []) as SaleItem[]);
    setPayments((payRes.data ?? []) as Ledger[]);
    setRefunds((refRes.data ?? []) as Ledger[]);
    setSettings(settingsData as AppSettings);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (!sale) {
    return (
      <div className="p-8 max-w-md space-y-3">
        <h1 className="text-xl font-semibold">Sale not found</h1>
        <p className="text-slate-600 text-sm">
          This bill may not exist, or you don’t have permission to view it.
        </p>
        <Link to="/sales" className="text-slate-900 underline text-sm">Back to sales</Link>
      </div>
    );
  }

  const balanceDue = Math.max(0, sale.total - sale.amount_paid);
  const refundable = Math.max(0, sale.amount_paid - sale.refunded_amount);
  const canPay = sale.status === 'completed' && balanceDue > 0.005;
  const canRefund = sale.status === 'completed' && refundable > 0.005;
  const canVoid = sale.status === 'completed' && refundable <= 0.005;
  const hasHistory = payments.length > 0 || refunds.length > 0;

  function openAction(a: Exclude<Action, null>) {
    setAction(a);
    setAmountInput(a === 'pay' ? balanceDue.toFixed(2) : a === 'refund' ? refundable.toFixed(2) : '');
    setNoteInput('');
    setActionError(null);
  }

  function closeAction() {
    setAction(null);
    setAmountInput('');
    setNoteInput('');
    setActionError(null);
  }

  async function submitAction(e: React.FormEvent) {
    e.preventDefault();
    if (!action || !sale) return;
    setSubmitting(true);
    setActionError(null);
    try {
      if (action === 'pay') {
        await kasc.recordPayment(sale.id, Number(amountInput), noteInput);
      } else if (action === 'refund') {
        await kasc.recordRefund(sale.id, Number(amountInput), noteInput);
      } else if (action === 'void') {
        await kasc.voidSale(sale.id, noteInput);
      }
      const label =
        action === 'pay' ? 'Payment recorded'
        : action === 'refund' ? 'Refund recorded'
        : 'Sale voided';
      push(label, 'success');
      await load();
      closeAction();
    } catch (err) {
      setActionError(friendlyMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 print:bg-white print:p-0">
      <div className="max-w-3xl mx-auto space-y-4">

        <div className="hidden print:block text-center mb-4 pb-3 border-b border-slate-400">
          <h1 className="text-xl font-bold">{settings.shop_name || SHOP_NAME}</h1>
          {(settings.shop_address || SHOP_ADDRESS) && (
            <p className="text-xs mt-1">{settings.shop_address || SHOP_ADDRESS}</p>
          )}
          {(settings.shop_phone || SHOP_PHONE) && (
            <p className="text-xs">{settings.shop_phone || SHOP_PHONE}</p>
          )}
          <p className="text-xs mt-2 uppercase tracking-wider">Sales receipt</p>
        </div>

        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Bill {sale.bill_no}</h1>
            <p className="text-slate-500 text-sm">
              {new Date(sale.created_at).toLocaleString()} · {sale.customer_name}
              {sale.customer_phone && ` · ${sale.customer_phone}`}
            </p>
          </div>
          <div className="flex gap-2 shrink-0 print:hidden">
            <button
              onClick={() => window.print()}
              className="border rounded px-3 py-1.5 text-sm"
            >
              Print
            </button>
            <button
              onClick={() => navigate('/sales')}
              className="text-sm text-slate-600 hover:underline"
            >
              ← Sales
            </button>
          </div>
        </div>

        {sale.status === 'voided' && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded px-4 py-2 text-sm">
            This sale has been <strong>voided</strong>. Stock was restored automatically.
          </div>
        )}

        <div className="bg-white rounded-xl shadow p-4 space-y-3 print:shadow-none print:border print:border-slate-300">
          <h2 className="font-semibold">Items</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Price</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr
                  key={i.id}
                  className="border-b last:border-0 print:break-inside-avoid"
                >
                  <td className="py-2">{i.product_name_snapshot}</td>
                  <td className="py-2 text-right tabular-nums">{i.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(i.unit_price)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(i.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="text-sm space-y-1 pt-2 border-t">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="tabular-nums">{fmt(sale.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Discount</dt>
              <dd>−{fmt(sale.discount)}</dd>
            </div>
            <div className="flex justify-between font-semibold text-base border-t pt-2">
              <dt>Total</dt>
              <dd>{fmt(sale.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Paid</dt>
              <dd>{fmt(sale.amount_paid)}</dd>
            </div>
            {sale.refunded_amount > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Refunded</dt>
                <dd>−{fmt(sale.refunded_amount)}</dd>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <dt>Net paid</dt>
              <dd>{fmt(sale.amount_paid - sale.refunded_amount)}</dd>
            </div>
            {balanceDue > 0.005 && (
              <div className="flex justify-between text-amber-700">
                <dt>Balance due</dt>
                <dd>{fmt(balanceDue)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Status</dt>
              <dd className="capitalize">
                {sale.status} · <span className="text-slate-500">{sale.payment_status}</span>
              </dd>
            </div>
          </dl>
        </div>

        {sale.status === 'completed' && (canPay || canRefund || canVoid) && (
          <div className="bg-white rounded-xl shadow p-4 space-y-3 print:hidden">
            <h2 className="font-semibold">Actions</h2>

            {!action && (
              <div className="flex gap-2 flex-wrap items-center">
                {canPay && (
                  <button
                    onClick={() => openAction('pay')}
                    className="bg-slate-900 text-white rounded px-3 py-1.5 text-sm"
                  >
                    Record payment
                  </button>
                )}
                {canRefund && (
                  <button
                    onClick={() => openAction('refund')}
                    className="border rounded px-3 py-1.5 text-sm"
                  >
                    Record refund
                  </button>
                )}
                {canVoid && (
                  <button
                    onClick={() => openAction('void')}
                    className="border border-red-300 text-red-700 rounded px-3 py-1.5 text-sm"
                  >
                    Void sale
                  </button>
                )}
                {!canVoid && refundable > 0.005 && (
                  <span className="text-xs text-slate-500 self-center">
                    Refund {fmt(refundable)} before voiding.
                  </span>
                )}
              </div>
            )}

            {action && (
              <form onSubmit={submitAction} className="space-y-2">
                <p className="text-sm font-medium">
                  {action === 'pay'
                    ? 'Record payment'
                    : action === 'refund'
                    ? 'Record refund'
                    : 'Void sale'}
                </p>
                {action !== 'void' && (
                  <label className="block text-sm">
                    <span className="text-slate-500">Amount</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="w-full border rounded px-3 py-2 mt-1"
                    />
                  </label>
                )}
                <label className="block text-sm">
                  <span className="text-slate-500">
                    {action === 'void' ? 'Reason' : 'Note (optional)'}
                  </span>
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    required={action === 'void'}
                    className="w-full border rounded px-3 py-2 mt-1"
                  />
                </label>
                {actionError && (
                  <div className="bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2 text-sm">
                    {actionError}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-slate-900 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {submitting ? 'Saving…' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={closeAction}
                    className="border rounded px-3 py-1.5 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {hasHistory && (
          <div className="bg-white rounded-xl shadow p-4 space-y-2 print:shadow-none print:border print:border-slate-300">
            <h2 className="font-semibold">History</h2>
            <ul className="text-sm divide-y">
              {payments.map((p) => (
                <li key={`p-${p.id}`} className="py-1.5 flex justify-between gap-3">
                  <span>
                    <span className="text-emerald-600 font-medium">+{fmt(p.amount)}</span>{' '}
                    <span className="text-slate-600">{p.note || 'Payment'}</span>
                  </span>
                  <span className="text-slate-500 text-xs">
                    {new Date(p.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
              {refunds.map((r) => (
                <li key={`r-${r.id}`} className="py-1.5 flex justify-between gap-3">
                  <span>
                    <span className="text-red-600 font-medium">−{fmt(r.amount)}</span>{' '}
                    <span className="text-slate-600">{r.note || 'Refund'}</span>
                  </span>
                  <span className="text-slate-500 text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="hidden print:block text-center text-xs text-slate-500 pt-4">
          {settings.bill_footer || 'Thank you for your business.'}
        </p>
      </div>
    </div>
  );
}
