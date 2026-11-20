import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Pencil,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatGhs } from '../lib/money';
import {
  filterAndSortSellerReviews,
  RATING_LABELS,
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_COMMENT_MIN_LENGTH,
  validateSellerReviewInput,
  type BuyerReviewEligibility,
  type ReviewSortOption,
  type SellerRatingSummary,
} from '../lib/reviews';
import { deleteSellerReview, submitSellerReview } from '../services/reviewsService';
import type { OrderStatus, SellerReview } from '../types/marketplace';

interface ListingReviewsCardProps {
  listingId: string;
  sellerId: string;
  sellerName: string;
  reviews: SellerReview[];
  summary: SellerRatingSummary;
  reviewsLoading: boolean;
  reviewsError: string;
  eligibility: BuyerReviewEligibility;
  eligibilityLoading: boolean;
  autoOpenComposer?: boolean;
  onComposerOpened?: () => void;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;
const DISTRIBUTION_ORDER = [5, 4, 3, 2, 1] as const;
const INITIAL_VISIBLE_REVIEWS = 4;

const FOCUS_RING_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900';

const SORT_OPTIONS: { value: ReviewSortOption; label: string }[] = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'highest', label: 'Highest Rated' },
  { value: 'lowest', label: 'Lowest Rated' },
];

function formatReviewDate(date: Date | null): string {
  if (!date) return 'Just now';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isEditedReview(review: SellerReview): boolean {
  if (!review.createdAt || !review.updatedAt) return false;
  return review.updatedAt.getTime() - review.createdAt.getTime() > 5_000;
}

function getInProgressGuidance(status: OrderStatus): { heading: string; detail: string; cta: string } {
  switch (status) {
    case 'shipped':
      return {
        heading: 'Your order is on the way',
        detail:
          'Confirm receipt once you inspect the item to complete the transaction and unlock your rating and review.',
        cta: 'Confirm Receipt',
      };
    case 'paid':
      return {
        heading: 'Transaction in progress',
        detail:
          'Your payment is confirmed. After campus handoff and delivery confirmation, you can rate and review the seller here.',
        cta: 'View Order',
      };
    case 'payment_submitted':
      return {
        heading: 'Payment receipt awaiting seller verification',
        detail:
          'Once your payment is verified and the order is completed, you can share your buyer feedback here.',
        cta: 'View Order',
      };
    default:
      return {
        heading: 'Order awaiting payment',
        detail:
          'Complete payment and confirm delivery on your order page to unlock verified buyer reviews.',
        cta: 'Complete Payment',
      };
  }
}

function StarRow({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const rounded = Math.round(rating);
  const iconClass = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';

  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {STAR_VALUES.map((star) => (
        <Star
          key={star}
          className={`${iconClass} ${
            star <= rounded
              ? 'text-amber-500 fill-amber-500'
              : 'text-stone-300 fill-stone-200'
          }`}
        />
      ))}
    </span>
  );
}

function formatReviewActionError(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  const trimmed = err.message.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: string };
      const inner = String(parsed.error || '').toLowerCase();
      if (inner.includes('permission') || inner.includes('insufficient')) {
        return 'Only verified buyers with a completed order from this seller can post or edit a review.';
      }
    } catch {
      // Fall through to generic friendly fallback
    }
    return fallback;
  }
  return trimmed;
}

