import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!profile) {
    return (
      <div className="p-8 max-w-md">
        <h1 className="text-xl font-semibold mb-2">Account not set up</h1>
        <p className="text-slate-600">
          Your login exists but no profile row was created. Ask the shop owner to
          finish your setup in Supabase, then reload.
        </p>
      </div>
    );
  }
  if (!profile.active) {
    return (
      <div className="p-8 max-w-md">
        <h1 className="text-xl font-semibold mb-2">Account deactivated</h1>
        <p className="text-slate-600">Contact the shop owner.</p>
      </div>
    );
  }
  return <>{children}</>;
}