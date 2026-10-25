import { useAuth } from '../auth/useAuth';

export function HomePage() {
  const { profile, signOut } = useAuth();
  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-semibold mb-2">Welcome, {profile?.display_name || 'user'}</h1>
      <p className="text-slate-600 mb-6">
        Role: <span className="font-mono">{profile?.role}</span>
      </p>
      <p className="text-slate-500 mb-6">
        Next screens (products, cart, sale detail) plug in here.
      </p>
      <button onClick={signOut} className="border rounded px-3 py-1.5 text-sm">
        Sign out
      </button>
    </div>
  );
}