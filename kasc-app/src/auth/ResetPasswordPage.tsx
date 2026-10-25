import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecoveryToken, setHasRecoveryToken] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    const hash = window.location.hash;
    const inHash = hash.includes('type=recovery');

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || (inHash && session)) {
        setHasRecoveryToken(true);
        setReady(true);
      }
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (inHash || data.session) {
        setHasRecoveryToken(true);
      }
      setReady(true);
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      window.history.replaceState(null, '', '/reset-password');
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return <div className="p-8 text-slate-500">Verifying link…</div>;
  }

  if (!hasRecoveryToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow p-6 space-y-3">
          <h1 className="text-xl font-semibold">Invalid or expired link</h1>
          <p className="text-slate-600 text-sm">
            The password reset link is invalid or has expired. Request a new one
            from the sign-in page.
          </p>
          <Link
            to="/forgot-password"
            className="block bg-slate-900 text-white rounded py-2 text-center text-sm"
          >
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow p-6 space-y-3 text-center">
          <h1 className="text-xl font-semibold">Password updated</h1>
          <p className="text-slate-600 text-sm">Redirecting you to the app…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-xl shadow p-6 space-y-4"
      >
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        <label className="block text-sm">
          <span className="text-slate-500">New password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-500">Confirm password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-slate-900 text-white rounded py-2 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}