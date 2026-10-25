import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { makeKasc, Role } from '../lib/kasc';
import { friendlyMessage } from '../lib/errors';
import { useAuth } from '../auth/useAuth';

type Profile = {
  user_id: string;
  display_name: string;
  role: Role;
  active: boolean;
  created_at: string;
};

const kasc = makeKasc(supabase);

export function SettingsPage() {
  const navigate = useNavigate();
  const { profile: me } = useAuth();

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
      await load();
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
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

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded px-4 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow p-4 space-y-3">
          <div>
            <h2 className="font-semibold">Team</h2>
            <p className="text-xs text-slate-500 mt-1">
              To add a new team member, first create them in Supabase Dashboard →
              Authentication → Users, then they will appear here. Use this page to
              promote, deactivate, or rename existing members.
            </p>
          </div>

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
                        title={isMe ? 'You cannot change your own role' : ''}
                        className="border rounded px-2 py-1 text-xs disabled:opacity-40"
                      >
                        {p.role === 'owner' ? 'Demote' : 'Promote'}
                      </button>
                      <button
                        onClick={() => toggleActive(p)}
                        disabled={busy || isMe}
                        title={isMe ? 'You cannot deactivate yourself' : ''}
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
      </div>
    </div>
  );
}
