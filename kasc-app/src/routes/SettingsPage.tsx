import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { makeKasc, Role } from '../lib/kasc';
import { friendlyMessage } from '../lib/errors';
import { useAuth } from '../auth/useAuth';
import { useToast } from '../lib/toast';
import {
  loadAppSettings,
  AppSettings,
  defaultSettings,
} from '../lib/settings';
import { SHOP_NAME, SHOP_ADDRESS, SHOP_PHONE } from '../lib/config';

const kasc = makeKasc(supabase);

type Profile = {
  user_id: string;
  display_name: string;
  role: Role;
  active: boolean;
  created_at: string;
};

type Tab = 'profile' | 'team' | 'bill' | 'help' | 'about';

const APP_VERSION = '0.1.0';

export function SettingsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';

  const tabs: { id: Tab; label: string; ownerOnly?: boolean }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'team', label: 'Team', ownerOnly: true },
    { id: 'bill', label: 'Bill', ownerOnly: true },
    { id: 'help', label: 'Help' },
    { id: 'about', label: 'About' },
  ];

  const visibleTabs = tabs.filter((t) => !t.ownerOnly || isOwner);
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-slate-600 hover:underline"
          >
            ← Home
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b overflow-x-auto">
          <nav className="flex gap-1 min-w-max">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={
                  'px-4 py-2 text-sm whitespace-nowrap -mb-px border-b-2 ' +
                  (activeTab === t.id
                    ? 'border-slate-900 text-slate-900 font-medium'
                    : 'border-transparent text-slate-500 hover:text-slate-800')
                }
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div>
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'team' && isOwner && <TeamTab />}
          {activeTab === 'bill' && isOwner && <BillTab />}
          {activeTab === 'help' && <HelpTab />}
          {activeTab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- */
/* Profile tab                                              */
/* -------------------------------------------------------- */

function ProfileTab() {
  const { profile, user } = useAuth();
  const { push } = useToast();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setNameSaving(true);
    setNameError(null);
    try {
      await kasc.setUserDisplayName(profile.user_id, name);
      push('Name updated', 'success');
    } catch (err) {
      setNameError(friendlyMessage(err));
    } finally {
      setNameSaving(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      push('Password changed', 'success');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwError(friendlyMessage(err));
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={saveName} className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-semibold">Your name</h2>
        <p className="text-xs text-slate-500">
          Shown in the app header and on sales you record.
        </p>
        <label className="block text-sm">
          <span className="text-slate-500">Display name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
        {nameError && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2 text-sm">
            {nameError}
          </div>
        )}
        <button
          type="submit"
          disabled={nameSaving}
          className="bg-slate-900 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {nameSaving ? 'Saving…' : 'Save name'}
        </button>
      </form>

      <form onSubmit={savePassword} className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-semibold">Change password</h2>
        <p className="text-xs text-slate-500">
          If you don’t remember your current password, sign out and use “Forgot password?”
          on the login page.
        </p>
        <label className="block text-sm">
          <span className="text-slate-500">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-500">Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
        {pwError && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2 text-sm">
            {pwError}
          </div>
        )}
        <button
          type="submit"
          disabled={pwSaving}
          className="bg-slate-900 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {pwSaving ? 'Saving…' : 'Change password'}
        </button>
      </form>

      <div className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Account</h2>
        <div className="flex justify-between">
          <span className="text-slate-500">Email</span>
          <span className="font-mono text-xs">{user?.email ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Role</span>
          <span className="capitalize">{profile?.role ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Account ID</span>
          <span className="font-mono text-xs">{profile?.user_id.slice(0, 8)}…</span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- */
/* Team tab (existing logic, wrapped)                       */
/* -------------------------------------------------------- */

function TeamTab() {
  const { profile: me } = useAuth();
  const { push } = useToast();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, display_name, role, active, created_at')
      .order('display_name');
    if (error) setError(error.message);
    else setProfiles(data as Profile[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleRole(p: Profile) {
    if (me?.user_id === p.user_id) {
      setError('You cannot change your own role.');
      return;
    }
    const newRole: Role = p.role === 'owner' ? 'employee' : 'owner';
    if (!confirm(`Change ${p.display_name} to ${newRole}?`)) return;
    setBusyId(p.user_id);
    setError(null);
    try {
      await kasc.setUserRole(p.user_id, newRole);
      push(`${p.display_name} is now ${newRole}`, 'success');
      await load();
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(p: Profile) {
    if (me?.user_id === p.user_id) {
      setError('You cannot deactivate yourself.');
      return;
    }
    if (!confirm(`${p.active ? 'Deactivate' : 'Reactivate'} ${p.display_name}?`)) return;
    setBusyId(p.user_id);
    setError(null);
    try {
      await kasc.setUserActive(p.user_id, !p.active);
      push(p.active ? 'Deactivated' : 'Reactivated', 'success');
      await load();
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function rename(p: Profile) {
    const name = prompt('New display name:', p.display_name);
    if (!name || name.trim() === p.display_name) return;
    setBusyId(p.user_id);
    setError(null);
    try {
      await kasc.setUserDisplayName(p.user_id, name.trim());
      push('Name updated', 'success');
      await load();
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-3">
      <div>
        <h2 className="font-semibold">Team</h2>
        <p className="text-xs text-slate-500 mt-1">
          To add a new member, first create them in Supabase Dashboard → Authentication → Users,
          then they appear here. Use this page to promote, deactivate, or rename.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : profiles.length === 0 ? (
        <p className="text-slate-500 text-sm">No profiles.</p>
      ) : (
        <ul className="divide-y">
          {profiles.map((p) => {
            const isMe = me?.user_id === p.user_id;
            const busy = busyId === p.user_id;
            return (
              <li key={p.user_id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {p.display_name || '(no name)'}
                    </span>
                    {isMe && (
                      <span className="text-xs bg-slate-100 text-slate-600 rounded px-2 py-0.5">
                        you
                      </span>
                    )}
                    {!p.active && (
                      <span className="text-xs bg-red-100 text-red-700 rounded px-2 py-0.5">
                        inactive
                      </span>
                    )}
                    <span
                      className={
                        'text-xs rounded px-2 py-0.5 ' +
                        (p.role === 'owner'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-700')
                      }
                    >
                      {p.role}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 font-mono">
                    {p.user_id.slice(0, 8)}…
                  </div>
                </div>
                <div className="shrink-0 flex gap-1.5 flex-wrap justify-end">
                  <button
                    onClick={() => rename(p)}
                    disabled={busy}
                    className="border rounded px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => toggleRole(p)}
                    disabled={busy || isMe}
                    className="border rounded px-2 py-1 text-xs disabled:opacity-40"
                  >
                    {p.role === 'owner' ? 'Demote' : 'Promote'}
                  </button>
                  <button
                    onClick={() => toggleActive(p)}
                    disabled={busy || isMe}
                    className={
                      'border rounded px-2 py-1 text-xs disabled:opacity-40 ' +
                      (p.active ? 'border-red-300 text-red-700' : '')
                    }
                  >
                    {p.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------- */
/* Bill tab                                                 */
/* -------------------------------------------------------- */

function BillTab() {
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AppSettings>(defaultSettings);

  useEffect(() => {
    let active = true;
    (async () => {
      const s = await loadAppSettings(supabase);
      if (!active) return;
      setForm(s);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await kasc.updateAppSettings({
        shopName: form.shop_name,
        shopAddress: form.shop_address,
        shopPhone: form.shop_phone,
        billFooter: form.bill_footer,
        unpaidDaysThreshold: form.unpaid_days_threshold,
      });
      push('Bill settings saved', 'success');
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="p-4 text-slate-500 text-sm">Loading…</p>;
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-semibold">Shop details</h2>
        <p className="text-xs text-slate-500">
          Printed at the top of every bill.
        </p>
        <label className="block text-sm">
          <span className="text-slate-500">Shop name</span>
          <input
            type="text"
            required
            value={form.shop_name}
            onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-500">Address (optional)</span>
          <input
            type="text"
            value={form.shop_address}
            onChange={(e) => setForm({ ...form, shop_address: e.target.value })}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-500">Phone (optional)</span>
          <input
            type="tel"
            value={form.shop_phone}
            onChange={(e) => setForm({ ...form, shop_phone: e.target.value })}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-500">Bill footer</span>
          <input
            type="text"
            value={form.bill_footer}
            onChange={(e) => setForm({ ...form, bill_footer: e.target.value })}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-semibold">Payment reminders</h2>
        <p className="text-xs text-slate-500">
          Show unpaid bills older than this on the home dashboard.
        </p>
        <label className="block text-sm">
          <span className="text-slate-500">Days before showing as overdue</span>
          <input
            type="number"
            min={1}
            required
            value={form.unpaid_days_threshold}
            onChange={(e) =>
              setForm({ ...form, unpaid_days_threshold: Number(e.target.value) || 1 })
            }
            className="w-full border rounded px-3 py-2 mt-1 max-w-[120px]"
          />
        </label>
      </div>

      <div className="bg-slate-100 rounded-xl p-4 space-y-1 text-sm">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
          Receipt preview
        </div>
        <div className="text-center border-b border-slate-400 pb-2 mb-2">
          <div className="font-bold">{form.shop_name || '—'}</div>
          {form.shop_address && <div className="text-xs">{form.shop_address}</div>}
          {form.shop_phone && <div className="text-xs">{form.shop_phone}</div>}
          <div className="text-xs uppercase tracking-wider mt-1">Sales receipt</div>
        </div>
        <div className="text-xs italic text-center">{form.bill_footer || '—'}</div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="bg-slate-900 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}

/* -------------------------------------------------------- */
/* Help tab                                                 */
/* -------------------------------------------------------- */

function HelpTab() {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 space-y-2">
        <h2 className="font-semibold">Keyboard shortcuts</h2>
        <ul className="text-sm space-y-1.5">
          <li>
            <kbd className="border rounded px-1.5 py-0.5 bg-slate-50 text-xs">F2</kbd>{' '}
            Focus the product search on New sale
          </li>
          <li>
            <kbd className="border rounded px-1.5 py-0.5 bg-slate-50 text-xs">Ctrl</kbd>+
            <kbd className="border rounded px-1.5 py-0.5 bg-slate-50 text-xs">Enter</kbd>{' '}
            Complete the sale from anywhere on New sale
          </li>
          <li>
            <kbd className="border rounded px-1.5 py-0.5 bg-slate-50 text-xs">Esc</kbd>{' '}
            Close any open dialog (edit product, adjust stock)
          </li>
          <li>
            <kbd className="border rounded px-1.5 py-0.5 bg-slate-50 text-xs">Ctrl</kbd>+
            <kbd className="border rounded px-1.5 py-0.5 bg-slate-50 text-xs">P</kbd>{' '}
            Print the current page (from Sale detail, prints the receipt)
          </li>
        </ul>
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <h2 className="font-semibold">Common tasks</h2>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Record a new sale</summary>
          <ol className="list-decimal list-inside pl-4 mt-2 space-y-1 text-slate-600">
            <li>Click <strong>New sale</strong> from Home or the top nav</li>
            <li>Search or scroll the product list, click <strong>Add</strong></li>
            <li>Adjust quantities in the cart</li>
            <li>Optional: enter customer name and phone</li>
            <li>Optional: enter a discount and amount paid (leave blank for full payment)</li>
            <li>Click <strong>Complete sale</strong></li>
          </ol>
        </details>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Take a late payment</summary>
          <ol className="list-decimal list-inside pl-4 mt-2 space-y-1 text-slate-600">
            <li>Find the sale on <strong>Sales history</strong> or via the <strong>Unpaid bills</strong> card on Home</li>
            <li>Click <strong>Record payment</strong></li>
            <li>Enter the amount received, click <strong>Confirm</strong></li>
            <li>The bill becomes <strong>paid</strong> if that clears the balance</li>
          </ol>
        </details>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Handle a return</summary>
          <ol className="list-decimal list-inside pl-4 mt-2 space-y-1 text-slate-600">
            <li>Open the sale from <strong>Sales history</strong></li>
            <li>Click <strong>Record refund</strong></li>
            <li>Enter the refund amount, click <strong>Confirm</strong></li>
            <li>If the entire sale is returned, refund the full amount then click <strong>Void sale</strong> (restores stock)</li>
          </ol>
        </details>
        {isOwner && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Add stock (restock)</summary>
            <ol className="list-decimal list-inside pl-4 mt-2 space-y-1 text-slate-600">
              <li>Go to <strong>Products</strong></li>
              <li>Click <strong>Adjust</strong> on the product</li>
              <li>Enter the quantity received (e.g. <code>50</code>)</li>
              <li>Pick reason "Purchase" — enter invoice number in the note</li>
              <li>Click <strong>Apply</strong></li>
              <li>Stock is updated and a movement is recorded for the product history</li>
            </ol>
          </details>
        )}
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Still stuck?</h2>
        <p className="text-slate-600">
          Ask the shop owner for help. If it’s a technical problem (something broke),
          contact your developer.
        </p>
        {(SHOP_PHONE || SHOP_ADDRESS) && (
          <p className="text-xs text-slate-500">
            Shop contact: {SHOP_PHONE}
            {SHOP_PHONE && SHOP_ADDRESS ? ' · ' : ''}
            {SHOP_ADDRESS}
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- */
/* About tab                                                */
/* -------------------------------------------------------- */

function AboutTab() {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 space-y-2">
        <h2 className="font-semibold text-lg">{SHOP_NAME}</h2>
        <p className="text-sm text-slate-600">Shop management app</p>
        <p className="text-xs text-slate-500 mt-2">Version {APP_VERSION}</p>
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Built with</h2>
        <ul className="space-y-1 text-slate-600">
          <li>React + TypeScript + Vite</li>
          <li>Tailwind CSS</li>
          <li>Supabase (PostgreSQL, Auth, Row Level Security)</li>
          <li>Cloudflare Pages</li>
        </ul>
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Credits</h2>
        <p className="text-slate-600">
          Custom-built for {SHOP_NAME}. Made with care for daily shop operations.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-medium">A note on data</p>
        <p className="mt-1">
          Your sales, products and payments are backed up daily. If you ever notice
          something unexpected, contact your developer right away — don’t try to fix
          it in the database directly.
        </p>
      </div>
    </div>
  );
}