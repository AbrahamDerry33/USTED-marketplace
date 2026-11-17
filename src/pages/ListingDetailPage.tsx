import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit3, ImageOff, Trash2 } from 'lucide-react';
import {
  CATEGORY_LABEL_MAP,
  CONDITION_LABEL_MAP,
  LISTING_STATUS_LABELS,
} from '../config/marketplace';
import { useAuth } from '../context/AuthContext';
import { formatGhs } from '../lib/money';
import { getListingById, updateListingStatus } from '../services/listingsService';
import type { Listing, ListingStatus } from '../types/marketplace';

export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    getListingById(id)
      .then((item) => {
        if (cancelled) return;
        setListing(item);
        setActiveImageIdx(0);
        setImgFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Unable to load this listing.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const isOwner = Boolean(user && listing && user.uid === listing.sellerId);

  const handleStatusChange = async (nextStatus: ListingStatus) => {
    if (!listing) return;
    setUpdatingStatus(true);
    setError('');
    try {
      await updateListingStatus(listing.id, nextStatus);
      setListing({ ...listing, status: nextStatus, updatedAt: new Date() });
      setConfirmRemove(false);
      if (nextStatus === 'removed') {
        navigate('/my-listings');
      }
    } catch {
      setError('Could not update listing status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-pulse">
          <div className="lg:col-span-7 aspect-[4/3] bg-stone-200 rounded-xl" />
          <div className="lg:col-span-5 space-y-4">
            <div className="h-4 w-1/3 bg-stone-200 rounded" />
            <div className="h-8 w-3/4 bg-stone-200 rounded" />
            <div className="h-6 w-1/4 bg-stone-200 rounded" />
            <div className="h-24 w-full bg-stone-200 rounded" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !listing) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-zinc-900">Listing unavailable</h1>
          <p className="text-sm text-zinc-600">
            {error || 'This item may have been removed or is no longer available.'}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to Browse
          </Link>
        </div>
      </main>
    );
  }

  const activeImageUrl = listing.images[activeImageIdx] || listing.images[0];

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to listings
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Image Gallery */}
        <section className="lg:col-span-7 space-y-3">
          <div className="aspect-[4/3] w-full bg-stone-100 border border-stone-200 rounded-xl overflow-hidden">
            {activeImageUrl && !imgFailed ? (
              <img
                src={activeImageUrl}
                alt={`${listing.title} photo ${activeImageIdx + 1}`}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 p-6">
                <ImageOff className="w-8 h-8 mb-2" aria-hidden="true" />
                <span className="text-sm">Image unavailable</span>
              </div>
            )}
          </div>

          {listing.images.length > 1 && (
            <div className="grid grid-cols-5 gap-2.5">
              {listing.images.map((url, idx) => (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  onClick={() => {
                    setActiveImageIdx(idx);
                    setImgFailed(false);
                  }}
                  aria-label={`View photo ${idx + 1}`}
                  className={`aspect-[4/3] rounded-lg overflow-hidden border transition-colors ${
                    idx === activeImageIdx
                      ? 'border-emerald-900 ring-2 ring-emerald-900/20'
                      : 'border-stone-200 hover:border-stone-400'
                  }`}
                >
                  <img
                    src={url}
                    alt={`Thumbnail ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Right: Contiguous Purchase / Owner Module */}
        <section className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-6 space-y-5 lg:sticky lg:top-20">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span>{CATEGORY_LABEL_MAP[listing.category]}</span>
              <span aria-hidden="true">·</span>
              <span>{CONDITION_LABEL_MAP[listing.condition]}</span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-zinc-700">
                {LISTING_STATUS_LABELS[listing.status]}
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 text-balance">
              {listing.title}
            </h1>

            <p className="font-mono text-2xl font-semibold text-emerald-900 tabular-nums">
              {formatGhs(listing.pricePesewas)}
            </p>
          </div>

          <div className="border-t border-stone-200 pt-4 space-y-2">
            <h2 className="text-xs font-medium text-zinc-500">Seller</h2>
            <p className="text-sm font-medium text-zinc-900">{listing.sellerName}</p>
          </div>

          <div className="border-t border-stone-200 pt-4 space-y-2">
            <h2 className="text-xs font-medium text-zinc-500">Description</h2>
            <p className="text-sm text-zinc-700 whitespace-pre-line leading-relaxed">
              {listing.description}
            </p>
          </div>

          {isOwner ? (
            <div className="border-t border-stone-200 pt-4 space-y-3">
              {listing.status !== 'removed' && (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to={`/listings/${listing.id}/edit`}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors"
                  >
                    <Edit3 className="w-4 h-4" aria-hidden="true" />
                    Edit Listing
                  </Link>
                  <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={() => setConfirmRemove(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              )}

              {listing.status !== 'removed' && (
                <div className="flex flex-wrap gap-2">
                  {listing.status !== 'active' && (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => void handleStatusChange('active')}
                      className="px-3 py-1.5 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                    >
                      Mark Active
                    </button>
                  )}
                  {listing.status !== 'reserved' && (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => void handleStatusChange('reserved')}
                      className="px-3 py-1.5 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                    >
                      Mark Reserved
                    </button>
                  )}
                  {listing.status !== 'sold' && (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => void handleStatusChange('sold')}
                      className="px-3 py-1.5 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                    >
                      Mark Sold
                    </button>
                  )}
                </div>
              )}

              {confirmRemove && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2.5">
                  <p className="text-xs text-red-900 font-medium">
                    Remove this listing permanently? Removed listings cannot be reactivated.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => void handleStatusChange('removed')}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-md transition-colors"
                    >
                      {updatingStatus ? 'Removing...' : 'Confirm Remove'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(false)}
                      className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-stone-300 rounded-md hover:bg-stone-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="border-t border-stone-200 pt-4 space-y-2">
              <p className="text-xs text-zinc-500 leading-relaxed">
                Direct buyer-seller chat (Step 4) and Paystack checkout (Step 5) will connect here
                next.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
