import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { TopNav } from '../components/TopNav';

export function ProtectedLayout() {
  const { loading, session, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-8 text-slate-500 text-sm">Loading…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!profile) {
    return (
      <div className="p-8 max-w-md">
        <h1 className="text-xl font-semibold mb-2">Account not set up</h1>
        <p className="text-slate-600 text-sm">
          Your login exists but no profile row was created. Ask the shop owner
          to finish your setup.
        </p>
      </div>
    );
  }
  if (!profile.active) {
    return (
      <div className="p-8 max-w-md">
        <h1 className="text-xl font-semibold mb-2">Account deactivated</h1>
        <p className="text-slate-600 text-sm">Contact the shop owner.</p>
      </div>
    );
  }
  return (
    <>
      <TopNav />
      <Outlet />
    </>
  );
}