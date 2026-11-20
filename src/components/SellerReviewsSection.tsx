import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Pencil, Star, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  RATING_LABELS,
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_COMMENT_MIN_LENGTH,
  sortSellerReviews,
  validateSellerReviewInput,
  type SellerRatingSummary,
} from '../lib/reviews';
import { getBuyerCompletedOrderForSeller } from '../services/ordersService';
import { deleteSellerReview, submitSellerReview } from '../services/reviewsService';
import type { Order, SellerReview } from '../types/marketplace';

interface SellerReviewsSectionProps {
  sellerId: string;
  sellerFirstName: string;
  currentListingId: string;
  reviews: SellerReview[];
  summary: SellerRatingSummary;
  loading: boolean;
  loadError: string;
  isOwnProfile: boolean;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;
const DISTRIBUTION_ORDER = [5, 4, 3, 2, 1] as const;
const INITIAL_VISIBLE_REVIEWS = 3;

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

export function SellerReviewsSection({
  sellerId,
  sellerFirstName,
  currentListingId,
  reviews,
  summary,
  loading,
  loadError,
  isOwnProfile,
}: SellerReviewsSectionProps) {
  const { user, profile, isVerified } = useAuth();

  const existingUserReview = useMemo(
    () => (user ? reviews.find((review) => review.reviewerId === user.uid) ?? null : null),
    [reviews, user]
  );

  const sortedReviews = useMemo(
    () => sortSellerReviews(reviews, user?.uid),
    [reviews, user?.uid]
  );

  const isEligibleStudentAccount = Boolean(user && isVerified && !isOwnProfile && !profile?.banned);

  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [checkingOrderEligibility, setCheckingOrderEligibility] = useState(false);

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
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setComposerOpen(false);
    setConfirmDelete(false);
    setShowAll(false);
    setFieldErrors({});
    setSubmitError('');
    setStatusMessage('');
  }, [sellerId]);

  useEffect(() => {
    if (!isEligibleStudentAccount || !user) {
      setCompletedOrder(null);
      setCheckingOrderEligibility(false);
      return;
    }

    let cancelled = false;
    setCheckingOrderEligibility(true);

    getBuyerCompletedOrderForSeller(user.uid, sellerId)
      .then((order) => {
        if (!cancelled) {
          setCompletedOrder(order);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompletedOrder(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingOrderEligibility(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isEligibleStudentAccount, sellerId, user]);

  const canReview = Boolean(isEligibleStudentAccount && completedOrder);

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
    if (!user || !canReview) return;

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
        orderId: completedOrder?.id,
        reviewerName,
        rating,
        comment,
        listingId: currentListingId,
        isUpdate,
      });
      setComposerOpen(false);
      setHoverRating(0);
      setStatusMessage(isUpdate ? 'Your review was updated.' : 'Your review was posted.');
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
      setStatusMessage('Your review was deleted.');
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
    ? sortedReviews
    : sortedReviews.slice(0, INITIAL_VISIBLE_REVIEWS);
  const hiddenCount = Math.max(0, sortedReviews.length - visibleReviews.length);

  return (
    <div id="seller-reviews" className="border-t border-stone-200 pt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-zinc-900">Ratings &amp; Reviews</h3>
          <p className="text-xs text-zinc-500">
            Verified buyer feedback on item accuracy and campus meetups
          </p>
        </div>

        {canReview && !composerOpen && (
          <button
            type="button"
            onClick={openComposer}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/15 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
          >
            {existingUserReview ? (
              <>
                <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Edit your review</span>
              </>
            ) : (
              <>
                <Star className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Write a review</span>
              </>
            )}
          </button>
        )}

        {isEligibleStudentAccount && !checkingOrderEligibility && !completedOrder && !existingUserReview && (
          <p className="text-xs text-zinc-600">
            Complete an order with {sellerFirstName} to leave a review.
          </p>
        )}
      </div>

      {statusMessage && (
        <p
          role="status"
          className="text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"
        >
          {statusMessage}
        </p>
      )}

      {submitError && !composerOpen && (
        <p
          role="alert"
          className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
        >
          {submitError}
        </p>
      )}

      {/* Rating Summary & Breakdown */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 animate-pulse">
          <div className="sm:col-span-4 space-y-2">
            <div className="h-8 w-20 bg-stone-200 rounded" />
            <div className="h-4 w-28 bg-stone-200 rounded" />
          </div>
          <div className="sm:col-span-8 space-y-2">
            <div className="h-2.5 w-full bg-stone-200 rounded" />
            <div className="h-2.5 w-5/6 bg-stone-200 rounded" />
            <div className="h-2.5 w-2/3 bg-stone-200 rounded" />
          </div>
        </div>
      ) : loadError ? (
        <p className="text-xs text-zinc-500" role="alert">
          {loadError}
        </p>
      ) : summary.totalCount > 0 && summary.averageRating !== null ? (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
          <div className="sm:col-span-4 space-y-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-bold text-zinc-900 tabular-nums leading-none">
                {summary.averageRating.toFixed(1)}
              </span>
              <span className="font-mono text-xs text-zinc-500 tabular-nums">/ 5.0</span>
            </div>
            <StarRow rating={summary.averageRating} size="md" />
            <p className="text-xs text-zinc-500 font-mono tabular-nums">
              {summary.totalCount} {summary.totalCount === 1 ? 'student review' : 'student reviews'}
            </p>
          </div>

          <div
            className="sm:col-span-8 space-y-1.5"
            aria-label="Star rating distribution"
          >
            {DISTRIBUTION_ORDER.map((star) => {
              const count = summary.distribution[star];
              const pct = summary.totalCount > 0 ? Math.round((count / summary.totalCount) * 100) : 0;

              return (
                <div key={star} className="flex items-center gap-2.5 text-xs">
                  <span className="w-8 font-mono tabular-nums text-zinc-600 shrink-0">
                    {star}★
                  </span>
                  <svg
                    viewBox="0 0 100 8"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    className="flex-1 h-2 rounded-full overflow-hidden"
                  >
                    <rect x="0" y="0" width="100" height="8" rx="4" className="fill-stone-100" />
                    {pct > 0 && (
                      <rect
                        x="0"
                        y="0"
                        width={pct}
                        height="8"
                        rx="4"
                        className="fill-amber-500 transition-all duration-300"
                      />
                    )}
                  </svg>
                  <span className="w-7 text-right font-mono tabular-nums text-zinc-500 shrink-0">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 leading-relaxed">
          {isOwnProfile
            ? 'No student reviews yet. Ratings from verified campus buyers will appear here.'
            : `No student reviews for ${sellerFirstName} yet.${
                canReview ? ' Traded with them? Be the first to leave a rating.' : ''
              }`}
        </p>
      )}

      {/* Inline Review Composer */}
      {composerOpen && canReview && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="border-t border-stone-200 pt-4 space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-zinc-800">
              {existingUserReview
                ? `Update your rating for ${sellerFirstName}`
                : `Rate ${sellerFirstName}`}
            </span>

            <div className="flex flex-wrap items-center gap-3">
              <div
                role="radiogroup"
                aria-label={`Star rating for ${sellerFirstName}`}
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
                      className="w-10 h-10 inline-flex items-center justify-center rounded-lg hover:bg-stone-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-900"
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

              <span className="text-xs text-zinc-700 font-medium">
                {activeRating !== 0 ? (
                  <>
                    <span className="font-mono tabular-nums font-semibold text-zinc-900">
                      {activeRating}/5
                    </span>
                    <span className="mx-1 text-zinc-400" aria-hidden="true">
                      ·
                    </span>
                    <span>{RATING_LABELS[activeRating]}</span>
                  </>
                ) : (
                  <span className="text-zinc-500">Select a rating</span>
                )}
              </span>
            </div>

            {fieldErrors.rating && (
              <p className="text-xs text-red-700" role="alert">
                {fieldErrors.rating}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`seller-review-comment-${sellerId}`}
              className="block text-xs font-semibold text-zinc-800"
            >
              Review comment
            </label>
            <textarea
              id={`seller-review-comment-${sellerId}`}
              rows={3}
              value={comment}
              maxLength={REVIEW_COMMENT_MAX_LENGTH}
              onChange={(e) => {
                setComment(e.target.value);
                if (fieldErrors.comment) {
                  setFieldErrors((prev) => ({ ...prev, comment: '' }));
                }
              }}
              placeholder="Was the item as described? How was communication and campus meetup punctuality?"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-900/15"
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              {fieldErrors.comment ? (
                <p className="text-red-700" role="alert">
                  {fieldErrors.comment}
                </p>
              ) : (
                <span className="text-zinc-500">
                  Minimum {REVIEW_COMMENT_MIN_LENGTH} characters
                </span>
              )}
              <span className="font-mono tabular-nums text-zinc-500 shrink-0">
                {comment.trim().length} / {REVIEW_COMMENT_MAX_LENGTH}
              </span>
            </div>
          </div>

          {submitError && (
            <p
              role="alert"
              className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              {submitError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
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
              className="inline-flex items-center justify-center px-4 py-2 min-h-[40px] text-xs font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Individual Student Reviews */}
      {!loading && visibleReviews.length > 0 && (
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

            return (
              <article
                key={review.reviewerId}
                className="py-3.5 first:pt-4 last:pb-0 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
                    <span className="font-semibold text-zinc-900">{review.reviewerName}</span>
                    {isMine && (
                      <>
                        <span className="text-zinc-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-medium text-emerald-900">Your review</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
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
                  <span className="font-mono tabular-nums font-semibold text-zinc-800">
                    {clampedStar}/5
                  </span>
                  <span className="text-zinc-400" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-zinc-500">{RATING_LABELS[clampedStar]}</span>
                </div>

                <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line break-words">
                  {review.comment}
                </p>

                {isMine && !composerOpen && (
                  <div className="pt-1">
                    {confirmDelete ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs font-medium text-red-800">
                          Delete your review?
                        </span>
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => void handleDelete()}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-md disabled:opacity-50 transition-colors"
                        >
                          {deleting ? 'Deleting...' : 'Confirm delete'}
                        </button>
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => setConfirmDelete(false)}
                          className="px-2.5 py-1 text-xs font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-xs">
                        {canReview && (
                          <button
                            type="button"
                            onClick={openComposer}
                            className="inline-flex items-center gap-1 font-medium text-emerald-900 hover:underline"
                          >
                            <Pencil className="w-3 h-3" aria-hidden="true" />
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          className="inline-flex items-center gap-1 font-medium text-red-700 hover:underline"
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

      {!loading && sortedReviews.length > INITIAL_VISIBLE_REVIEWS && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="text-xs font-medium text-emerald-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
          >
            {showAll
              ? 'Show fewer reviews'
              : `Show all ${sortedReviews.length} reviews (+${hiddenCount} more)`}
          </button>
        </div>
      )}
    </div>
  );
}
