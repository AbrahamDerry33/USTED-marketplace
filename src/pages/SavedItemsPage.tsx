import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  BookmarkX,
  ChevronDown,
  ImageOff,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { ListingCard } from '../components/ListingCard';
import { CATEGORY_LABEL_MAP, LISTING_STATUS_LABELS } from '../config/marketplace';
import { useAuth } from '../context/AuthContext';
import { useSavedItems } from '../context/SavedItemsContext';
import { formatGhs } from '../lib/money';
import {
  filterAndSortSavedItems,
  resolveSavedItems,
  summarizeSavedItems,
  type SavedAvailabilityFilter,
  type SavedSortOption,
} from '../lib/savedItems';
import { getListingById, subscribeActiveListings } from '../services/listingsService';
import type { Listing } from '../types/marketplace';

const FOCUS_RING_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900';

const AVAILABILITY_TABS: { value: SavedAvailabilityFilter; label: string }[] = [
  { value: 'all', label: 'All Saved' },
  { value: 'available', label: 'Available' },
  { value: 'unavailable', label: 'Sold / Unavailable' },
];

const SORT_OPTIONS: { value: SavedSortOption; label: string }[] = [
  { value: 'recently_saved', label: 'Recently Saved' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

function formatSavedDate(date: Date | null): string {
  if (!date) return 'Saved just now';
  return `Saved ${date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

export function SavedItemsPage() {
  const { user, isVerified } = useAuth();
  const {
    savedItems,
    loadingFavorites,
    favoritesError,
    isPending,
    removeSavedItem,
    removeSavedItems,
  } = useSavedItems();

  const [activeListings, setActiveListings] = useState<Listing[]>([]);
  const [loadingActiveListings, setLoadingActiveListings] = useState(true);
  const [listingsError, setListingsError] = useState('');
  const [extraListingsById, setExtraListingsById] = useState<Record<string, Listing | null>>({});
  const [loadingExtras, setLoadingExtras] = useState(false);

  const [queryText, setQueryText] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<SavedAvailabilityFilter>('all');
  const [sortBy, setSortBy] = useState<SavedSortOption>('recently_saved');
  const [clearingUnavailable, setClearingUnavailable] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');

  useEffect(() => {
    if (!user || !isVerified) {
      setActiveListings([]);
      setLoadingActiveListings(false);
      return;
    }

    setLoadingActiveListings(true);
    setListingsError('');

    const unsubscribe = subscribeActiveListings(
      (items) => {
        setActiveListings(items);
        setLoadingActiveListings(false);
      },
      () => {
        setListingsError('Unable to sync live listing prices and availability right now.');
        setLoadingActiveListings(false);
      }
    );

    return () => unsubscribe();
  }, [user, isVerified]);

  const activeListingsById = useMemo(() => {
    const map = new Map<string, Listing>();
    for (const listing of activeListings) {
      map.set(listing.id, listing);
    }
    return map;
  }, [activeListings]);

  const nonActiveSavedIdsKey = useMemo(() => {
    if (loadingActiveListings) return '';
    return savedItems
      .map((fav) => fav.listingId)
      .filter((id) => !activeListingsById.has(id))
      .sort()
      .join(',');
  }, [savedItems, activeListingsById, loadingActiveListings]);

  useEffect(() => {
    if (loadingActiveListings) return;
    const missingIds = nonActiveSavedIdsKey
      ? nonActiveSavedIdsKey.split(',').filter(Boolean)
      : [];

    if (missingIds.length === 0) {
      setLoadingExtras(false);
      return;
    }

    const toFetch = missingIds.filter((id) => !(id in extraListingsById));
    if (toFetch.length === 0) {
      setLoadingExtras(false);
      return;
    }

    let cancelled = false;
    setLoadingExtras(true);

    Promise.all(
      toFetch.map(async (id): Promise<[string, Listing | null]> => {
        try {
          const listing = await getListingById(id);
          return [id, listing];
        } catch {
          return [id, null];
        }
      })
    )
      .then((pairs) => {
        if (cancelled) return;
        setExtraListingsById((prev) => {
          const next = { ...prev };
          for (const [id, listing] of pairs) {
            next[id] = listing;
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingExtras(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [nonActiveSavedIdsKey, loadingActiveListings, extraListingsById]);

  const mergedListingsById = useMemo(() => {
    const map = new Map<string, Listing>(activeListingsById);
    for (const [id, listing] of Object.entries(extraListingsById)) {
      if (!map.has(id) && listing) {
        map.set(id, listing);
      }
    }
    return map;
  }, [activeListingsById, extraListingsById]);

  const resolvedItems = useMemo(
    () => resolveSavedItems(savedItems, mergedListingsById),
    [savedItems, mergedListingsById]
  );

  const summary = useMemo(() => summarizeSavedItems(resolvedItems), [resolvedItems]);

  const filteredItems = useMemo(
    () =>
      filterAndSortSavedItems(resolvedItems, {
        query: queryText,
        availability: availabilityFilter,
        sortBy,
      }),
    [resolvedItems, queryText, availabilityFilter, sortBy]
  );

  const unavailableOnlyIds = useMemo(
    () =>
      resolvedItems
        .filter((item) => item.availability !== 'available')
        .map((item) => item.listingId),
    [resolvedItems]
  );

  const isLoading = loadingFavorites || loadingActiveListings || loadingExtras;

  const handleRemoveOne = async (listingId: string, title: string) => {
    setStatusNotice('');
    const removed = await removeSavedItem(listingId);
    if (removed) {
      setStatusNotice(`Removed "${title}" from your Saved Items.`);
    }
  };

  const handleClearUnavailable = async () => {
    if (unavailableOnlyIds.length === 0) return;
    setClearingUnavailable(true);
    setStatusNotice('');
    const count = unavailableOnlyIds.length;
    try {
      const cleared = await removeSavedItems(unavailableOnlyIds);
      if (cleared) {
        setStatusNotice(
          `Removed ${count} sold or unavailable ${count === 1 ? 'bookmark' : 'bookmarks'}.`
        );
      }
    } finally {
      setClearingUnavailable(false);
    }
  };

  const tabCount = (tab: SavedAvailabilityFilter) => {
    if (tab === 'all') return summary.totalCount;
    if (tab === 'available') return summary.availableCount;
    return summary.reservedOrSoldCount + summary.unavailableCount;
  };

  const hasActiveLocalFilter = queryText.trim() !== '' || availabilityFilter !== 'all';

  return (
    <main
      aria-labelledby="saved-items-heading"
      className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h1
            id="saved-items-heading"
            className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950"
          >
            Saved Items
          </h1>
          <p className="text-xs sm:text-sm text-zinc-700">
            Bookmarked listings synced automatically across your devices ·{' '}
            <span className="tabular-nums">{summary.availableCount} available</span>
            {summary.reservedOrSoldCount + summary.unavailableCount > 0 && (
              <>
                {' '}
                ·{' '}
                <span className="tabular-nums">
                  {summary.reservedOrSoldCount + summary.unavailableCount} sold or unavailable
                </span>
              </>
            )}
          </p>
        </div>

        <Link
          to="/"
          aria-label="Browse all campus marketplace listings"
          className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap shrink-0 w-full sm:w-auto ${FOCUS_RING_CLASS}`}
        >
          <ShoppingBag className="w-4 h-4 shrink-0" aria-hidden="true" />
          Browse Marketplace
        </Link>
      </div>

      {/* Summary KPI Strip */}
      {isLoading ? (
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          aria-label="Loading saved items summary"
        >
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-2 animate-pulse"
            >
              <div className="h-3 w-20 bg-stone-100 rounded" />
              <div className="h-7 w-24 bg-stone-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-1">
            <dt className="text-xs font-semibold text-zinc-700">Total Saved</dt>
            <dd
              aria-label={`Total saved listings: ${summary.totalCount}`}
              className="font-mono text-2xl font-bold text-zinc-950 tabular-nums"
            >
              {summary.totalCount}
            </dd>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-1">
            <dt className="text-xs font-semibold text-zinc-700">Available Now</dt>
            <dd
              aria-label={`Available saved listings: ${summary.availableCount}`}
              className="font-mono text-2xl font-bold text-emerald-950 tabular-nums"
            >
              {summary.availableCount}
            </dd>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-1">
            <dt className="text-xs font-semibold text-zinc-700">Available Total</dt>
            <dd
              aria-label={`Combined value of available saved listings: ${formatGhs(summary.availableTotalPesewas)}`}
              className="font-mono text-2xl font-bold text-zinc-950 tabular-nums"
            >
              {formatGhs(summary.availableTotalPesewas)}
            </dd>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-1">
            <dt className="text-xs font-semibold text-zinc-700">Price Drops</dt>
            <dd
              aria-label={`Saved listings with price drops: ${summary.priceDropCount}`}
              className={`font-mono text-2xl font-bold tabular-nums ${
                summary.priceDropCount > 0 ? 'text-emerald-950' : 'text-zinc-950'
              }`}
            >
              {summary.priceDropCount}
            </dd>
          </div>
        </dl>
      )}

      {/* Alerts & Live Status Announcements */}
      {(favoritesError || listingsError) && (
        <p
          role="alert"
          className="text-sm text-red-900 bg-red-50 border border-red-300 rounded-xl px-4 py-3"
        >
          {favoritesError || listingsError}
        </p>
      )}

      {statusNotice && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-emerald-950 bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-3"
        >
          {statusNotice}
        </p>
      )}

      {/* Filter, Search & Sort Controls */}
      {!isLoading && summary.totalCount > 0 && (
        <section
          aria-label="Filter and sort saved items"
          className="bg-white border border-stone-200 rounded-xl p-4 space-y-3"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Segmented Availability Filter */}
            <div
              role="group"
              aria-label="Filter saved items by availability"
              className="inline-flex items-center p-1 bg-stone-200/80 rounded-lg max-w-full overflow-x-auto"
            >
              {AVAILABILITY_TABS.map((tab) => {
                const active = availabilityFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Filter saved items: ${tab.label} (${tabCount(tab.value)})`}
                    onClick={() => setAvailabilityFilter(tab.value)}
                    className={`min-h-[40px] sm:min-h-[36px] px-3 py-1.5 text-xs sm:text-sm rounded-md transition-colors whitespace-nowrap shrink-0 ${FOCUS_RING_CLASS} ${
                      active
                        ? 'bg-white text-zinc-950 font-semibold shadow-xs'
                        : 'text-zinc-800 hover:text-zinc-950 font-medium'
                    }`}
                  >
                    {tab.label}{' '}
                    <span className="font-mono text-xs text-zinc-600 tabular-nums">
                      ({tabCount(tab.value)})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search + Sort + Cleanup */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 lg:max-w-xl lg:justify-end">
              <div className="relative flex-1 min-w-0">
                <label htmlFor="saved-items-search" className="sr-only">
                  Search saved items
                </label>
                <Search
                  className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="saved-items-search"
                  type="text"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="Search saved items..."
                  aria-label="Search within your saved items"
                  className="w-full min-h-[44px] sm:min-h-[40px] pl-9 pr-10 py-2 text-sm text-zinc-950 placeholder:text-zinc-500 bg-[#FAF9F6] border border-stone-300 rounded-lg focus:bg-white focus:border-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-900/15"
                />
                {queryText && (
                  <button
                    type="button"
                    onClick={() => setQueryText('')}
                    aria-label="Clear saved items search"
                    className={`absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-9 h-9 rounded-md text-zinc-600 hover:text-zinc-950 hover:bg-stone-200/70 ${FOCUS_RING_CLASS}`}
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="relative shrink-0">
                <label htmlFor="saved-items-sort" className="sr-only">
                  Sort saved items
                </label>
                <select
                  id="saved-items-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SavedSortOption)}
                  aria-label="Sort saved items"
                  className={`w-full sm:w-auto appearance-none min-h-[44px] sm:min-h-[40px] pl-3 pr-9 py-2 text-xs sm:text-sm font-medium text-zinc-900 bg-white border border-stone-300 rounded-lg hover:border-stone-400 cursor-pointer whitespace-nowrap ${FOCUS_RING_CLASS}`}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-4 h-4 text-zinc-600 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
              </div>

              {unavailableOnlyIds.length > 0 && (
                <button
                  type="button"
                  disabled={clearingUnavailable}
                  onClick={() => void handleClearUnavailable()}
                  aria-label={`Remove all ${unavailableOnlyIds.length} sold or unavailable bookmarks`}
                  className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[40px] px-3.5 py-2 text-xs font-medium text-red-900 bg-red-50 hover:bg-red-100 border border-red-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 ${FOCUS_RING_CLASS}`}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {clearingUnavailable
                    ? 'Removing...'
                    : `Clear Unavailable (${unavailableOnlyIds.length})`}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Main Saved Items Grid */}
      {isLoading ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          aria-label="Loading saved items"
        >
          {[1, 2, 3].map((n) => (
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
      ) : summary.totalCount === 0 ? (
        <section className="bg-white border border-stone-200 rounded-xl p-8 sm:p-12 text-center space-y-4">
          <Bookmark className="w-8 h-8 text-zinc-600 mx-auto" aria-hidden="true" />
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-zinc-950">No saved items yet</h2>
            <p className="text-sm text-zinc-700 max-w-md mx-auto leading-relaxed">
              Tap the bookmark button on any campus listing to keep track of items you are
              interested in. Your list syncs automatically across your phone and laptop.
            </p>
          </div>
          <Link
            to="/"
            aria-label="Explore campus listings to bookmark items"
            className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
          >
            Explore Listings
          </Link>
        </section>
      ) : filteredItems.length === 0 ? (
        <section className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
          <h2 className="text-base font-semibold text-zinc-950">
            No saved items match your current filter
          </h2>
          <p className="text-sm text-zinc-700">
            Try clearing your search term or switching back to All Saved.
          </p>
          {hasActiveLocalFilter && (
            <button
              type="button"
              onClick={() => {
                setQueryText('');
                setAvailabilityFilter('all');
              }}
              aria-label="Reset saved items filters"
              className={`inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-sm font-medium text-zinc-950 bg-stone-200 hover:bg-stone-300 rounded-lg transition-colors ${FOCUS_RING_CLASS}`}
            >
              Show All Saved Items
            </button>
          )}
        </section>
      ) : (
        <section aria-label="Bookmarked listings" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((entry) => {
            if (entry.availability === 'available' && entry.listing) {
              return (
                <ListingCard
                  key={entry.listingId}
                  listing={entry.listing}
                  isFavorite={true}
                  favoritePending={isPending(entry.listingId)}
                  onToggleFavorite={() => void handleRemoveOne(entry.listingId, entry.displayTitle)}
                  priceDropPesewas={
                    entry.hasPriceDrop && entry.priceDeltaPesewas !== null
                      ? Math.abs(entry.priceDeltaPesewas)
                      : undefined
                  }
                  savedAt={entry.savedAt}
                />
              );
            }

            if (entry.availability === 'reserved_or_sold' && entry.listing) {
              const statusLabel = LISTING_STATUS_LABELS[entry.listing.status];
              return (
                <article
                  key={entry.listingId}
                  className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <Link
                      to={`/listings/${entry.listing.id}`}
                      aria-label={`View ${statusLabel.toLowerCase()} listing ${entry.listing.title}`}
                      className={`block group ${FOCUS_RING_CLASS}`}
                    >
                      <div className="aspect-[4/3] w-full bg-stone-100 overflow-hidden relative">
                        {entry.listing.images[0] ? (
                          <img
                            src={entry.listing.images[0]}
                            alt={entry.listing.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover opacity-70 grayscale-[35%]"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 p-4">
                            <ImageOff className="w-6 h-6 mb-1" aria-hidden="true" />
                            <span className="text-xs">{entry.listing.title}</span>
                          </div>
                        )}
                      </div>

                      <div className="p-4 space-y-1.5">
                        <p className="text-xs font-semibold text-amber-900">
                          {statusLabel} · {CATEGORY_LABEL_MAP[entry.listing.category]}
                        </p>
                        <h2 className="text-base font-semibold text-zinc-950 group-hover:text-emerald-900 line-clamp-1">
                          {entry.listing.title}
                        </h2>
                        <div className="flex items-baseline justify-between gap-2 pt-0.5">
                          <span className="font-mono text-sm font-semibold text-zinc-700 tabular-nums">
                            {formatGhs(entry.listing.pricePesewas)}
                          </span>
                          <span className="text-xs text-zinc-600 truncate">
                            {formatSavedDate(entry.savedAt)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </div>

                  <div className="px-4 pb-4 pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                    <Link
                      to={`/listings/${entry.listing.id}`}
                      aria-label={`Inspect ${entry.listing.title}`}
                      className={`text-xs font-semibold text-emerald-950 hover:underline rounded py-1 ${FOCUS_RING_CLASS}`}
                    >
                      View Listing
                    </Link>
                    <button
                      type="button"
                      disabled={isPending(entry.listingId)}
                      onClick={() => void handleRemoveOne(entry.listingId, entry.displayTitle)}
                      aria-label={`Remove ${entry.displayTitle} from Saved Items`}
                      className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium text-zinc-800 hover:text-red-900 hover:bg-red-50 border border-stone-300 rounded-lg disabled:opacity-50 transition-colors ${FOCUS_RING_CLASS}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </article>
              );
            }

            // Removed / Unavailable Listing
            return (
              <article
                key={entry.listingId}
                className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[4/3] w-full bg-stone-100 flex flex-col items-center justify-center text-zinc-600 p-6 text-center space-y-1.5">
                    <BookmarkX className="w-7 h-7 text-zinc-500" aria-hidden="true" />
                    <span className="text-xs font-medium text-zinc-700">
                      Listing no longer available
                    </span>
                  </div>
                  <div className="p-4 space-y-1.5">
                    <p className="text-xs font-medium text-zinc-600">
                      Removed by seller
                      {entry.displayCategory ? ` · ${CATEGORY_LABEL_MAP[entry.displayCategory]}` : ''}
                    </p>
                    <h2 className="text-base font-semibold text-zinc-900 line-clamp-1">
                      {entry.displayTitle}
                    </h2>
                    <div className="flex items-baseline justify-between gap-2 pt-0.5">
                      <span className="font-mono text-sm font-medium text-zinc-600 tabular-nums">
                        {entry.displayPricePesewas !== null
                          ? formatGhs(entry.displayPricePesewas)
                          : 'Price unavailable'}
                      </span>
                      <span className="text-xs text-zinc-600 truncate">
                        {formatSavedDate(entry.savedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 pt-2 border-t border-stone-100 flex items-center justify-end">
                  <button
                    type="button"
                    disabled={isPending(entry.listingId)}
                    onClick={() => void handleRemoveOne(entry.listingId, entry.displayTitle)}
                    aria-label={`Remove unavailable bookmark ${entry.displayTitle}`}
                    className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-red-900 bg-red-50 hover:bg-red-100 border border-red-300 rounded-lg disabled:opacity-50 transition-colors ${FOCUS_RING_CLASS}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Remove Bookmark
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
