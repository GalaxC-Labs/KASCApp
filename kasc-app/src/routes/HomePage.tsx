import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export function HomePage() {
  const { profile, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-xl mx-auto bg-white rounded-xl shadow p-6 space-y-4">
        <h1 className="text-2xl font-semibold">
          Welcome, {profile?.display_name || 'user'}
        </h1>
        <p className="text-slate-600 text-sm">
          Role: <span className="font-mono">{profile?.role}</span>
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Link
            to="/sales/new"
            className="bg-slate-900 text-white rounded px-4 py-2 text-center"
          >
            New sale
          </Link>
          <Link
            to="/sales"
            className="border rounded px-4 py-2 text-center"
          >
            Sales history
          </Link>
          <Link
            to="/products"
            className="border rounded px-4 py-2 text-center"
          >
            Products
          </Link>
        </div>
        <button onClick={signOut} className="border rounded px-3 py-1.5 text-sm">
          Sign out
        </button>
      </div>
    </div>
  );
}
