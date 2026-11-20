import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { Bookmark, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSavedItems } from '../context/SavedItemsContext';
import { auth } from '../lib/firebase';
import { NotificationBell } from './NotificationBell';

export function Navbar() {
  const { user, isVerified } = useAuth();
  const { savedCount } = useSavedItems();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut(auth);
      setMobileOpen(false);
      navigate('/auth', { replace: true });
    } catch (error) {
      console.error('Failed to sign out:', error);
    } finally {
      setLoggingOut(false);
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
      isActive
        ? 'text-emerald-900 underline underline-offset-4 decoration-2'
        : 'text-zinc-600 hover:text-zinc-900'
    }`;

  return (
    <header className="print:hidden sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-sm border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single-element brand wordmark */}
        <Link
          to="/"
          onClick={() => setMobileOpen(false)}
          className="text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
        >
          Campus Market
        </Link>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden lg:flex items-center gap-5" aria-label="Primary navigation">
          <NavLink to="/" className={navLinkClass}>
            Browse
          </NavLink>
          {user && isVerified && (
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
          )}
          <NavLink to="/sell" className={navLinkClass}>
            Sell Item
          </NavLink>
          <NavLink to="/my-listings" className={navLinkClass}>
            My Listings
          </NavLink>
          <NavLink to="/orders" className={navLinkClass}>
            Orders
          </NavLink>
          <NavLink to="/campus-map" className={navLinkClass}>
            Campus Map
          </NavLink>
          <NavLink to="/ai" className={navLinkClass}>
            AI Studio
          </NavLink>
        </nav>

        {/* Zone 3: Saved items shortcut + Notification bell + single primary action + mobile menu toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {user && isVerified && (
            <NavLink
              to="/saved"
              onClick={() => setMobileOpen(false)}
              aria-label={
                savedCount > 0
                  ? `Saved items, ${savedCount} bookmarked`
                  : 'Saved items, no bookmarked listings'
              }
              title="Saved Items"
              className={({ isActive }) =>
                `relative inline-flex items-center justify-center w-10 h-10 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
                  isActive
                    ? 'bg-emerald-900/10 text-emerald-950'
                    : 'text-zinc-700 hover:bg-stone-200/70 hover:text-zinc-950'
                }`
              }
            >
              <Bookmark className="w-5 h-5" aria-hidden="true" />
              {savedCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-900 text-white text-[10px] font-semibold leading-[18px] text-center tabular-nums"
                >
                  {savedCount > 99 ? '99+' : savedCount}
                </span>
              )}
            </NavLink>
          )}

          <NotificationBell />

          {user ? (
            <div className="hidden lg:flex items-center gap-3">
              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-800 bg-stone-200/80 hover:bg-stone-300/80 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                {loggingOut ? 'Logging out...' : 'Log Out'}
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="hidden lg:inline-flex px-4 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-zinc-700 hover:bg-stone-200/70 transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-stone-200 bg-[#FAF9F6] px-4 py-3 space-y-2">
          <nav className="flex flex-col space-y-1" aria-label="Mobile navigation">
            <NavLink
              to="/"
              onClick={() => setMobileOpen(false)}
              className="min-h-[44px] flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-stone-200/60"
            >
              Browse
            </NavLink>
            {user && isVerified && (
              <>
                <NavLink
                  to="/saved"
                  onClick={() => setMobileOpen(false)}
                  className="min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-stone-200/60"
                >
                  <span>Saved Items</span>
                  {savedCount > 0 && (
                    <span className="font-mono text-xs font-semibold text-emerald-950 tabular-nums">
                      {savedCount}
                    </span>
                  )}
                </NavLink>
                <NavLink
                  to="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="min-h-[44px] flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-stone-200/60"
                >
                  Dashboard
                </NavLink>
              </>
            )}
            <NavLink
              to="/sell"
              onClick={() => setMobileOpen(false)}
              className="min-h-[44px] flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-stone-200/60"
            >
              Sell Item
            </NavLink>
            <NavLink
              to="/my-listings"
              onClick={() => setMobileOpen(false)}
              className="min-h-[44px] flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-stone-200/60"
            >
              My Listings
            </NavLink>
            <NavLink
              to="/orders"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-stone-200/60"
            >
              Orders
            </NavLink>
            <NavLink
              to="/campus-map"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-stone-200/60"
            >
              Campus Map
            </NavLink>
            <NavLink
              to="/ai"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-stone-200/60"
            >
              AI Studio
            </NavLink>
          </nav>
          <div className="pt-2 border-t border-stone-200">
            {user ? (
              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-800 bg-stone-200 rounded-lg hover:bg-stone-300 disabled:opacity-50 transition-colors"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                {loggingOut ? 'Logging out...' : 'Log Out'}
              </button>
            ) : (
              <Link
                to="/auth"
                onClick={() => setMobileOpen(false)}
                className="block w-full text-center px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
