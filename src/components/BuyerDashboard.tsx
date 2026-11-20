import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bookmark,
  BookmarkX,
  ImageOff,
  MessageSquare,
  Receipt,
  ShoppingBag,
  Star,
  Trash2,
} from 'lucide-react';
import { CATEGORY_LABEL_MAP, LISTING_STATUS_LABELS } from '../config/marketplace';
import {
  filterBuyerOrders,
  ORDER_STATUS_META,
  summarizeBuyerDashboard,
  type BuyerOrderFilter,
} from '../lib/dashboardSummary';
import {
  ORDER_PAYMENT_STATUS_META,
  resolveNormalizedPaymentStatus,
} from '../lib/localPayments';
import { formatGhs } from '../lib/money';
import { resolveSavedItems } from '../lib/savedItems';
import { removeFavorite } from '../services/favoritesService';
import { getListingById } from '../services/listingsService';
import type { FavoriteItem, Listing, Order } from '../types/marketplace';

interface BuyerDashboardProps {
  userId: string;
  orders: Order[];
  favorites: FavoriteItem[];
  ordersLoading: boolean;
  favoritesLoading: boolean;
  ordersError?: string;
  favoritesError?: string;
}

const ORDER_FILTER_TABS: { value: BuyerOrderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Cancelled / Issues' },
];

const FOCUS_RING_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900';

