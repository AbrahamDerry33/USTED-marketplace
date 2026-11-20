import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  CreditCard,
  Edit3,
  ExternalLink,
  ImageOff,
  MapPin,
  MessageSquare,
  QrCode,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
} from 'lucide-react';
import { CategoryPriceTrendCard } from '../components/CategoryPriceTrendCard';
import { ListingChatCard } from '../components/ListingChatCard';
import { ListingReviewsCard } from '../components/ListingReviewsCard';
import { SellerProfileCard } from '../components/SellerProfileCard';
import { VerifiedStudentBadge } from '../components/VerifiedStudentBadge';
import {
  CATEGORY_LABEL_MAP,
  CONDITION_LABEL_MAP,
  LISTING_STATUS_LABELS,
} from '../config/marketplace';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../hooks/useFavorites';
import {
  formatGhanaPhoneDisplay,
  LOCAL_PAYMENT_METHOD_OPTIONS,
  MOMO_NETWORK_LABEL_MAP,
} from '../lib/localPayments';
import { formatGhs } from '../lib/money';
import { resolveBuyerReviewEligibility, summarizeSellerReviews } from '../lib/reviews';
import { getListingById, updateListingStatus } from '../services/listingsService';
import {
  createLocalOrder,
  createOrder,
  subscribeBuyerOrdersForReview,
  type CreateOrderResult,
} from '../services/ordersService';
import { subscribeSellerReviews } from '../services/reviewsService';
import { getUserPublicProfile } from '../services/usersService';
import type {
  Listing,
  ListingStatus,
  LocalPaymentMethod,
  Order,
  SellerReview,
  UserPublicProfile,
} from '../types/marketplace';

