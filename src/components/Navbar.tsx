import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { user, isVerified, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    setMobileOpen(false);
    await signOut();
    navigate('/auth');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
      isActive
        ? 'text-emerald-900 underline underline-offset-4 decoration-2'
        : 'text-zinc-600 hover:text-zinc-900'
    }`;

  return (
    <header className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-sm border-b border-stone-200">
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
        <nav className="hidden md:flex items-center gap-6" aria-label="Primary navigation">
          <NavLink to="/" className={navLinkClass}>
            Browse
          </NavLink>
          <NavLink to="/sell" className={navLinkClass}>
            Sell Item
          </NavLink>
          <NavLink to="/my-listings" className={navLinkClass}>
            My Listings
          </NavLink>
        </nav>

        {/* Zone 3: Single primary action + mobile menu toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <div className="hidden md:flex items-center gap-3">
              <button
                type="button"
                onClick={handleSignOut}
                className="px-4 py-2 text-xs font-medium text-zinc-800 bg-stone-200/80 hover:bg-stone-300/80 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {isVerified ? 'Sign Out' : 'Verify Email'}
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="hidden md:inline-flex px-4 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-zinc-700 hover:bg-stone-200/70 transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-stone-200 bg-[#FAF9F6] px-4 py-3 space-y-2">
          <nav className="flex flex-col space-y-1" aria-label="Mobile navigation">
            <NavLink
              to="/"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-stone-200/60"
            >
              Browse
            </NavLink>
            <NavLink
              to="/sell"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-stone-200/60"
            >
              Sell Item
            </NavLink>
            <NavLink
              to="/my-listings"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-800 hover:bg-stone-200/60"
            >
              My Listings
            </NavLink>
          </nav>
          <div className="pt-2 border-t border-stone-200">
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full px-4 py-2.5 text-sm font-medium text-zinc-800 bg-stone-200 rounded-lg hover:bg-stone-300 transition-colors"
              >
                Sign Out
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
