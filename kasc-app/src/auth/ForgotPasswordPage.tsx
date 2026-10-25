import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Reset password</h1>

        {sent ? (
          <>
            <p className="text-slate-600 text-sm">
              If that email matches an account, we sent a reset link. Check your
              inbox and click the link — it takes you to a page to set a new password.
            </p>
            <p className="text-xs text-slate-500">
              Don’t see it? Check spam, or wait a minute and try again.
            </p>
            <Link to="/login" className="block text-sm text-slate-700 underline">
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <p className="text-slate-600 text-sm">
              Enter the email address for your account. We’ll send a link to set a
              new password.
            </p>
            <label className="block text-sm">
              <span className="text-slate-500">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
            <Link to="/login" className="block text-sm text-slate-600 underline text-center">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}