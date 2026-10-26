import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { makeKasc, CreateSaleResult } from '../lib/kasc';
import { friendlyMessage } from '../lib/errors';
import { useToast } from '../lib/toast';
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
};

type CartItem = { product: Product; quantity: number };

export function NewSalePage() {
  const navigate = useNavigate();
  const { push } = useToast();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [paidInput, setPaidInput] = useState('');
  const [paidTouched, setPaidTouched] = useState(false);

  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    result: CreateSaleResult;
    items: CartItem[];
  } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, sku, name, category, unit, selling_price, stock_qty, reorder_level')
        .eq('is_active', true)
        .order('name');
      if (!active) return;
      if (error) setLoadError(error.message);
      else setProducts(data as Product[]);
      setLoadingProducts(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }, [products, search]);

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.product.selling_price * i.quantity, 0),
    [items],
  );

  const discount = Math.min(Math.max(Number(discountInput) || 0, 0), subtotal);
  const total = Math.max(0, subtotal - discount);

  const effectivePaid = paidTouched
    ? Math.min(Math.max(Number(paidInput) || 0, 0), total)
    : total;

  function addProduct(p: Product) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.product.id === p.id);
      if (idx === -1) return [...prev, { product: p, quantity: 1 }];
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
      return next;
    });
  }

  function setQty(productId: string, quantity: number) {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.product.id !== productId)
        : prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i)),
    );
  }

  function resetForNewSale() {
    setItems([]);
    setCustomerName('');
    setDiscountInput('');
    setPaidInput('');
    setPaidTouched(false);
    setClientRef(crypto.randomUUID());
    setError(null);
    setSuccess(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      setError('Add at least one item to the bill.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await kasc.createSale({
        items: items.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
        })),
        customerName: customerName.trim() || 'Walk-in customer',
        discount,
        amountPaid: effectivePaid,
        clientRef,
      });
      setSuccess({ result, items });
      push(`Sale recorded · ${result.bill_no}`, 'success');
      setItems([]);
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    const { result, items: soldItems } = success;
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">Sale complete</h1>
            <p className="text-slate-500 text-sm">
              Bill <span className="font-mono">{result.bill_no}</span>
              {result.idempotent && ' (already recorded)'}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {soldItems.map((i) => (
                <tr key={i.product.id} className="border-b last:border-0">
                  <td className="py-2">{i.product.name}</td>
                  <td className="py-2 text-right">{i.quantity}</td>
                  <td className="py-2 text-right">
                    {fmt(i.product.selling_price * i.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd>{fmt(result.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Discount</dt>
              <dd>−{fmt(result.discount)}</dd>
            </div>
            <div className="flex justify-between font-semibold text-base border-t pt-2">
              <dt>Total</dt>
              <dd>{fmt(result.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Paid</dt>
              <dd>
                {fmt(result.amount_paid)}{' '}
                <span className="text-xs uppercase text-slate-500">
                  ({result.payment_status})
                </span>
              </dd>
            </div>
          </dl>
          <div className="flex gap-2 pt-2 flex-wrap">
            <button
              onClick={() => navigate(`/sales/${result.sale_id}`)}
              className="bg-slate-900 text-white rounded px-4 py-2 text-sm"
            >
              View details
            </button>
            <button
              onClick={resetForNewSale}
              className="border rounded px-4 py-2 text-sm"
            >
              New sale
            </button>
            <button
              onClick={() => navigate('/')}
              className="border rounded px-4 py-2 text-sm"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">New sale</h1>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-slate-600 hover:underline"
          >
            ← Home
          </button>
        </div>

        {loadError && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded px-4 py-2 text-sm">
            Couldn’t load products: {loadError}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow p-4 space-y-3">
            <input
              type="search"
              placeholder="Search products by name, SKU, category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
            {loadingProducts ? (
              <p className="text-slate-500 text-sm">Loading products…</p>
            ) : filtered.length === 0 ? (
              <p className="text-slate-500 text-sm">No matching products.</p>
            ) : (
              <ul className="divide-y max-h-[60vh] overflow-auto">
                {filtered.map((p) => {
                  const inCart = items.find((i) => i.product.id === p.id);
                  const lowStock = p.stock_qty <= p.reorder_level;
                  return (
                    <li key={p.id} className="py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-xs text-slate-500">
                          {p.sku ? `${p.sku} · ` : ''}
                          {fmt(p.selling_price)} / {p.unit} ·{' '}
                          <span className={lowStock ? 'text-amber-600' : ''}>
                            {p.stock_qty} in stock
                          </span>
                          {inCart ? ` · ${inCart.quantity} in cart` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => addProduct(p)}
                        disabled={p.stock_qty <= 0}
                        className="shrink-0 border rounded px-3 py-1 text-sm disabled:opacity-40"
                      >
                        Add
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <form
            onSubmit={onSubmit}
            className="bg-white rounded-xl shadow p-4 space-y-3"
          >
            <h2 className="font-semibold">Cart</h2>
            {items.length === 0 ? (
              <p className="text-slate-500 text-sm">No items yet. Add from the list.</p>
            ) : (
              <ul className="divide-y">
                {items.map((i) => {
                  const overStock = i.quantity > i.product.stock_qty;
                  return (
                    <li key={i.product.id} className="py-2 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{i.product.name}</span>
                        <span>
                          {fmt(i.product.selling_price * i.quantity)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          onClick={() => setQty(i.product.id, i.quantity - 1)}
                          className="w-7 h-7 border rounded"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={i.quantity}
                          onChange={(e) =>
                            setQty(i.product.id, Number(e.target.value) || 0)
                          }
                          className="w-20 border rounded px-2 py-1 text-right"
                        />
                        <button
                          type="button"
                          onClick={() => setQty(i.product.id, i.quantity + 1)}
                          className="w-7 h-7 border rounded"
                        >
                          +
                        </button>
                        <span className="ml-2 text-slate-500 text-xs">
                          @ {fmt(i.product.selling_price)}/{i.product.unit}
                        </span>
                      </div>
                      {overStock && (
                        <p className="text-amber-600 text-xs">
                          Only {i.product.stock_qty} in stock
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="space-y-2 text-sm">
              <label className="block">
                <span className="text-slate-500">Customer</span>
                <input
                  type="text"
                  placeholder="Walk-in customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full border rounded px-3 py-2 mt-1"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-slate-500">Discount</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className="w-full border rounded px-3 py-2 mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-slate-500">Amount paid</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    placeholder={total.toFixed(2)}
                    value={paidInput}
                    onChange={(e) => {
                      setPaidInput(e.target.value);
                      setPaidTouched(true);
                    }}
                    className="w-full border rounded px-3 py-2 mt-1"
                  />
                </label>
              </div>
            </div>

            <dl className="text-sm space-y-1 border-t pt-2">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd>{fmt(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Discount</dt>
                <dd>−{fmt(discount)}</dd>
              </div>
              <div className="flex justify-between font-semibold text-base border-t pt-2">
                <dt>Total</dt>
                <dd>{fmt(total)}</dd>
              </div>
              <div className="flex justify-between text-slate-500">
                <dt>Collecting</dt>
                <dd>{fmt(effectivePaid)}</dd>
              </div>
            </dl>

            {error && (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || items.length === 0}
              className="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : `Complete sale · ${fmt(total)}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
