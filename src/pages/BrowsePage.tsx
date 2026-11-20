import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bookmark, ChevronDown, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { CategoryFilterSidebar } from '../components/CategoryFilterSidebar';
import { ListingCard } from '../components/ListingCard';
import { CATEGORY_LABEL_MAP, CONDITION_LABEL_MAP, LISTING_SORT_OPTIONS } from '../config/marketplace';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../hooks/useFavorites';
import {
  countListingsByCategory,
  countListingsByCondition,
  filterListings,
  parseCategoryFilterParam,
  parseConditionFilterParam,
  parseSavedOnlyParam,
  parseSearchQueryParam,
  parseSellerFilterParam,
  parseSortOptionParam,
} from '../lib/listingValidation';
import { subscribeActiveListings } from '../services/listingsService';
import { getUserPublicProfile } from '../services/usersService';
import type {
  Listing,
  ListingCategory,
  ListingCondition,
  ListingSortOption,
} from '../types/marketplace';

export function BrowsePage() {
  const { user, isVerified, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadError, setLoadError] = useState('');

  const urlQuery = parseSearchQueryParam(searchParams.get('q'));
  const [queryText, setQueryText] = useState(urlQuery);
  const [minPriceGhs, setMinPriceGhs] = useState('');
  const [maxPriceGhs, setMaxPriceGhs] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const catalogSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQueryText((current) => (current.trim() === urlQuery.trim() ? current : urlQuery));
  }, [urlQuery]);

  const {
    favoriteIds,
    favoritesError,
    isFavorite,
    isPending: isFavoritePending,
    toggleFavorite,
  } = useFavorites();

  const selectedCategories = useMemo(
    () => parseCategoryFilterParam(searchParams.get('category')),
    [searchParams]
  );

  const selectedConditions = useMemo(
    () => parseConditionFilterParam(searchParams.get('condition')),
    [searchParams]
  );

  const selectedSellerId = useMemo(
    () => parseSellerFilterParam(searchParams.get('seller')),
    [searchParams]
  );
  const [resolvedSellerName, setResolvedSellerName] = useState<string | null>(null);

  const savedOnly = useMemo(
    () => parseSavedOnlyParam(searchParams.get('saved')),
    [searchParams]
  );

  const sortBy = useMemo(
    () => parseSortOptionParam(searchParams.get('sort')),
    [searchParams]
  );

  const clearSellerFilter = () => {
    const updated = new URLSearchParams(searchParams);
    updated.delete('seller');
    setSearchParams(updated, { replace: true });
  };

  const handleSavedOnlyChange = (nextSavedOnly: boolean) => {
    const updated = new URLSearchParams(searchParams);
    if (nextSavedOnly) {
      updated.set('saved', '1');
    } else {
      updated.delete('saved');
    }
    setSearchParams(updated, { replace: true });
  };

  const handleSortChange = (nextSort: ListingSortOption) => {
    const updated = new URLSearchParams(searchParams);
    if (nextSort === 'newest') {
      updated.delete('sort');
    } else {
      updated.set('sort', nextSort);
    }
    setSearchParams(updated, { replace: true });
  };

  const handleQueryChange = (nextValue: string) => {
    setQueryText(nextValue);
    const trimmed = nextValue.trim();
    const updated = new URLSearchParams(searchParams);
    if (trimmed === '') {
      updated.delete('q');
    } else {
      updated.set('q', trimmed.slice(0, 120));
    }
    setSearchParams(updated, { replace: true });
  };

  const clearSearchQuery = (refocusInput = false) => {
    setQueryText('');
    const updated = new URLSearchParams(searchParams);
    updated.delete('q');
    setSearchParams(updated, { replace: true });
    if (refocusInput) {
      searchInputRef.current?.focus();
    }
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isVerified && catalogSectionRef.current) {
      catalogSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const updateSelectedCategories = (next: ListingCategory[]) => {
    const updated = new URLSearchParams(searchParams);
    if (next.length === 0) {
      updated.delete('category');
    } else {
      updated.set('category', next.join(','));
    }
    setSearchParams(updated, { replace: true });
  };

  const toggleCategory = (cat: ListingCategory) => {
    if (selectedCategories.includes(cat)) {
      updateSelectedCategories(selectedCategories.filter((c) => c !== cat));
    } else {
      updateSelectedCategories([...selectedCategories, cat]);
    }
  };

  const updateSelectedConditions = (next: ListingCondition[]) => {
    const updated = new URLSearchParams(searchParams);
    if (next.length === 0) {
      updated.delete('condition');
    } else {
      updated.set('condition', next.join(','));
    }
    setSearchParams(updated, { replace: true });
  };

  const toggleCondition = (cond: ListingCondition) => {
    if (selectedConditions.includes(cond)) {
      updateSelectedConditions(selectedConditions.filter((c) => c !== cond));
    } else {
      updateSelectedConditions([...selectedConditions, cond]);
    }
  };

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

  useEffect(() => {
    if (!selectedSellerId || !isVerified) {
      setResolvedSellerName(null);
      return;
    }

    const fromActiveListing = listings.find((item) => item.sellerId === selectedSellerId)?.sellerName;
    if (fromActiveListing) {
      setResolvedSellerName(fromActiveListing);
      return;
    }

    let cancelled = false;
    getUserPublicProfile(selectedSellerId)
      .then((profile) => {
        if (!cancelled) {
          setResolvedSellerName(profile?.displayName ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSellerName(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSellerId, isVerified, listings]);

  const sellerDisplayName = resolvedSellerName || 'Selected Seller';

  const activeSavedCount = useMemo(
    () => listings.filter((item) => item.status === 'active' && favoriteIds.has(item.id)).length,
    [listings, favoriteIds]
  );

  const listingsMatchingForCategoryCounts = useMemo(
    () =>
      filterListings(listings, {
        query: queryText,
        conditions: selectedConditions,
        sellerId: selectedSellerId,
        minPriceGhs,
        maxPriceGhs,
        onlySaved: savedOnly,
        favoriteIds,
      }),
    [
      listings,
      queryText,
      selectedConditions,
      selectedSellerId,
      minPriceGhs,
      maxPriceGhs,
      savedOnly,
      favoriteIds,
    ]
  );

  const categoryCounts = useMemo(
    () => countListingsByCategory(listingsMatchingForCategoryCounts),
    [listingsMatchingForCategoryCounts]
  );

  const listingsMatchingForConditionCounts = useMemo(
    () =>
      filterListings(listings, {
        query: queryText,
        categories: selectedCategories,
        sellerId: selectedSellerId,
        minPriceGhs,
        maxPriceGhs,
        onlySaved: savedOnly,
        favoriteIds,
      }),
    [
      listings,
      queryText,
      selectedCategories,
      selectedSellerId,
      minPriceGhs,
      maxPriceGhs,
      savedOnly,
      favoriteIds,
    ]
  );

  const conditionCounts = useMemo(
    () => countListingsByCondition(listingsMatchingForConditionCounts),
    [listingsMatchingForConditionCounts]
  );

  const filteredListings = useMemo(
    () =>
      filterListings(listings, {
        query: queryText,
        categories: selectedCategories,
        conditions: selectedConditions,
        sellerId: selectedSellerId,
        minPriceGhs,
        maxPriceGhs,
        sortBy,
        onlySaved: savedOnly,
        favoriteIds,
      }),
    [
      listings,
      queryText,
      selectedCategories,
      selectedConditions,
      selectedSellerId,
      minPriceGhs,
      maxPriceGhs,
      sortBy,
      savedOnly,
      favoriteIds,
    ]
  );

  const trimmedQuery = queryText.trim();

  const activeFilterCount =
    selectedCategories.length +
    selectedConditions.length +
    (minPriceGhs.trim() !== '' ? 1 : 0) +
    (maxPriceGhs.trim() !== '' ? 1 : 0);

  const hasActiveFilters = trimmedQuery !== '' || Boolean(selectedSellerId) || activeFilterCount > 0;

  const clearFilters = () => {
    setQueryText('');
    setMinPriceGhs('');
    setMaxPriceGhs('');
    const updated = new URLSearchParams(searchParams);
    updated.delete('category');
    updated.delete('condition');
    updated.delete('seller');
    updated.delete('q');
    setSearchParams(updated, { replace: true });
  };

  const resultsHeading = (() => {
    if (selectedSellerId) {
      return savedOnly
        ? `Saved listings by ${sellerDisplayName}`
        : `Active listings by ${sellerDisplayName}`;
    }
    if (savedOnly) {
      if (trimmedQuery && selectedCategories.length === 1) {
        return `Saved ${CATEGORY_LABEL_MAP[selectedCategories[0]]} matching "${trimmedQuery}"`;
      }
      if (trimmedQuery) {
        return `Saved items matching "${trimmedQuery}"`;
      }
      if (selectedCategories.length === 1) {
        return `Saved ${CATEGORY_LABEL_MAP[selectedCategories[0]]}`;
      }
      return 'Saved Items';
    }
    if (trimmedQuery && selectedCategories.length === 1) {
      return `${CATEGORY_LABEL_MAP[selectedCategories[0]]} matching "${trimmedQuery}"`;
    }
    if (trimmedQuery) {
      return `Results for "${trimmedQuery}"`;
    }
    if (selectedCategories.length === 1) {
      return CATEGORY_LABEL_MAP[selectedCategories[0]];
    }
    return sortBy === 'newest' ? 'Newest Listings' : 'All Listings';
  })();

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* BrowsePage Header with Integrated Keyword Search */}
      <header
        aria-label="Browse marketplace"
        className="bg-white border border-stone-200 rounded-xl overflow-hidden"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center space-y-4">
            <p className="text-xs font-medium text-emerald-900">
              Campus Exchange · Priced in Ghana Cedis
            </p>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-zinc-900 text-balance leading-tight">
              Buy and sell campus essentials safely across campus.
            </h1>
            <p className="text-sm sm:text-base text-zinc-600 max-w-xl leading-relaxed">
              Electronics, books, furniture, and dorm essentials from verified Campus Market accounts.
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
                  {user ? 'Verify Email' : 'Sign In / Sign Up'}
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

          <div className="lg:col-span-5 min-h-[200px] lg:min-h-[260px] bg-stone-100 relative">
            <img
              src="/src/assets/images/campus_market_hero_1794902420491.jpg"
              alt="Student laptop, textbooks, and headphones on a university library desk"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Header Text-Based Search Bar */}
        <div className="border-t border-stone-200 bg-[#FAF9F6]/70 px-5 sm:px-8 py-4">
          <form
            role="search"
            aria-label="Search campus listings"
            onSubmit={handleSearchSubmit}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
          >
            <div className="relative flex-1 min-w-0">
              <label htmlFor="browse-header-search" className="sr-only">
                Search items by name or keywords
              </label>
              <Search
                className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                id="browse-header-search"
                type="text"
                inputMode="search"
                autoComplete="off"
                value={queryText}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && queryText) {
                    e.preventDefault();
                    clearSearchQuery(true);
                  }
                }}
                placeholder="Search items by name or keywords (e.g. calculator, kettle, textbook)..."
                className="w-full min-h-[44px] pl-10 pr-12 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 bg-white border border-stone-300 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-emerald-900 focus:border-emerald-900 transition-colors"
              />
              {queryText && (
                <button
                  type="button"
                  onClick={() => clearSearchQuery(true)}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-10 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-stone-100 transition-colors focus-visible:outline-2 focus-visible:outline-emerald-900"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] text-sm font-medium text-zinc-900 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
            >
              Search
            </button>
          </form>
        </div>
      </header>

      {/* Verification Gate for Unverified Visitors */}
      {!authLoading && (!user || !isVerified) && (
        <section className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 text-center space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">
            Sign in to browse and trade campus essentials
          </h2>
          <p className="text-sm text-zinc-600 max-w-lg mx-auto">
            {trimmedQuery
              ? `Sign in and verify your email to search active campus listings matching "${trimmedQuery}".`
              : 'Sign up with any valid email address (Gmail, Yahoo, Outlook, or university email) and verify your inbox to browse, save items, and trade safely on campus.'}
          </p>
          <div className="pt-1">
            <Link
              to="/auth"
              className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors"
            >
              {user ? 'Complete Email Verification' : 'Sign In / Sign Up'}
            </Link>
          </div>
        </section>
      )}

      {/* Marketplace Catalog with Category Filtering Sidebar */}
      {isVerified && (
        <div
          ref={catalogSectionRef}
          className="flex flex-col lg:flex-row items-start gap-6 lg:gap-8 scroll-mt-20"
        >
          {/* Desktop Persistent Sticky Sidebar */}
          <div className="hidden lg:block w-60 xl:w-64 shrink-0 lg:sticky lg:top-20">
            <CategoryFilterSidebar
              selectedCategories={selectedCategories}
              categoryCounts={categoryCounts}
              totalMatchingCount={listingsMatchingForCategoryCounts.length}
              selectedConditions={selectedConditions}
              conditionCounts={conditionCounts}
              totalConditionMatchingCount={listingsMatchingForConditionCounts.length}
              minPriceGhs={minPriceGhs}
              maxPriceGhs={maxPriceGhs}
              hasActiveFilters={hasActiveFilters}
              onToggleCategory={toggleCategory}
              onClearCategories={() => updateSelectedCategories([])}
              onToggleCondition={toggleCondition}
              onClearConditions={() => updateSelectedConditions([])}
              onMinPriceChange={setMinPriceGhs}
              onMaxPriceChange={setMaxPriceGhs}
              onClearAll={clearFilters}
            />
          </div>

          {/* Main Catalog Column */}
          <div className="flex-1 min-w-0 w-full space-y-5">
            {/* Catalog View Switcher, Results Header, Sort Control & Active Filters */}
            <section aria-label="Active listings" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Segmented View Switcher: All Listings vs Saved Wishlist */}
                <div
                  role="group"
                  aria-label="Browse view"
                  className="inline-flex items-center p-1 bg-stone-100 border border-stone-200/80 rounded-lg shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => handleSavedOnlyChange(false)}
                    aria-pressed={!savedOnly}
                    className={`min-h-[38px] px-3.5 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
                      !savedOnly
                        ? 'bg-white text-zinc-900 font-semibold shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900 font-medium'
                    }`}
                  >
                    All Listings
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSavedOnlyChange(true)}
                    aria-pressed={savedOnly}
                    className={`inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
                      savedOnly
                        ? 'bg-white text-zinc-900 font-semibold shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900 font-medium'
                    }`}
                  >
                    <Bookmark
                      className={`w-3.5 h-3.5 ${savedOnly ? 'text-emerald-900 fill-current' : 'text-zinc-600'}`}
                      aria-hidden="true"
                    />
                    <span>Saved</span>
                    <span className="font-mono text-xs text-zinc-600 tabular-nums">
                      ({activeSavedCount})
                    </span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
                  <div className="flex items-center gap-2 shrink-0">
                    <label
                      htmlFor="browse-sort-select"
                      className="text-xs font-medium text-zinc-600 whitespace-nowrap shrink-0"
                    >
                      Sort by
                    </label>
                    <div className="relative">
                      <select
                        id="browse-sort-select"
                        aria-label="Sort listings"
                        value={sortBy}
                        onChange={(e) => handleSortChange(e.target.value as ListingSortOption)}
                        className="appearance-none min-h-[44px] sm:min-h-[40px] pl-3 pr-9 py-2 text-sm font-medium text-zinc-800 bg-white border border-stone-300 rounded-lg hover:border-stone-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-emerald-900 focus:border-emerald-900 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {LISTING_SORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="w-4 h-4 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen((prev) => !prev)}
                    aria-expanded={mobileFiltersOpen}
                    aria-controls="mobile-category-filters"
                    className="lg:hidden inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium text-zinc-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="font-mono text-xs text-emerald-900 tabular-nums">
                        ({activeFilterCount})
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-zinc-900 min-w-0 break-words">
                  {resultsHeading}{' '}
                  <span className="text-sm font-normal text-zinc-500 font-mono tabular-nums">
                    ({filteredListings.length})
                  </span>
                </h2>

                <div className="flex items-center gap-3 shrink-0">
                  {savedOnly && (
                    <Link
                      to="/saved"
                      aria-label="Open full Saved Items page"
                      className="text-xs font-semibold text-emerald-950 hover:underline underline-offset-4 whitespace-nowrap rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
                    >
                      Manage Saved Items
                    </Link>
                  )}
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-900 hover:underline whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 rounded"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              {/* Mobile / Tablet Collapsible Sidebar */}
              {mobileFiltersOpen && (
                <div id="mobile-category-filters" className="lg:hidden">
                  <CategoryFilterSidebar
                    selectedCategories={selectedCategories}
                    categoryCounts={categoryCounts}
                    totalMatchingCount={listingsMatchingForCategoryCounts.length}
                    selectedConditions={selectedConditions}
                    conditionCounts={conditionCounts}
                    totalConditionMatchingCount={listingsMatchingForConditionCounts.length}
                    minPriceGhs={minPriceGhs}
                    maxPriceGhs={maxPriceGhs}
                    hasActiveFilters={hasActiveFilters}
                    onToggleCategory={toggleCategory}
                    onClearCategories={() => updateSelectedCategories([])}
                    onToggleCondition={toggleCondition}
                    onClearConditions={() => updateSelectedConditions([])}
                    onMinPriceChange={setMinPriceGhs}
                    onMaxPriceChange={setMaxPriceGhs}
                    onClearAll={clearFilters}
                  />
                </div>
              )}

              {(trimmedQuery !== '' ||
                Boolean(selectedSellerId) ||
                selectedCategories.length > 0 ||
                selectedConditions.length > 0) && (
                <div
                  className="flex flex-wrap items-center gap-2"
                  aria-label="Active search, seller, category, and condition filters"
                >
                  {selectedSellerId && (
                    <button
                      type="button"
                      onClick={clearSellerFilter}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/20 rounded-md transition-colors max-w-full"
                    >
                      <span className="truncate max-w-[220px]">Seller: {sellerDisplayName}</span>
                      <X className="w-3 h-3 shrink-0" aria-hidden="true" />
                    </button>
                  )}

                  {trimmedQuery !== '' && (
                    <button
                      type="button"
                      onClick={() => clearSearchQuery(false)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-md transition-colors max-w-full"
                    >
                      <span className="truncate max-w-[220px]">Keyword: &ldquo;{trimmedQuery}&rdquo;</span>
                      <X className="w-3 h-3 shrink-0" aria-hidden="true" />
                    </button>
                  )}

                  {selectedCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/20 rounded-md transition-colors whitespace-nowrap"
                    >
                      <span>{CATEGORY_LABEL_MAP[cat]}</span>
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  ))}

                  {selectedConditions.map((cond) => (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => toggleCondition(cond)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-md transition-colors whitespace-nowrap"
                    >
                      <span>Condition: {CONDITION_LABEL_MAP[cond]}</span>
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}

              {(loadError || favoritesError) && (
                <div
                  className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm"
                  role="alert"
                >
                  {loadError || favoritesError}
                </div>
              )}

              {loadingListings ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
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
                    {savedOnly && activeSavedCount === 0
                      ? 'No saved items yet'
                      : savedOnly
                        ? 'No saved listings match your filters'
                        : hasActiveFilters
                          ? 'No listings match your search or filters'
                          : 'No active listings yet'}
                  </h3>
                  <p className="text-sm text-zinc-600 max-w-md mx-auto">
                    {savedOnly && activeSavedCount === 0
                      ? 'Tap the bookmark button on any campus listing to save items here and sync them across your devices.'
                      : savedOnly
                        ? 'Try clearing a keyword, category tag, or price limit to see your other saved items.'
                        : hasActiveFilters
                          ? 'Try different item keywords, clear a category tag, or adjust the GHS price range.'
                          : 'Be the first student to post an item for sale on Campus Market.'}
                  </p>
                  {savedOnly && activeSavedCount === 0 ? (
                    <button
                      type="button"
                      onClick={() => handleSavedOnlyChange(false)}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors"
                    >
                      Browse All Listings
                    </button>
                  ) : hasActiveFilters ? (
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
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredListings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      isFavorite={isFavorite(listing.id)}
                      favoritePending={isFavoritePending(listing.id)}
                      onToggleFavorite={(item) => void toggleFavorite(item)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