function formatOrderDate(date: Date | null): string {
  if (!date) return 'Just now';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function BuyerDashboard({
  userId,
  orders,
  favorites,
  ordersLoading,
  favoritesLoading,
  ordersError = '',
  favoritesError = '',
}: BuyerDashboardProps) {
  const [orderFilter, setOrderFilter] = useState<BuyerOrderFilter>('all');
  const [savedListingsById, setSavedListingsById] = useState<Map<string, Listing>>(
    () => new Map()
  );
  const [savedListingsLoading, setSavedListingsLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState('');

  const summary = useMemo(
    () => summarizeBuyerDashboard(orders, favorites),
    [orders, favorites]
  );

  const filteredOrders = useMemo(
    () => filterBuyerOrders(orders, orderFilter),
    [orders, orderFilter]
  );

  const topFavorites = useMemo(() => favorites.slice(0, 6), [favorites]);

  const topFavoriteIdsKey = useMemo(
    () => topFavorites.map((fav) => fav.listingId).join(','),
    [topFavorites]
  );

  useEffect(() => {
    const ids = topFavoriteIdsKey ? topFavoriteIdsKey.split(',').filter(Boolean) : [];
    if (ids.length === 0) {
      setSavedListingsById(new Map());
      setSavedListingsLoading(false);
      return;
    }

    let cancelled = false;
    setSavedListingsLoading(true);

    Promise.all(ids.map((id) => getListingById(id).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        const map = new Map<string, Listing>();
        for (const item of results) {
          if (item) {
            map.set(item.id, item);
          }
        }
        setSavedListingsById(map);
      })
      .finally(() => {
        if (!cancelled) {
          setSavedListingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [topFavoriteIdsKey]);

  const resolvedTopSaved = useMemo(
    () => resolveSavedItems(topFavorites, savedListingsById),
    [topFavorites, savedListingsById]
  );

  const handleRemoveSaved = async (listingId: string) => {
    setRemovingId(listingId);
    setRemoveError('');
    try {
      await removeFavorite(userId, listingId);
    } catch {
      setRemoveError('Could not remove that saved item right now.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Buyer Summary KPI Cards */}
      <section aria-label="Buyer summary metrics">
        {ordersLoading ? (
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"
            aria-label="Loading buyer summary metrics"
          >
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-2.5 animate-pulse"
              >
                <div className="h-3.5 w-24 bg-stone-100 rounded" />
                <div className="h-7 w-28 bg-stone-100 rounded" />
                <div className="h-3 w-36 bg-stone-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-1">
              <dt className="text-xs font-semibold text-zinc-700">Active Orders</dt>
              <dd
                aria-label={`Active orders: ${summary.activeOrdersCount}`}
                className="font-mono text-2xl font-bold text-zinc-950 tabular-nums"
              >
                {summary.activeOrdersCount}
              </dd>
              <p className="text-xs text-zinc-600 tabular-nums">
                {summary.awaitingConfirmationCount > 0
                  ? `${summary.awaitingConfirmationCount} shipped and ready to confirm`
                  : 'Pending payment, paid, or in transit'}
              </p>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-1">
              <dt className="text-xs font-semibold text-zinc-700">Completed Purchases</dt>
              <dd
                aria-label={`Completed purchases: ${summary.completedOrdersCount}`}
                className="font-mono text-2xl font-bold text-emerald-950 tabular-nums"
              >
                {summary.completedOrdersCount}
              </dd>
              <p className="text-xs text-zinc-600 tabular-nums">
                {orders.length} total {orders.length === 1 ? 'order' : 'orders'} placed
              </p>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-1">
              <dt className="text-xs font-semibold text-zinc-700">Total GHS Spent</dt>
              <dd
                aria-label={`Total GHS spent: ${formatGhs(summary.totalSpentPesewas)}`}
                className="font-mono text-2xl font-bold text-zinc-950 tabular-nums"
              >
                {formatGhs(summary.totalSpentPesewas)}
              </dd>
              <p className="text-xs text-zinc-600 font-mono tabular-nums">
                {summary.totalSpentPesewas.toLocaleString('en-US')} pesewas confirmed
              </p>
            </div>
          </dl>
        )}
      </section>

      {/* Buyer Orders List */}
      <section
        aria-labelledby="buyer-orders-heading"
        className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <h2
              id="buyer-orders-heading"
              className="text-base sm:text-lg font-semibold tracking-tight text-zinc-900"
            >
              Your Orders
            </h2>
            <p className="text-xs text-zinc-600 tabular-nums">
              {filteredOrders.length} shown · {orders.length} total{' '}
              {orders.length === 1 ? 'order' : 'orders'}
            </p>
          </div>

          <Link
            to="/orders"
            aria-label="Manage all payments and receipts on Orders page"
            className={`inline-flex items-center gap-1 min-h-[44px] sm:min-h-0 px-1 text-xs font-semibold text-emerald-950 hover:underline underline-offset-4 whitespace-nowrap shrink-0 self-start sm:self-auto rounded ${FOCUS_RING_CLASS}`}
          >
            Manage Payments & Receipts
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        {/* Interactive Order Filter Tabs */}
        {!ordersLoading && orders.length > 0 && (
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
            role="group"
            aria-label="Filter buyer orders by status"
          >
            {ORDER_FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-label={`Filter buyer orders by ${tab.label}`}
                aria-pressed={orderFilter === tab.value}
                onClick={() => setOrderFilter(tab.value)}
                className={`min-h-[40px] sm:min-h-0 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${FOCUS_RING_CLASS} ${
                  orderFilter === tab.value
                    ? 'bg-emerald-900 text-white'
                    : 'bg-stone-100 text-zinc-800 hover:bg-stone-200 border border-stone-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {ordersError && (
          <p
            className="text-sm text-red-900 bg-red-50 border border-red-300 rounded-lg px-4 py-3"
            role="alert"
          >
            {ordersError}
          </p>
        )}

        {ordersLoading ? (
          <div className="space-y-3" aria-label="Loading buyer orders">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-24 bg-stone-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-[#FAF9F6] border border-stone-200 rounded-lg p-5 sm:p-6 text-center space-y-3">
            <ShoppingBag className="w-6 h-6 text-zinc-600 mx-auto" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-900">No purchases yet</h3>
              <p className="text-xs sm:text-sm text-zinc-700 max-w-md mx-auto">
                Browse verified listings on campus and track your Paystack, MoMo, or meetup orders
                here.
              </p>
            </div>
            <Link
              to="/"
              aria-label="Browse campus marketplace listings"
              className={`inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
            >
              Browse Marketplace
            </Link>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-[#FAF9F6] border border-stone-200 rounded-lg p-5 text-center space-y-2.5">
            <p className="text-xs sm:text-sm text-zinc-700">
              No orders match this status filter.
            </p>
            <button
              type="button"
              aria-label="Reset order status filter and show all orders"
              onClick={() => setOrderFilter('all')}
              className={`inline-flex items-center justify-center min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-zinc-900 bg-stone-200 hover:bg-stone-300 rounded-lg transition-colors ${FOCUS_RING_CLASS}`}
            >
              Show All Orders
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-200 border-t border-stone-200">
            {filteredOrders.map((order) => {
              const statusMeta = ORDER_STATUS_META[order.status];
              const paymentStatus = resolveNormalizedPaymentStatus(order);
              const paymentMeta = ORDER_PAYMENT_STATUS_META[paymentStatus];
              const isLocalOrder =
                order.paymentMethod === 'pay_on_meetup' ||
                order.paymentMethod === 'momo_prepayment';
              const isOpenOrder =
                order.status !== 'completed' &&
                order.status !== 'cancelled' &&
                order.status !== 'disputed' &&
                order.status !== 'refunded';

              const showHandoverLink =
                isOpenOrder &&
                isLocalOrder &&
                (paymentStatus === 'pay_on_meetup' || paymentStatus === 'verified');

              const primaryActionLabel =
                order.status === 'pending_payment' && paymentStatus === 'unpaid'
                  ? order.paymentMethod === 'momo_prepayment'
                    ? 'Submit MoMo Proof'
                    : 'Upload Receipt'
                  : showHandoverLink
                    ? 'Handover PIN & QR'
                    : order.status === 'shipped' && !isLocalOrder
                      ? 'Confirm Receipt'
                      : 'Order Details';

              const primaryActionHref = showHandoverLink
                ? `/orders/${order.id}#campus-handover`
                : `/orders/${order.id}`;

              return (
                <article
                  key={order.id}
                  className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        data-order-status={order.status}
                        aria-label={`Order status: ${statusMeta.label}`}
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>
                      <span
                        aria-label={`Payment status: ${paymentMeta.label}`}
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap ${paymentMeta.badgeClass}`}
                      >
                        {paymentMeta.shortLabel}
                      </span>
                      <span className="text-zinc-600 tabular-nums">
                        {formatOrderDate(order.createdAt)}
                      </span>
                      <span aria-hidden="true" className="text-zinc-500">
                        ·
                      </span>
                      <span className="font-mono text-zinc-600 truncate max-w-[165px] sm:max-w-xs">
                        {order.transactionId || order.manualReference || order.paystackReference}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Link
                        to={`/orders/${order.id}`}
                        aria-label={`View order details for ${order.listingTitle}`}
                        className={`text-sm sm:text-base font-semibold text-zinc-950 hover:text-emerald-900 truncate max-w-full rounded ${FOCUS_RING_CLASS}`}
                      >
                        {order.listingTitle}
                      </Link>
                      <span className="font-mono text-sm font-semibold text-zinc-950 tabular-nums whitespace-nowrap">
                        {formatGhs(order.amountPesewas)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0">
                    <Link
                      to={primaryActionHref}
                      aria-label={`${primaryActionLabel} for ${order.listingTitle}`}
                      className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 sm:px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                    >
                      <Receipt className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{primaryActionLabel}</span>
                    </Link>

                    {order.status === 'completed' && (
                      <Link
                        to={`/listings/${order.listingId}?review=write#listing-reviews`}
                        aria-label={`Rate and review completed purchase ${order.listingTitle}`}
                        className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 sm:px-3.5 py-2 text-xs font-semibold text-zinc-900 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                      >
                        <Star className="w-3.5 h-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                        <span>Rate &amp; Review</span>
                      </Link>
                    )}

                    <Link
                      to={`/listings/${order.listingId}#listing-chat`}
                      aria-label={`Open seller chat for ${order.listingTitle}`}
                      className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 sm:px-3.5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-700/40 rounded-lg transition-colors whitespace-nowrap ${
                        order.status === 'completed' ? 'col-span-2 sm:col-span-1' : ''
                      } ${FOCUS_RING_CLASS}`}
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Seller Chat</span>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Saved Items Section */}
      <section
        aria-labelledby="buyer-saved-items-heading"
        className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <h2
              id="buyer-saved-items-heading"
              className="text-base font-semibold text-zinc-900"
            >
              Saved Items
            </h2>
            <p className="text-xs text-zinc-600 tabular-nums">
              {favorites.length} bookmarked {favorites.length === 1 ? 'item' : 'items'} · synced
              across devices
            </p>
          </div>
          <Link
            to="/saved"
            aria-label="Open full Saved Items page"
            className={`inline-flex items-center gap-1 min-h-[44px] sm:min-h-0 px-2 text-xs font-semibold text-emerald-950 hover:underline underline-offset-4 whitespace-nowrap shrink-0 rounded ${FOCUS_RING_CLASS}`}
          >
            View All Saved
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        {(favoritesError || removeError) && (
          <p
            className="text-sm text-red-900 bg-red-50 border border-red-300 rounded-lg px-4 py-3"
            role="alert"
          >
            {favoritesError || removeError}
          </p>
        )}

        {favoritesLoading || savedListingsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Loading saved items">
            {[1, 2].map((n) => (
              <div key={n} className="h-20 bg-stone-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : resolvedTopSaved.length === 0 ? (
          <div className="bg-[#FAF9F6] border border-stone-200 rounded-lg p-5 sm:p-6 text-center space-y-3">
            <Bookmark className="w-6 h-6 text-zinc-600 mx-auto" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-900">No saved items yet</h3>
              <p className="text-xs sm:text-sm text-zinc-700 max-w-md mx-auto">
                Tap the bookmark button on any campus listing to save it here and access it from any
                device.
              </p>
            </div>
            <Link
              to="/"
              aria-label="Explore campus marketplace listings"
              className={`inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-zinc-900 bg-stone-200 hover:bg-stone-300 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
            >
              Explore Listings
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-stone-200 pt-4">
            {resolvedTopSaved.map((entry) => {
              const item = entry.listing;
              return (
                <article
                  key={entry.listingId}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#FAF9F6] border border-stone-200 min-w-0"
                >
                  {item ? (
                    <Link
                      to={`/listings/${item.id}`}
                      aria-label={`View saved listing ${item.title}, priced at ${formatGhs(item.pricePesewas)}`}
                      className={`flex items-center gap-3 min-w-0 flex-1 group rounded-lg ${FOCUS_RING_CLASS}`}
                    >
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-stone-100 border border-stone-200 shrink-0 flex items-center justify-center">
                        {item.images[0] ? (
                          <img
                            src={item.images[0]}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageOff className="w-4 h-4 text-zinc-600" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-[11px] text-zinc-600 truncate">
                          {CATEGORY_LABEL_MAP[item.category]}
                          {item.status !== 'active'
                            ? ` · ${LISTING_STATUS_LABELS[item.status]}`
                            : ''}
                        </p>
                        <p className="text-sm font-semibold text-zinc-950 group-hover:text-emerald-900 truncate">
                          {item.title}
                        </p>
                        <p className="font-mono text-xs font-semibold text-emerald-950 tabular-nums">
                          {formatGhs(item.pricePesewas)}
                        </p>
                      </div>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-14 h-14 rounded-lg bg-stone-100 border border-stone-200 shrink-0 flex items-center justify-center">
                        <BookmarkX className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-[11px] text-zinc-600 truncate">Removed by seller</p>
                        <p className="text-sm font-semibold text-zinc-800 truncate">
                          {entry.displayTitle}
                        </p>
                        {entry.displayPricePesewas !== null && (
                          <p className="font-mono text-xs text-zinc-600 tabular-nums">
                            {formatGhs(entry.displayPricePesewas)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={removingId === entry.listingId}
                    onClick={() => void handleRemoveSaved(entry.listingId)}
                    aria-label={`Remove ${entry.displayTitle} from saved items`}
                    className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-zinc-700 hover:text-red-800 hover:bg-red-50 disabled:opacity-50 transition-colors shrink-0 ${FOCUS_RING_CLASS}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
