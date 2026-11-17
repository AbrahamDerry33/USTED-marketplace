import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { LISTING_CATEGORIES } from '../config/marketplace';
import { useAuth } from '../context/AuthContext';
import { filterListings } from '../lib/listingValidation';
import { subscribeActiveListings } from '../services/listingsService';
import { ListingCard } from '../components/ListingCard';
import type { Listing, ListingCategory } from '../types/marketplace';

export function BrowsePage() {
  const { user, isVerified, loading: authLoading } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [queryText, setQueryText] = useState('');
  const [category, setCategory] = useState<ListingCategory | 'all'>('all');
  const [minPriceGhs, setMinPriceGhs] = useState('');
  const [maxPriceGhs, setMaxPriceGhs] = useState('');
  const [showPriceFilters, setShowPriceFilters] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isVerified) {
      setListings([]);
      setLoadingListings(false);
      return;
    }

    setLoadingListings(true);
    setLoadError('');
    const unsubscribe = subscribeActiveListings(
      (items) => {
        setListings(items);
        setLoadingListings(false);
      },
      () => {
        setLoadError('Unable to load listings right now. Refresh or try again shortly.');
        setLoadingListings(false);
      }
    );

    return () => unsubscribe();
  }, [authLoading, user, isVerified]);

  const filteredListings = useMemo(
    () =>
      filterListings(listings, {
        query: queryText,
        category,
        minPriceGhs,
        maxPriceGhs,
      }),
    [listings, queryText, category, minPriceGhs, maxPriceGhs]
  );

  const hasActiveFilters =
    queryText.trim() !== '' ||
    category !== 'all' ||
    minPriceGhs.trim() !== '' ||
    maxPriceGhs.trim() !== '';

  const clearFilters = () => {
    setQueryText('');
    setCategory('all');
    setMinPriceGhs('');
    setMaxPriceGhs('');
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* Editorial Hero Strip */}
      <section className="bg-white border border-stone-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center space-y-4">
          <p className="text-xs font-medium text-emerald-900">
            Verified Student Exchange · Priced in Ghana Cedis
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-zinc-900 text-balance leading-tight">
            Buy and sell campus essentials safely with fellow students.
          </h1>
          <p className="text-sm sm:text-base text-zinc-600 max-w-xl leading-relaxed">
            Textbooks, laptops, hostel furniture, and everyday study gear from verified campus
            accounts.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {isVerified ? (
              <Link
                to="/sell"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Post a Listing
              </Link>
            ) : (
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap"
              >
                {user ? 'Verify School Email' : 'Sign In with School Email'}
              </Link>
            )}
            <Link
              to="/my-listings"
              className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors whitespace-nowrap"
            >
              My Listings
            </Link>
          </div>
        </div>

        <div className="lg:col-span-5 min-h-[200px] lg:min-h-[280px] bg-stone-100 relative">
          <img
            src="/src/assets/images/campus_market_hero_1794902420491.jpg"
            alt="Student laptop, textbooks, and headphones on a university library desk"
            className="w-full h-full object-cover"
          />
        </div>
      </section>

      {/* Verification Gate for Unverified Visitors */}
      {!authLoading && (!user || !isVerified) && (
        <section className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 text-center space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">
            Verified school email required to browse listings
          </h2>
          <p className="text-sm text-zinc-600 max-w-lg mx-auto">
            Campus Market restricts marketplace access to verified student accounts to protect buyers
            and sellers. Sign in or verify your email to view active campus listings.
          </p>
          <div className="pt-1">
            <Link
              to="/auth"
              className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors"
            >
              {user ? 'Complete Email Verification' : 'Sign In or Sign Up'}
            </Link>
          </div>
        </section>
      )}

      {/* Search, Category & Price Filters */}
      {isVerified && (
        <>
          <section className="space-y-4" aria-label="Search and filter listings">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <label htmlFor="marketplace-search" className="sr-only">
                  Search listings by keyword
                </label>
                <Search
                  className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="marketplace-search"
                  type="search"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="Search textbooks, calculators, chairs..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-emerald-900"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowPriceFilters((prev) => !prev)}
                aria-expanded={showPriceFilters}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors whitespace-nowrap shrink-0"
              >
                <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                Price Range
              </button>
            </div>

            {showPriceFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white border border-stone-200 rounded-xl p-4">
                <div>
                  <label htmlFor="min-price" className="block text-xs font-medium text-zinc-700 mb-1">
                    Min Price (GHS)
                  </label>
                  <input
                    id="min-price"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={minPriceGhs}
                    onChange={(e) => setMinPriceGhs(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg font-mono tabular-nums focus:outline-none focus:border-emerald-900"
                  />
                </div>
                <div>
                  <label htmlFor="max-price" className="block text-xs font-medium text-zinc-700 mb-1">
                    Max Price (GHS)
                  </label>
                  <input
                    id="max-price"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={maxPriceGhs}
                    onChange={(e) => setMaxPriceGhs(e.target.value)}
                    placeholder="5000.00"
                    className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg font-mono tabular-nums focus:outline-none focus:border-emerald-900"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            )}

            {/* Category Segmented Controls */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Category filter">
              <button
                type="button"
                onClick={() => setCategory('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                  category === 'all'
                    ? 'bg-emerald-900 text-white'
                    : 'bg-stone-200/70 text-zinc-700 hover:bg-stone-300/70'
                }`}
              >
                All Categories
              </button>
              {LISTING_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                    category === cat.value
                      ? 'bg-emerald-900 text-white'
                      : 'bg-stone-200/70 text-zinc-700 hover:bg-stone-300/70'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </section>

          {/* Listings Grid */}
          <section aria-label="Active listings">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-lg font-semibold text-zinc-900">
                Newest Listings{' '}
                <span className="text-sm font-normal text-zinc-500 tabular-nums">
                  ({filteredListings.length})
                </span>
              </h2>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-900 hover:underline"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  Clear filters
                </button>
              )}
            </div>

            {loadError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm" role="alert">
                {loadError}
              </div>
            )}

            {loadingListings ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="bg-white border border-stone-200 rounded-xl overflow-hidden animate-pulse"
                  >
                    <div className="aspect-[4/3] bg-stone-200" />
                    <div className="p-4 space-y-2">
                      <div className="h-3 w-1/2 bg-stone-200 rounded" />
                      <div className="h-4 w-3/4 bg-stone-200 rounded" />
                      <div className="h-4 w-1/3 bg-stone-200 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
                <h3 className="text-base font-semibold text-zinc-900">
                  {hasActiveFilters ? 'No listings match your filters' : 'No active listings yet'}
                </h3>
                <p className="text-sm text-zinc-600 max-w-md mx-auto">
                  {hasActiveFilters
                    ? 'Try clearing your search keyword or adjusting the category and GHS price range.'
                    : 'Be the first student to post an item for sale on Campus Market.'}
                </p>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                  >
                    Clear Filters
                  </button>
                ) : (
                  <Link
                    to="/sell"
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Post First Listing
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredListings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
