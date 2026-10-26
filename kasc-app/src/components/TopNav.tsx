import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { SHOP_LOGO } from '../lib/config';

export function TopNav() {
  const { profile, signOut } = useAuth();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    'px-3 py-1.5 rounded text-sm whitespace-nowrap ' +
    (isActive
      ? 'bg-slate-900 text-white'
      : 'text-slate-700 hover:bg-slate-100');

  return (
    <nav className="bg-white border-b sticky top-0 z-40 print:hidden">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-3">
        <Link to="/" className="font-semibold shrink-0">
          {SHOP_LOGO}
        </Link>
        <div className="flex gap-1 overflow-x-auto flex-1 min-w-0">
          <NavLink to="/sales/new" className={linkClass}>
            New sale
          </NavLink>
          <NavLink to="/sales" className={linkClass} end>
            Sales
          </NavLink>
          <NavLink to="/products" className={linkClass}>
            Products
          </NavLink>
          <NavLink to="/settings" className={linkClass}>
            Settings
          </NavLink>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500 hidden sm:inline">
            {profile?.display_name || 'user'}
          </span>
          <button
            onClick={signOut}
            className="text-xs text-slate-600 hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}