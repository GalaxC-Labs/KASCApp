import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { makeKasc, CreateSaleResult } from '../lib/kasc';
import { friendlyMessage } from '../lib/errors';
import { useToast } from '../lib/toast';
import { formatCurrency as fmt } from '../lib/format';
import { Skeleton } from '../components/Skeleton';

const CART_KEY = 'kasc.cart.v1';

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

type StoredCart = {
  items: { product_id: string; quantity: number }[];
  customerName: string;
  customerPhone: string;
  discountInput: string;
  paidInput: string;
  paidTouched: boolean;
  clientRef: string;
};

function loadStoredCart(): StoredCart | null {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCart;
  } catch {
    return null;
  }
}

function saveStoredCart(cart: StoredCart | null) {
  try {
    if (!cart) localStorage.removeItem(CART_KEY);
    else localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    /* quota errors ignored */
  }
}

export function NewSalePage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [paidInput, setPaidInput] = useState('');
  const [paidTouched, setPaidTouched] = useState(false);

  const [clientRef, setClientRef] = useState<string>(() => crypto.randomUUID());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    result: CreateSaleResult;
    items: CartItem[];
  } | null>(null);

  // Load products + restore any saved cart
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, sku, name, category, unit, selling_price, stock_qty, reorder_level')
        .eq('is_active', true)
        .order('name');
      if (!active) return;
      if (error) {
        setLoadError(error.message);
        setLoadingProducts(false);
        return;
      }
      const fetched = data as Product[];
      setProducts(fetched);

      const stored = loadStoredCart();
      if (stored) {
        const byId = new Map(fetched.map((p) => [p.id, p]));
        const restored: CartItem[] = [];
        for (const s of stored.items) {
          const p = byId.get(s.product_id);
          if (p) restored.push({ product: p, quantity: s.quantity });
        }
        if (restored.length > 0) {
          setItems(restored);
          setCustomerName(stored.customerName);
          setCustomerPhone(stored.customerPhone ?? '');
          setDiscountInput(stored.discountInput);
          setPaidInput(stored.paidInput);
          setPaidTouched(stored.paidTouched);
          setClientRef(stored.clientRef);
        }
      }
      setLoadingProducts(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Persist cart on every change
  useEffect(() => {
    if (loadingProducts) return;
    if (items.length === 0 && !customerName && !customerPhone && !discountInput && !paidInput) {
      saveStoredCart(null);
      return;
    }
    saveStoredCart({
      items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
      customerName,
      customerPhone,
      discountInput,
      paidInput,
      paidTouched,
      clientRef,
    });
    }, [items, customerName, customerPhone, discountInput, paidInput, paidTouched, clientRef, loadingProducts]);

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (items.length > 0 && !submitting && formRef.current) {
          formRef.current.requestSubmit();
        }
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items.length, submitting]);

  // Auto-focus search on desktop (avoid mobile keyboard pop)
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      searchRef.current?.focus();
    }
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
    setCustomerPhone('');
    setDiscountInput('');
    setPaidInput('');
    setPaidTouched(false);
    setClientRef(crypto.randomUUID());
    setError(null);
    setSuccess(null);
    saveStoredCart(null);
    setSearch('');
    searchRef.current?.focus();
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
        customerPhone: customerPhone.trim(),
        discount,
        amountPaid: effectivePaid,
        clientRef,
      });
      setSuccess({ result, items });
      push(`Sale recorded · ${result.bill_no}`, 'success');
      setItems([]);
      setCustomerName('');
      setCustomerPhone('');
      setDiscountInput('');
      setPaidInput('');
      setPaidTouched(false);
      setClientRef(crypto.randomUUID());
      saveStoredCart(null);
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    const { result, items: soldItems } = success;
    return (
      <div className="p-4 sm:p-6">
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
    <div className="p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">New sale</h1>
        </div>

        {loadError && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded px-4 py-2 text-sm">
            Couldn’t load products: {loadError}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow p-4 space-y-3">
            <input
              ref={searchRef}
              type="search"
              placeholder="Search products (F2)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
            {loadingProducts ? (
              <div className="space-y-3 pt-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-8 w-14 rounded" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <div className="text-3xl">{search ? '🔍' : '📦'}</div>
                <p className="text-sm text-slate-500">
                  {search
                    ? 'No products match that search.'
                    : 'No active products. Ask the owner to add some.'}
                </p>
              </div>
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
            ref={formRef}
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

              <div className="grid grid-cols-2 gap-2">
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
                <label className="block">
                  <span className="text-slate-500">Phone (optional)</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="98765 43210"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full border rounded px-3 py-2 mt-1"
                  />
                </label>
              </div>

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

            <p className="text-xs text-slate-400 text-center hidden md:block">
              <kbd className="border rounded px-1 py-0.5 bg-slate-50">F2</kbd> search ·{' '}
              <kbd className="border rounded px-1 py-0.5 bg-slate-50">Ctrl</kbd>+
              <kbd className="border rounded px-1 py-0.5 bg-slate-50">Enter</kbd>{' '}
              complete
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}