export function ListingReviewsCard({
  listingId,
  sellerId,
  sellerName,
  reviews,
  summary,
  reviewsLoading,
  reviewsError,
  eligibility,
  eligibilityLoading,
  autoOpenComposer = false,
  onComposerOpened,
}: ListingReviewsCardProps) {
  const { user, profile } = useAuth();

  const firstName = useMemo(
    () => (sellerName.trim().split(/\s+/)[0] || 'Seller'),
    [sellerName]
  );

  const existingUserReview = useMemo(
    () => (user ? reviews.find((review) => review.reviewerId === user.uid) ?? null : null),
    [reviews, user]
  );

  const listingReviewCount = useMemo(
    () => reviews.filter((review) => review.listingId === listingId).length,
    [reviews, listingId]
  );

  const [composerOpen, setComposerOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [starFilter, setStarFilter] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'this_listing'>('all');
  const [sortBy, setSortBy] = useState<ReviewSortOption>('recent');
  const [showAll, setShowAll] = useState(false);

  const autoOpenedForKeyRef = useRef<string>('');

  useEffect(() => {
    setComposerOpen(false);
    setConfirmDelete(false);
    setStarFilter(null);
    setScopeFilter('all');
    setSortBy('recent');
    setShowAll(false);
    setFieldErrors({});
    setSubmitError('');
    setStatusMessage('');
    autoOpenedForKeyRef.current = '';
  }, [listingId, sellerId]);

  useEffect(() => {
    if (!autoOpenComposer || eligibilityLoading || reviewsLoading || !eligibility.canSubmit) {
      return;
    }
    const key = `${listingId}:${sellerId}`;
    if (autoOpenedForKeyRef.current === key) return;
    autoOpenedForKeyRef.current = key;

    if (existingUserReview) {
      setRating(existingUserReview.rating);
      setComment(existingUserReview.comment);
    } else {
      setRating(0);
      setComment('');
    }
    setHoverRating(0);
    setFieldErrors({});
    setSubmitError('');
    setConfirmDelete(false);
    setComposerOpen(true);
    onComposerOpened?.();
  }, [
    autoOpenComposer,
    eligibilityLoading,
    reviewsLoading,
    eligibility.canSubmit,
    existingUserReview,
    listingId,
    sellerId,
    onComposerOpened,
  ]);

  const filteredReviews = useMemo(
    () =>
      filterAndSortSellerReviews(reviews, {
        currentUserId: user?.uid ?? null,
        starFilter,
        listingIdOnly: scopeFilter === 'this_listing' ? listingId : null,
        sortBy,
      }),
    [reviews, user?.uid, starFilter, scopeFilter, listingId, sortBy]
  );

  const openComposer = () => {
    setStatusMessage('');
    setSubmitError('');
    setFieldErrors({});
    setConfirmDelete(false);
    if (existingUserReview) {
      setRating(existingUserReview.rating);
      setComment(existingUserReview.comment);
    } else {
      setRating(0);
      setComment('');
    }
    setHoverRating(0);
    setComposerOpen(true);
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setHoverRating(0);
    setFieldErrors({});
    setSubmitError('');
    autoOpenedForKeyRef.current = '';
  };

  const handleStarKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentStar: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.min(5, currentStar + 1);
      setRating(next);
      setFieldErrors((prev) => ({ ...prev, rating: '' }));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      const prevStar = Math.max(1, currentStar - 1);
      setRating(prevStar);
      setFieldErrors((prev) => ({ ...prev, rating: '' }));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !eligibility.canSubmit) return;

    const reviewerName = profile?.displayName || user.displayName || 'Campus Student';
    const validation = validateSellerReviewInput({
      rating,
      comment,
      reviewerName,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setSubmitError('');
    setSubmitting(true);

    const isUpdate = Boolean(existingUserReview);

    try {
      await submitSellerReview({
        sellerId,
        reviewerId: user.uid,
        orderId: eligibility.completedOrder?.id,
        reviewerName,
        rating,
        comment,
        listingId,
        isUpdate,
      });
      setComposerOpen(false);
      setHoverRating(0);
      setStatusMessage(
        isUpdate
          ? 'Your transaction review has been updated.'
          : 'Thank you — your verified buyer review has been posted.'
      );
    } catch (err) {
      setSubmitError(
        formatReviewActionError(err, 'Could not save your review right now. Please try again.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !existingUserReview) return;
    setDeleting(true);
    setSubmitError('');
    setStatusMessage('');

    try {
      await deleteSellerReview(sellerId, user.uid);
      setConfirmDelete(false);
      setComposerOpen(false);
      setRating(0);
      setComment('');
      setStatusMessage('Your review has been removed.');
    } catch (err) {
      setSubmitError(
        formatReviewActionError(err, 'Could not delete your review right now. Please try again.')
      );
    } finally {
      setDeleting(false);
    }
  };

  const activeRating = (hoverRating || rating) as 0 | 1 | 2 | 3 | 4 | 5;
  const visibleReviews = showAll
    ? filteredReviews
    : filteredReviews.slice(0, INITIAL_VISIBLE_REVIEWS);
  const hiddenCount = Math.max(0, filteredReviews.length - visibleReviews.length);
  const hasActiveFilter = starFilter !== null || scopeFilter !== 'all';

  return (
    <section
      id="listing-reviews"
      aria-labelledby="listing-reviews-heading"
      className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-5 scroll-mt-24"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2
            id="listing-reviews-heading"
            className="text-base sm:text-lg font-semibold tracking-tight text-zinc-950"
          >
            Buyer Ratings &amp; Reviews
          </h2>
          <p className="text-xs text-zinc-600">
            Verified buyer feedback for {sellerName} after completed campus transactions
          </p>
        </div>

        {eligibility.canSubmit && !composerOpen && (
          <button
            type="button"
            onClick={openComposer}
            aria-label={
              existingUserReview
                ? `Edit your review for ${sellerName}`
                : `Write a review for ${sellerName}`
            }
            className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap shrink-0 ${FOCUS_RING_CLASS}`}
          >
            {existingUserReview ? (
              <>
                <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Edit Your Review</span>
              </>
            ) : (
              <>
                <Star className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Write a Review</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Live Status & Error Feedback */}
      {statusMessage && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs sm:text-sm font-medium text-emerald-950 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5"
        >
          {statusMessage}
        </p>
      )}

      {submitError && !composerOpen && (
        <p
          role="alert"
          className="text-xs sm:text-sm text-red-900 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5"
        >
          {submitError}
        </p>
      )}

      {/* Post-Transaction Feedback Prompt (for eligible buyers who haven't reviewed yet) */}
      {!eligibilityLoading &&
        eligibility.canSubmit &&
        eligibility.completedOrder &&
        !existingUserReview &&
        !composerOpen && (
          <div className="bg-[#FAF9F6] border border-stone-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-950">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-800 shrink-0" aria-hidden="true" />
                <span>
                  {eligibility.completedForCurrentListing
                    ? 'You completed a transaction for this listing'
                    : `You completed an order with ${firstName}`}
                </span>
              </p>
              <p className="text-xs text-zinc-700 leading-relaxed">
                Share how item accuracy, communication, and campus pickup went for{' '}
                <span className="font-medium text-zinc-900">
                  {eligibility.completedOrder.listingTitle}
                </span>{' '}
                <span className="font-mono tabular-nums text-zinc-600">
                  ({formatGhs(eligibility.completedOrder.amountPesewas)})
                </span>
                .
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-600">
                <span>
                  Completed {formatReviewDate(eligibility.completedOrder.completedAt)}
                </span>
                <span aria-hidden="true">·</span>
                <Link
                  to={`/orders/${eligibility.completedOrder.id}`}
                  className={`font-medium text-emerald-900 hover:underline rounded ${FOCUS_RING_CLASS}`}
                >
                  View order receipt
                </Link>
              </div>
            </div>

            <button
              type="button"
              onClick={openComposer}
              aria-label={`Rate and review your completed transaction with ${sellerName}`}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[40px] px-4 py-2 text-xs font-semibold text-emerald-950 bg-emerald-100 hover:bg-emerald-200/80 rounded-lg transition-colors whitespace-nowrap shrink-0 ${FOCUS_RING_CLASS}`}
            >
              <span>Share Feedback</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </button>
          </div>
        )}

      {/* Contextual Guidance for In-Progress Orders */}
      {!eligibilityLoading && eligibility.status === 'in_progress' && eligibility.activeOrder && (
        <div className="bg-[#FAF9F6] border border-stone-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {(() => {
            const guidance = getInProgressGuidance(eligibility.activeOrder.status);
            return (
              <>
                <div className="space-y-1 min-w-0">
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                    <Clock className="w-3.5 h-3.5 text-zinc-600 shrink-0" aria-hidden="true" />
                    <span>{guidance.heading}</span>
                  </p>
                  <p className="text-xs text-zinc-700 leading-relaxed">{guidance.detail}</p>
                </div>
                <Link
                  to={`/orders/${eligibility.activeOrder.id}`}
                  aria-label={`${guidance.cta} for order ${eligibility.activeOrder.listingTitle}`}
                  className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[40px] px-3.5 py-2 text-xs font-semibold text-zinc-900 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg transition-colors whitespace-nowrap shrink-0 ${FOCUS_RING_CLASS}`}
                >
                  <span>{guidance.cta}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </Link>
              </>
            );
          })()}
        </div>
      )}

      {/* Rating Summary & Interactive Star Breakdown */}
      {reviewsLoading ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-12 gap-5 animate-pulse"
          aria-label="Loading buyer ratings and reviews"
        >
          <div className="sm:col-span-4 space-y-2">
            <div className="h-9 w-24 bg-stone-200 rounded" />
            <div className="h-4 w-32 bg-stone-200 rounded" />
          </div>
          <div className="sm:col-span-8 space-y-2">
            <div className="h-3 w-full bg-stone-200 rounded" />
            <div className="h-3 w-5/6 bg-stone-200 rounded" />
            <div className="h-3 w-2/3 bg-stone-200 rounded" />
          </div>
        </div>
      ) : reviewsError ? (
        <p className="text-xs sm:text-sm text-zinc-600" role="alert">
          {reviewsError}
        </p>
      ) : summary.totalCount > 0 && summary.averageRating !== null ? (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center pt-1">
          <div className="sm:col-span-4 space-y-1.5">
            <div className="flex items-baseline gap-1.5">
              <span
                aria-label={`Average rating ${summary.averageRating.toFixed(1)} out of 5`}
                className="font-mono text-3xl font-bold text-zinc-950 tabular-nums leading-none"
              >
                {summary.averageRating.toFixed(1)}
              </span>
              <span className="font-mono text-xs text-zinc-600 tabular-nums">/ 5.0</span>
            </div>
            <StarRow rating={summary.averageRating} size="md" />
            <p className="text-xs text-zinc-600 font-mono tabular-nums">
              {summary.totalCount}{' '}
              {summary.totalCount === 1 ? 'verified review' : 'verified reviews'}
              {listingReviewCount > 0 && (
                <span className="font-sans text-zinc-600">
                  {' '}
                  · {listingReviewCount} for this listing
                </span>
              )}
            </p>
          </div>

          <div
            className="sm:col-span-8 space-y-1"
            role="group"
            aria-label="Filter reviews by star rating"
          >
            {DISTRIBUTION_ORDER.map((star) => {
              const count = summary.distribution[star];
              const pct =
                summary.totalCount > 0 ? Math.round((count / summary.totalCount) * 100) : 0;
              const isSelected = starFilter === star;

              return (
                <button
                  key={star}
                  type="button"
                  disabled={count === 0 && !isSelected}
                  aria-pressed={isSelected}
                  aria-label={`Filter by ${star}-star reviews (${count})`}
                  onClick={() => {
                    setStarFilter((prev) => (prev === star ? null : star));
                    setShowAll(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2 py-1 rounded-md text-xs transition-colors disabled:opacity-60 disabled:cursor-default ${FOCUS_RING_CLASS} ${
                    isSelected
                      ? 'bg-emerald-50 text-emerald-950 font-semibold'
                      : 'hover:bg-stone-100 text-zinc-700'
                  }`}
                >
                  <span className="w-8 text-left font-mono tabular-nums shrink-0">
                    {star}★
                  </span>
                  <svg
                    viewBox="0 0 100 8"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    className="flex-1 h-2 rounded-full overflow-hidden"
                  >
                    <rect x="0" y="0" width="100" height="8" rx="4" className="fill-stone-200/90" />
                    {pct > 0 && (
                      <rect
                        x="0"
                        y="0"
                        width={pct}
                        height="8"
                        rx="4"
                        className={
                          isSelected
                            ? 'fill-emerald-800 transition-all duration-200'
                            : 'fill-amber-500 transition-all duration-200'
                        }
                      />
                    )}
                  </svg>
                  <span className="w-8 text-right font-mono tabular-nums text-zinc-600 shrink-0">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="border-t border-stone-200 pt-4 space-y-1">
          <p className="text-sm font-medium text-zinc-900">No verified reviews yet</p>
          <p className="text-xs text-zinc-600 leading-relaxed">
            {eligibility.status === 'own_listing'
              ? 'Ratings and feedback from students who complete an order with you will appear here.'
              : eligibility.canSubmit
                ? `You have a completed transaction with ${firstName}. Be the first to share feedback.`
                : `Ratings unlock for students who complete a transaction with ${firstName}.`}
          </p>
        </div>
      )}

      {/* Quiet Eligibility Explanation for Verified Non-Buyers */}
      {!eligibilityLoading &&
        eligibility.status === 'no_completed_order' &&
        summary.totalCount > 0 && (
          <p className="text-xs text-zinc-600 border-t border-stone-200 pt-3.5">
            To keep campus ratings trustworthy, only verified buyers who complete an order with{' '}
            {firstName} can leave a rating and review.
          </p>
        )}

      {/* Inline Rating & Review Composer */}
      {composerOpen && eligibility.canSubmit && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          aria-label={
            existingUserReview ? 'Edit your transaction review' : 'Submit a transaction review'
          }
          className="border-t border-stone-200 pt-5 space-y-4"
          noValidate
        >
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-950">
              {existingUserReview
                ? `Update your feedback for ${firstName}`
                : `Rate your transaction with ${firstName}`}
            </h3>
            {eligibility.completedOrder && (
              <p className="text-xs text-zinc-600">
                Verified purchase: {eligibility.completedOrder.listingTitle} ·{' '}
                <span className="font-mono tabular-nums">
                  {formatGhs(eligibility.completedOrder.amountPesewas)}
                </span>{' '}
                · Ref{' '}
                <span className="font-mono">{eligibility.completedOrder.paystackReference}</span>
              </p>
            )}
          </div>

          {/* Interactive 5-Star Selector */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-zinc-800">Overall rating</span>

            <div className="flex flex-wrap items-center gap-3">
              <div
                role="radiogroup"
                aria-label={`Star rating for ${sellerName}`}
                className="inline-flex items-center gap-0.5"
                onMouseLeave={() => setHoverRating(0)}
              >
                {STAR_VALUES.map((star) => {
                  const isFilled = star <= activeRating;
                  const isSelected = star === rating;

                  return (
                    <button
                      key={star}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`${star} out of 5 stars — ${RATING_LABELS[star]}`}
                      onClick={() => {
                        setRating(star);
                        setFieldErrors((prev) => ({ ...prev, rating: '' }));
                      }}
                      onMouseEnter={() => setHoverRating(star)}
                      onKeyDown={(e) => handleStarKeyDown(e, star)}
                      className={`w-11 h-11 sm:w-10 sm:h-10 inline-flex items-center justify-center rounded-lg hover:bg-stone-100 transition-colors ${FOCUS_RING_CLASS}`}
                    >
                      <Star
                        className={`w-6 h-6 transition-colors ${
                          isFilled
                            ? 'text-amber-500 fill-amber-500'
                            : 'text-stone-300 fill-stone-100'
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>

              <span className="text-xs text-zinc-800 font-medium">
                {activeRating !== 0 ? (
                  <>
                    <span className="font-mono tabular-nums font-semibold text-zinc-950">
                      {activeRating}/5
                    </span>
                    <span className="mx-1.5 text-zinc-400" aria-hidden="true">
                      ·
                    </span>
                    <span>{RATING_LABELS[activeRating]}</span>
                  </>
                ) : (
                  <span className="text-zinc-600">Select a star rating</span>
                )}
              </span>
            </div>

            {fieldErrors.rating && (
              <p className="text-xs text-red-800" role="alert">
                {fieldErrors.rating}
              </p>
            )}
          </div>

          {/* Written Feedback Field */}
          <div className="space-y-1.5">
            <label
              htmlFor={`listing-review-comment-${listingId}`}
              className="block text-xs font-semibold text-zinc-800"
            >
              Share your experience
            </label>
            <textarea
              id={`listing-review-comment-${listingId}`}
              rows={3}
              value={comment}
              maxLength={REVIEW_COMMENT_MAX_LENGTH}
              onChange={(e) => {
                setComment(e.target.value);
                if (fieldErrors.comment) {
                  setFieldErrors((prev) => ({ ...prev, comment: '' }));
                }
              }}
              placeholder="Did the item match its photos and condition? How were communication and campus meetup timing?"
              className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-zinc-950 placeholder:text-zinc-500 focus:border-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-900/15"
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              {fieldErrors.comment ? (
                <p className="text-red-800" role="alert">
                  {fieldErrors.comment}
                </p>
              ) : (
                <span className="text-zinc-600">
                  Minimum {REVIEW_COMMENT_MIN_LENGTH} characters
                </span>
              )}
              <span className="font-mono tabular-nums text-zinc-600 shrink-0">
                {comment.trim().length} / {REVIEW_COMMENT_MAX_LENGTH}
              </span>
            </div>
          </div>

          {submitError && (
            <p
              role="alert"
              className="text-xs text-red-900 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5"
            >
              {submitError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="submit"
              disabled={submitting}
              className={`inline-flex items-center justify-center min-h-[44px] sm:min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
            >
              {submitting
                ? existingUserReview
                  ? 'Saving...'
                  : 'Posting...'
                : existingUserReview
                  ? 'Save Changes'
                  : 'Post Review'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={closeComposer}
              className={`inline-flex items-center justify-center min-h-[44px] sm:min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filter & Sort Controls (when reviews exist) */}
      {!reviewsLoading && summary.totalCount > 0 && (
        <div className="border-t border-stone-200 pt-4 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {listingReviewCount > 0 && (
              <div
                role="group"
                aria-label="Filter reviews by listing scope"
                className="inline-flex items-center p-0.5 bg-stone-200/80 rounded-lg"
              >
                <button
                  type="button"
                  aria-pressed={scopeFilter === 'all'}
                  onClick={() => {
                    setScopeFilter('all');
                    setShowAll(false);
                  }}
                  className={`min-h-[36px] px-3 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${FOCUS_RING_CLASS} ${
                    scopeFilter === 'all'
                      ? 'bg-white text-zinc-950 font-semibold shadow-xs'
                      : 'text-zinc-800 hover:text-zinc-950 font-medium'
                  }`}
                >
                  All ({summary.totalCount})
                </button>
                <button
                  type="button"
                  aria-pressed={scopeFilter === 'this_listing'}
                  onClick={() => {
                    setScopeFilter('this_listing');
                    setShowAll(false);
                  }}
                  className={`min-h-[36px] px-3 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${FOCUS_RING_CLASS} ${
                    scopeFilter === 'this_listing'
                      ? 'bg-white text-zinc-950 font-semibold shadow-xs'
                      : 'text-zinc-800 hover:text-zinc-950 font-medium'
                  }`}
                >
                  This Listing ({listingReviewCount})
                </button>
              </div>
            )}

            {starFilter !== null && (
              <button
                type="button"
                onClick={() => setStarFilter(null)}
                aria-label={`Clear ${starFilter}-star filter`}
                className={`inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 text-xs font-medium text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/20 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
              >
                <span className="font-mono tabular-nums">{starFilter}★ only</span>
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="relative ml-auto">
            <label htmlFor={`review-sort-${listingId}`} className="sr-only">
              Sort reviews
            </label>
            <select
              id={`review-sort-${listingId}`}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ReviewSortOption)}
              aria-label="Sort buyer reviews"
              className={`appearance-none min-h-[40px] sm:min-h-[36px] pl-3 pr-8 py-1.5 text-xs font-medium text-zinc-900 bg-white border border-stone-300 rounded-lg hover:border-stone-400 cursor-pointer whitespace-nowrap ${FOCUS_RING_CLASS}`}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="w-3.5 h-3.5 text-zinc-600 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      {/* Filtered Empty State */}
      {!reviewsLoading && summary.totalCount > 0 && filteredReviews.length === 0 && (
        <div className="border-t border-stone-200 pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-700">
          <span>No reviews match your selected filter.</span>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => {
                setStarFilter(null);
                setScopeFilter('all');
              }}
              className={`font-semibold text-emerald-900 hover:underline rounded ${FOCUS_RING_CLASS}`}
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {/* Individual Reviews List */}
      {!reviewsLoading && visibleReviews.length > 0 && (
        <div className="border-t border-stone-200 divide-y divide-stone-200/80">
          {visibleReviews.map((review) => {
            const isMine = Boolean(user && review.reviewerId === user.uid);
            const clampedStar = Math.min(5, Math.max(1, Math.round(review.rating))) as
              | 1
              | 2
              | 3
              | 4
              | 5;
            const edited = isEditedReview(review);
            const isForCurrentListing = review.listingId === listingId;

            return (
              <article
                key={review.reviewerId}
                className="py-4 first:pt-4 last:pb-0 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
                    <span className="font-semibold text-zinc-950">{review.reviewerName}</span>
                    <span className="text-zinc-400" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-medium text-emerald-900">Verified purchase</span>
                    {isForCurrentListing && (
                      <>
                        <span className="text-zinc-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-zinc-700">This listing</span>
                      </>
                    )}
                    {isMine && (
                      <>
                        <span className="text-zinc-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-semibold text-zinc-900">Your review</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                    <time dateTime={review.createdAt?.toISOString()}>
                      {formatReviewDate(review.createdAt)}
                    </time>
                    {edited && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Edited</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <StarRow rating={clampedStar} size="sm" />
                  <span className="font-mono tabular-nums font-semibold text-zinc-900">
                    {clampedStar}/5
                  </span>
                  <span className="text-zinc-400" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-zinc-700">{RATING_LABELS[clampedStar]}</span>
                </div>

                <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-line break-words">
                  {review.comment}
                </p>

                {isMine && !composerOpen && (
                  <div className="pt-1">
                    {confirmDelete ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs font-medium text-red-900">
                          Delete your review?
                        </span>
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => void handleDelete()}
                          className={`min-h-[36px] px-3 py-1 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-md disabled:opacity-50 transition-colors ${FOCUS_RING_CLASS}`}
                        >
                          {deleting ? 'Deleting...' : 'Confirm Delete'}
                        </button>
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => setConfirmDelete(false)}
                          className={`min-h-[36px] px-3 py-1 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors ${FOCUS_RING_CLASS}`}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 text-xs">
                        {eligibility.canSubmit && (
                          <button
                            type="button"
                            onClick={openComposer}
                            aria-label="Edit your review"
                            className={`inline-flex items-center gap-1 py-1 font-medium text-emerald-900 hover:underline rounded ${FOCUS_RING_CLASS}`}
                          >
                            <Pencil className="w-3 h-3" aria-hidden="true" />
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          aria-label="Delete your review"
                          className={`inline-flex items-center gap-1 py-1 font-medium text-red-800 hover:underline rounded ${FOCUS_RING_CLASS}`}
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {!reviewsLoading && filteredReviews.length > INITIAL_VISIBLE_REVIEWS && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className={`min-h-[36px] text-xs font-semibold text-emerald-900 hover:underline rounded ${FOCUS_RING_CLASS}`}
          >
            {showAll
              ? 'Show fewer reviews'
              : `Show all ${filteredReviews.length} reviews (+${hiddenCount} more)`}
          </button>
        </div>
      )}
    </section>
  );
}
