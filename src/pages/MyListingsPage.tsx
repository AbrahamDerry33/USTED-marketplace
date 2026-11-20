import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Edit3, ImageOff, Plus, QrCode, Trash2 } from 'lucide-react';
import { SellerDashboard } from '../components/SellerDashboard';
import {
  CATEGORY_LABEL_MAP,
  LISTING_STATUS_LABELS,
} from '../config/marketplace';
import { useAuth } from '../context/AuthContext';
import { formatGhs } from '../lib/money';
import { subscribeMyListings, updateListingStatus } from '../services/listingsService';
import { subscribeSellerOrders } from '../services/ordersService';
import type { Listing, ListingStatus, Order } from '../types/marketplace';

export function MyListingsPage() {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [sellerOrders, setSellerOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [error, setError] = useState('');
  const [ordersError, setOrdersError] = useState('');
  const [statusFilter, setStatusFilter] = useState<ListingStatus | 'all'>('all');
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setOrdersLoading(true);
    setError('');
    setOrdersError('');

    const unsubscribeListings = subscribeMyListings(
      user.uid,
      (items) => {
        setListings(items);
        setLoading(false);
      },
      () => {
        setError('Unable to load your listings right now.');
        setLoading(false);
      }
    );

    const unsubscribeOrders = subscribeSellerOrders(
      user.uid,
      (orders) => {
        setSellerOrders(orders);
        setOrdersLoading(false);
      },
      () => {
        setOrdersError('Unable to load your weekly sales performance right now.');
        setOrdersLoading(false);
      }
    );

    return () => {
      unsubscribeListings();
      unsubscribeOrders();
    };
  }, [user]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return listings;
    return listings.filter((l) => l.status === statusFilter);
  }, [listings, statusFilter]);

  const handleStatusChange = async (listingId: string, nextStatus: ListingStatus) => {
    setBusyId(listingId);
    setError('');
    try {
      await updateListingStatus(listingId, nextStatus);
      setPendingRemoveId(null);
    } catch {
      setError('Failed to update listing status.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Seller Dashboard</h1>
          <p className="text-sm text-zinc-600">
            Track weekly sales performance, manage posted items, and update availability.
          </p>
        </div>

        <Link
          to="/sell"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New Listing
        </Link>
      </div>

      {/* Weekly Sales vs. Orders Analytics */}
      <SellerDashboard
        orders={sellerOrders}
        loading={ordersLoading}
        error={ordersError}
      />

      {/* Listings Management Section */}
      <section aria-labelledby="my-listings-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-0.5">
            <h2 id="my-listings-heading" className="text-lg font-semibold text-zinc-900">
              My Listings
            </h2>
            <p className="text-xs text-zinc-500 tabular-nums">
              {listings.length} total {listings.length === 1 ? 'listing' : 'listings'}
            </p>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist">
            {(['all', 'active', 'reserved', 'sold', 'removed'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                  statusFilter === tab
                    ? 'bg-emerald-900 text-white'
                    : 'bg-stone-200/70 text-zinc-700 hover:bg-stone-300/70'
                }`}
              >
                {tab === 'all' ? 'All' : LISTING_STATUS_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3" role="alert">
            {error}
          </p>
        )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 bg-white border border-stone-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
          <h2 className="text-base font-semibold text-zinc-900">No listings in this view</h2>
          <p className="text-sm text-zinc-600">
            {statusFilter === 'all'
              ? 'Post an item you no longer need and connect with buyers on campus.'
              : `You do not have any ${LISTING_STATUS_LABELS[statusFilter].toLowerCase()} listings.`}
          </p>
          <Link
            to="/sell"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Post a Listing
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-4 min-w-0">
                <Link
                  to={`/listings/${item.id}`}
                  className="w-20 h-16 rounded-lg overflow-hidden bg-stone-100 border border-stone-200 shrink-0 flex items-center justify-center"
                >
                  {item.images[0] ? (
                    <img
                      src={item.images[0]}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageOff className="w-5 h-5 text-zinc-400" aria-hidden="true" />
                  )}
                </Link>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <span className="font-medium text-zinc-800">
                      {LISTING_STATUS_LABELS[item.status]}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{CATEGORY_LABEL_MAP[item.category]}</span>
                  </div>
                  <Link
                    to={`/listings/${item.id}`}
                    className="block text-base font-semibold text-zinc-900 hover:text-emerald-900 truncate"
                  >
                    {item.title}
                  </Link>
                  <p className="font-mono text-sm font-semibold text-emerald-900 tabular-nums">
                    {formatGhs(item.pricePesewas)}
                  </p>
                </div>
              </div>

              {item.status !== 'removed' && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {item.status === 'active' && (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleStatusChange(item.id, 'sold')}
                      className="px-3 py-1.5 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                    >
                      Mark Sold
                    </button>
                  )}
                  {item.status !== 'active' && (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleStatusChange(item.id, 'active')}
                      className="px-3 py-1.5 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                    >
                      Reactivate
                    </button>
                  )}
                  <Link
                    to={`/listings/${item.id}/flyer`}
                    aria-label={`Print QR code flyer for ${item.title}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/20 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
                  >
                    <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                    QR Flyer
                  </Link>
                  <Link
                    to={`/listings/${item.id}/edit`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    Edit
                  </Link>
                  {pendingRemoveId === item.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void handleStatusChange(item.id, 'removed')}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingRemoveId(null)}
                        className="px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingRemoveId(item.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      </section>
    </main>
  );
}