export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile, isVerified } = useAuth();
  const {
    favoritesError,
    isFavorite,
    isPending: isFavoritePending,
    toggleFavorite,
  } = useFavorites();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [creatingLocalOrder, setCreatingLocalOrder] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<LocalPaymentMethod>('pay_on_meetup');
  const [sellerProfile, setSellerProfile] = useState<UserPublicProfile | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutSession, setCheckoutSession] = useState<CreateOrderResult | null>(null);

  const [sellerReviews, setSellerReviews] = useState<SellerReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState('');
  const [buyerOrders, setBuyerOrders] = useState<Order[]>([]);
  const [buyerOrdersLoading, setBuyerOrdersLoading] = useState(true);
  const [openReviewComposerSignal, setOpenReviewComposerSignal] = useState(false);

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

  useEffect(() => {
    if (loading || !listing || !location.hash) return;
    const targetId = location.hash.replace(/^#/, '');
    if (!targetId) return;
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    targetEl.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [loading, listing, location.hash]);

  const isOwner = Boolean(user && listing && user.uid === listing.sellerId);

  useEffect(() => {
    if (!listing || !user || !isVerified) {
      setSellerReviews([]);
      setReviewsLoading(false);
      setReviewsError('');
      return;
    }

    setReviewsLoading(true);
    setReviewsError('');

    const unsubscribe = subscribeSellerReviews(
      listing.sellerId,
      (items) => {
        setSellerReviews(items);
        setReviewsLoading(false);
        setReviewsError('');
      },
      () => {
        setReviewsLoading(false);
        setReviewsError('Unable to load verified buyer reviews right now.');
      }
    );

    return () => unsubscribe();
  }, [listing?.sellerId, user, isVerified]);

  useEffect(() => {
    if (!listing || !user || !isVerified || isOwner) {
      setBuyerOrders([]);
      setBuyerOrdersLoading(false);
      return;
    }

    setBuyerOrdersLoading(true);

    const unsubscribe = subscribeBuyerOrdersForReview(
      user.uid,
      (orders) => {
        setBuyerOrders(orders);
        setBuyerOrdersLoading(false);
      },
      () => {
        setBuyerOrders([]);
        setBuyerOrdersLoading(false);
      }
    );

    return () => unsubscribe();
  }, [listing?.id, user, isVerified, isOwner]);

  useEffect(() => {
    if (!listing || !user || !isVerified || isOwner) {
      setSellerProfile(null);
      return;
    }
    let cancelled = false;
    getUserPublicProfile(listing.sellerId)
      .then((prof) => {
        if (!cancelled) setSellerProfile(prof);
      })
      .catch(() => {
        if (!cancelled) setSellerProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listing?.sellerId, user, isVerified, isOwner]);

  const ratingSummary = useMemo(
    () => summarizeSellerReviews(sellerReviews),
    [sellerReviews]
  );

  const reviewEligibility = useMemo(
    () =>
      listing
        ? resolveBuyerReviewEligibility({
            orders: buyerOrders,
            buyerId: user?.uid ?? null,
            sellerId: listing.sellerId,
            listingId: listing.id,
            isBanned: profile?.banned ?? false,
          })
        : {
            status: 'no_completed_order' as const,
            canSubmit: false,
            completedOrder: null,
            activeOrder: null,
            completedForCurrentListing: false,
          },
    [buyerOrders, user?.uid, listing, profile?.banned]
  );

  const existingBuyerReview = useMemo(
    () => (user ? sellerReviews.find((review) => review.reviewerId === user.uid) ?? null : null),
    [sellerReviews, user]
  );

  const wantsAutoOpenReview =
    searchParams.get('review') === 'write' || openReviewComposerSignal;

  const handleComposerAutoOpened = useCallback(() => {
    setOpenReviewComposerSignal(false);
    if (searchParams.get('review') === 'write') {
      const next = new URLSearchParams(searchParams);
      next.delete('review');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const jumpToReviewComposer = () => {
    setOpenReviewComposerSignal(true);
    const targetEl = document.getElementById('listing-reviews');
    if (targetEl) {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      targetEl.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  };

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

  const handlePlaceLocalOrder = async () => {
    if (!listing) return;
    if (!user || !isVerified) {
      navigate('/auth');
      return;
    }
    setCreatingLocalOrder(true);
    setCheckoutError('');
    try {
      const result = await createLocalOrder({
        listing,
        buyerId: user.uid,
        paymentMethod: selectedPaymentMethod,
      });
      navigate(`/orders/${result.orderId}`);
    } catch (err) {
      setCheckoutError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Unable to create your order right now. Please try again.'
      );
    } finally {
      setCreatingLocalOrder(false);
    }
  };

  const handleBuyNow = async () => {
    if (!listing) return;
    if (!user || !isVerified) {
      navigate('/auth');
      return;
    }
    setCreatingOrder(true);
    setCheckoutError('');
    try {
      const callbackUrl = `${window.location.origin}/orders`;
      const result = await createOrder(listing.id, callbackUrl);
      setCheckoutSession(result);
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Unable to start Paystack checkout right now.'
      );
    } finally {
      setCreatingOrder(false);
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
        <section className="lg:col-span-7 order-1 space-y-3">
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
        <section className="lg:col-span-5 lg:row-span-5 order-2 bg-white border border-stone-200 rounded-xl p-6 space-y-5 lg:sticky lg:top-20">
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

          <div className="border-t border-stone-200 pt-4 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="text-zinc-600">
                  Sold by <span className="font-medium text-zinc-900">{listing.sellerName}</span>
                </span>
                {(listing.sellerVerifiedStudent || sellerProfile?.verifiedStudent) && (
                  <VerifiedStudentBadge size="xs" />
                )}
                {!reviewsLoading &&
                  ratingSummary.totalCount > 0 &&
                  ratingSummary.averageRating !== null && (
                    <>
                      <span className="text-zinc-300" aria-hidden="true">
                        ·
                      </span>
                      <a
                        href="#listing-reviews"
                        aria-label={`Seller rating ${ratingSummary.averageRating.toFixed(1)} out of 5 from ${ratingSummary.totalCount} reviews`}
                        className="inline-flex items-center gap-1 text-zinc-800 hover:text-emerald-900 transition-colors"
                      >
                        <Star
                          className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="font-mono tabular-nums font-semibold">
                          {ratingSummary.averageRating.toFixed(1)}
                        </span>
                        <span className="font-mono tabular-nums text-zinc-500">
                          ({ratingSummary.totalCount})
                        </span>
                      </a>
                    </>
                  )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href="#listing-chat"
                  className="inline-flex items-center gap-1 font-medium text-emerald-900 hover:underline whitespace-nowrap"
                >
                  <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                  {isOwner ? 'Buyer chats' : 'Chat'}
                </a>
                <span className="text-zinc-300" aria-hidden="true">
                  ·
                </span>
                <a
                  href="#listing-reviews"
                  className="font-medium text-zinc-600 hover:text-zinc-900 hover:underline whitespace-nowrap"
                >
                  Reviews
                </a>
                <span className="text-zinc-300" aria-hidden="true">
                  ·
                </span>
                <a
                  href="#seller-profile"
                  className="font-medium text-zinc-600 hover:text-zinc-900 hover:underline whitespace-nowrap"
                >
                  Seller
                </a>
              </div>
            </div>
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
                <div className="space-y-2">
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
                  <Link
                    to={`/listings/${listing.id}/flyer`}
                    aria-label={`Generate and print QR code flyer for ${listing.title}`}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/20 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
                  >
                    <QrCode className="w-4 h-4 shrink-0" aria-hidden="true" />
                    Print QR Flyer
                  </Link>
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
            <div className="border-t border-stone-200 pt-4 space-y-3">
              {listing.status === 'active' ? (
                <>
                  {/* Ghana-Tailored Local Payment Method Selector */}
                  <div className="space-y-2.5">
                    <span className="block text-xs font-semibold text-zinc-900">
                      Choose Payment &amp; Campus Handover Method
                    </span>
                    <div
                      role="radiogroup"
                      aria-label="Checkout payment method"
                      className="space-y-2"
                    >
                      {LOCAL_PAYMENT_METHOD_OPTIONS.map((option) => {
                        const isSelected = selectedPaymentMethod === option.value;
                        return (
                          <label
                            key={option.value}
                            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-emerald-50/70 border-emerald-900 ring-1 ring-emerald-900/20'
                                : 'bg-[#FAF9F6] border-stone-200 hover:border-stone-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="local-payment-method"
                              value={option.value}
                              checked={isSelected}
                              onChange={() => setSelectedPaymentMethod(option.value)}
                              className="mt-1 accent-emerald-900 shrink-0"
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <span className="text-xs font-semibold text-zinc-950">
                                  {option.title}
                                </span>
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white border border-stone-300 text-zinc-800 whitespace-nowrap">
                                  {option.badgeText}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-700 leading-relaxed">
                                {option.subtitle}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {selectedPaymentMethod === 'momo_prepayment' && (
                      <div className="bg-[#FAF9F6] border border-stone-200 rounded-lg p-3 space-y-1.5 text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-950">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-900 shrink-0" aria-hidden="true" />
                          <span>Seller Mobile Money Details</span>
                        </div>
                        {sellerProfile?.momoNumber ? (
                          <div className="space-y-0.5 text-zinc-800">
                            <p>
                              <span className="text-zinc-600">Network:</span>{' '}
                              <strong className="font-semibold">
                                {sellerProfile.momoNetwork
                                  ? MOMO_NETWORK_LABEL_MAP[sellerProfile.momoNetwork]
                                  : 'Mobile Money'}
                              </strong>
                            </p>
                            <p>
                              <span className="text-zinc-600">Number:</span>{' '}
                              <strong className="font-mono font-semibold tabular-nums">
                                {formatGhanaPhoneDisplay(sellerProfile.momoNumber)}
                              </strong>
                            </p>
                            {sellerProfile.momoAccountName && (
                              <p>
                                <span className="text-zinc-600">Name:</span>{' '}
                                <strong className="font-semibold">
                                  {sellerProfile.momoAccountName}
                                </strong>
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-zinc-700">
                            Seller has not added a MoMo number on their profile yet. You can ask
                            for it in listing chat before sending funds.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={creatingLocalOrder || creatingOrder}
                    onClick={() => void handlePlaceLocalOrder()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {creatingLocalOrder
                      ? 'Creating Order & Handover PIN...'
                      : 'Place Order & Generate Handover PIN'}
                  </button>

                  {reviewEligibility.canSubmit && (
                    <button
                      type="button"
                      onClick={jumpToReviewComposer}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/20 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {existingBuyerReview
                        ? 'Update Your Transaction Review'
                        : 'Rate & Review This Transaction'}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isFavoritePending(listing.id)}
                    onClick={() => void toggleFavorite(listing)}
                    aria-pressed={isFavorite(listing.id)}
                    aria-label={
                      isFavorite(listing.id)
                        ? `Remove ${listing.title} from Saved Items`
                        : `Save ${listing.title} to Saved Items`
                    }
                    className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium rounded-lg border transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
                      isFavorite(listing.id)
                        ? 'bg-emerald-50 text-emerald-950 border-emerald-900/30 hover:bg-emerald-100'
                        : 'bg-white text-zinc-900 border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    <Bookmark
                      className={`w-4 h-4 ${isFavorite(listing.id) ? 'fill-current' : ''}`}
                      aria-hidden="true"
                    />
                    {isFavorite(listing.id) ? 'Saved in Saved Items' : 'Save Item'}
                  </button>
                  <a
                    href="#listing-chat"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/15 rounded-lg transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" aria-hidden="true" />
                    Ask Seller / Negotiate Price
                  </a>

                  <div className="pt-1 border-t border-stone-200/80 space-y-2">
                    <button
                      type="button"
                      disabled={creatingOrder || creatingLocalOrder}
                      onClick={() => void handleBuyNow()}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <CreditCard className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      {creatingOrder ? 'Starting Paystack checkout...' : 'Or Pay Online via Paystack (Card / MoMo)'}
                    </button>
                    <p className="text-[11px] text-zinc-600 leading-relaxed">
                      Every campus order generates a private 4-digit Handover PIN &amp; QR code to
                      unlock completion and verified buyer reviews after inspection.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <Link
                      to="/campus-map"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-900 hover:underline"
                    >
                      <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                      Safe campus meetup spots
                    </Link>
                    <div className="flex items-center gap-3">
                      {isFavorite(listing.id) && (
                        <Link
                          to="/saved"
                          aria-label="View all Saved Items"
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-950 hover:underline"
                        >
                          <Bookmark className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                          Saved Items
                        </Link>
                      )}
                      <Link
                        to={`/listings/${listing.id}/flyer`}
                        aria-label={`Open printable QR code flyer for ${listing.title}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 hover:text-emerald-900 hover:underline"
                      >
                        <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                        QR Flyer
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-zinc-700 bg-stone-100 rounded-lg px-3.5 py-2.5">
                    This item is currently {LISTING_STATUS_LABELS[listing.status].toLowerCase()} and
                    unavailable for checkout.
                  </p>
                  {reviewEligibility.canSubmit && (
                    <button
                      type="button"
                      onClick={jumpToReviewComposer}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
                    >
                      <Star className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {existingBuyerReview
                        ? 'Update Your Transaction Review'
                        : 'Rate & Review This Transaction'}
                    </button>
                  )}
                  {listing.status !== 'removed' && (
                    <button
                      type="button"
                      disabled={isFavoritePending(listing.id)}
                      onClick={() => void toggleFavorite(listing)}
                      aria-pressed={isFavorite(listing.id)}
                      aria-label={
                        isFavorite(listing.id)
                          ? `Remove ${listing.title} from Saved Items`
                          : `Save ${listing.title} to Saved Items`
                      }
                      className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium rounded-lg border transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
                        isFavorite(listing.id)
                          ? 'bg-emerald-50 text-emerald-950 border-emerald-900/30 hover:bg-emerald-100'
                          : 'bg-white text-zinc-900 border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      <Bookmark
                        className={`w-4 h-4 ${isFavorite(listing.id) ? 'fill-current' : ''}`}
                        aria-hidden="true"
                      />
                      {isFavorite(listing.id) ? 'Saved in Saved Items' : 'Save Item'}
                    </button>
                  )}
                </div>
              )}

              {(checkoutError || favoritesError) && (
                <p
                  className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                  role="alert"
                >
                  {checkoutError || favoritesError}
                </p>
              )}

              {checkoutSession && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-emerald-950 font-medium">
                    Order created ({checkoutSession.reference}). If Paystack did not open
                    automatically, continue below:
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={checkoutSession.authorizationUrl}
                      target="_top"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-md"
                    >
                      Open Paystack Checkout
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                    <Link
                      to={`/orders?orderId=${checkoutSession.orderId}`}
                      className="px-3 py-1.5 text-xs font-medium text-emerald-900 hover:underline"
                    >
                      View Order Status
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Left Row 2: Real-Time Buyer-Seller Chat & Price Negotiation */}
        <div className="lg:col-span-7 order-3">
          <ListingChatCard listing={listing} isOwner={isOwner} />
        </div>

        {/* Left Row 3: Verified Buyer Ratings & Reviews */}
        <div className="lg:col-span-7 order-4">
          <ListingReviewsCard
            listingId={listing.id}
            sellerId={listing.sellerId}
            sellerName={listing.sellerName}
            reviews={sellerReviews}
            summary={ratingSummary}
            reviewsLoading={reviewsLoading}
            reviewsError={reviewsError}
            eligibility={reviewEligibility}
            eligibilityLoading={buyerOrdersLoading}
            autoOpenComposer={wantsAutoOpenReview}
            onComposerOpened={handleComposerAutoOpened}
          />
        </div>

        {/* Left Row 4: Seller Profile Card */}
        <div className="lg:col-span-7 order-5">
          <SellerProfileCard
            sellerId={listing.sellerId}
            fallbackSellerName={listing.sellerName}
            currentListingId={listing.id}
            isOwnListing={isOwner}
            showReviewsSection={false}
            externalSummary={ratingSummary}
            externalReviewsLoading={reviewsLoading}
            reviewsAnchorHref="#listing-reviews"
          />
        </div>

        {/* Left Row 5 (Desktop) / Bottom (Mobile): 30-Day Category Price Trend */}
        <div className="lg:col-span-7 order-6">
          <CategoryPriceTrendCard
            category={listing.category}
            currentListingId={listing.id}
            currentPricePesewas={listing.pricePesewas}
          />
        </div>
      </div>
    </main>
  );
}
