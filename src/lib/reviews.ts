import { stripHtmlTags } from './listingValidation';
import type { Order, SellerReview } from '../types/marketplace';

export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
export const REVIEW_COMMENT_MIN_LENGTH = 5;
export const REVIEW_COMMENT_MAX_LENGTH = 500;
export const REVIEW_NAME_MIN_LENGTH = 2;
export const REVIEW_NAME_MAX_LENGTH = 60;

export const RATING_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent',
};

export interface ValidatedReviewPayload {
  rating: number;
  comment: string;
  reviewerName: string;
}

export function validateSellerReviewInput(input: {
  rating: number;
  comment: string;
  reviewerName: string;
}): { valid: boolean; errors: Record<string, string>; payload?: ValidatedReviewPayload } {
  const errors: Record<string, string> = {};

  if (
    !Number.isInteger(input.rating) ||
    input.rating < REVIEW_RATING_MIN ||
    input.rating > REVIEW_RATING_MAX
  ) {
    errors.rating = 'Select a star rating between 1 and 5.';
  }

  const cleanComment = stripHtmlTags(input.comment);
  if (
    cleanComment.length < REVIEW_COMMENT_MIN_LENGTH ||
    cleanComment.length > REVIEW_COMMENT_MAX_LENGTH
  ) {
    errors.comment = `Write between ${REVIEW_COMMENT_MIN_LENGTH} and ${REVIEW_COMMENT_MAX_LENGTH} characters.`;
  }

  const rawName = stripHtmlTags(input.reviewerName).slice(0, REVIEW_NAME_MAX_LENGTH);
  const cleanName = rawName.length >= REVIEW_NAME_MIN_LENGTH ? rawName : 'Campus Student';

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    payload: {
      rating: input.rating,
      comment: cleanComment,
      reviewerName: cleanName,
    },
  };
}

export interface SellerRatingSummary {
  averageRating: number | null;
  totalCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export function summarizeSellerReviews(reviews: SellerReview[]): SellerRatingSummary {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  let sum = 0;
  let validCount = 0;

  for (const review of reviews) {
    const rounded = Math.round(review.rating);
    if (rounded >= 1 && rounded <= 5) {
      distribution[rounded as 1 | 2 | 3 | 4 | 5] += 1;
      sum += rounded;
      validCount += 1;
    }
  }

  return {
    averageRating: validCount > 0 ? Math.round((sum / validCount) * 10) / 10 : null,
    totalCount: validCount,
    distribution,
  };
}

function getReviewSortTimestamp(review: SellerReview): number {
  const date = review.updatedAt ?? review.createdAt;
  // Firestore latency-compensated local writes briefly have null timestamps;
  // sort them first so newly posted/edited reviews stay at the top immediately.
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
}

export function sortSellerReviews(
  reviews: SellerReview[],
  currentUserId?: string | null
): SellerReview[] {
  return [...reviews].sort((a, b) => {
    if (currentUserId) {
      const aMine = a.reviewerId === currentUserId ? 1 : 0;
      const bMine = b.reviewerId === currentUserId ? 1 : 0;
      if (aMine !== bMine) return bMine - aMine;
    }
    return getReviewSortTimestamp(b) - getReviewSortTimestamp(a);
  });
}

export type ReviewSortOption = 'recent' | 'highest' | 'lowest';

export interface ReviewFilterSortOptions {
  currentUserId?: string | null;
  starFilter?: 1 | 2 | 3 | 4 | 5 | null;
  listingIdOnly?: string | null;
  sortBy?: ReviewSortOption;
}

export function filterAndSortSellerReviews(
  reviews: SellerReview[],
  options: ReviewFilterSortOptions = {}
): SellerReview[] {
  const {
    currentUserId = null,
    starFilter = null,
    listingIdOnly = null,
    sortBy = 'recent',
  } = options;

  let filtered = reviews;

  if (starFilter !== null) {
    filtered = filtered.filter((review) => Math.round(review.rating) === starFilter);
  }

  if (listingIdOnly) {
    filtered = filtered.filter((review) => review.listingId === listingIdOnly);
  }

  if (sortBy === 'recent') {
    return sortSellerReviews(filtered, currentUserId);
  }

  return [...filtered].sort((a, b) => {
    const ratingDiff = sortBy === 'highest' ? b.rating - a.rating : a.rating - b.rating;
    if (ratingDiff !== 0) return ratingDiff;
    return getReviewSortTimestamp(b) - getReviewSortTimestamp(a);
  });
}

function getOrderPriorityTime(order: Order): number {
  return (order.completedAt ?? order.updatedAt ?? order.createdAt)?.getTime() ?? 0;
}

/**
 * Selects the most recent completed order between `buyerId` and `sellerId`,
 * matching the Firestore Security Rules requirement for `/users/{sellerId}/reviews/{reviewerId}`.
 */
export function findCompletedOrderForSeller(
  orders: Order[],
  buyerId: string,
  sellerId: string
): Order | null {
  if (!buyerId || !sellerId || buyerId === sellerId) {
    return null;
  }

  const completed = orders.filter(
    (order) =>
      order.status === 'completed' &&
      order.buyerId === buyerId &&
      order.sellerId === sellerId
  );

  if (completed.length === 0) {
    return null;
  }

  completed.sort((a, b) => getOrderPriorityTime(b) - getOrderPriorityTime(a));

  return completed[0];
}

export type BuyerReviewEligibilityStatus =
  | 'completed_for_listing'
  | 'completed_for_seller'
  | 'in_progress'
  | 'no_completed_order'
  | 'own_listing'
  | 'suspended';

export interface BuyerReviewEligibility {
  status: BuyerReviewEligibilityStatus;
  canSubmit: boolean;
  completedOrder: Order | null;
  activeOrder: Order | null;
  completedForCurrentListing: boolean;
}

const IN_PROGRESS_ORDER_STATUSES = new Set<Order['status']>([
  'pending_payment',
  'payment_submitted',
  'paid',
  'shipped',
]);

/**
 * Determines whether the signed-in student can post/edit a review for a seller on
 * a specific listing, prioritizing a completed order for that listing first, then
 * any completed order with the seller, and otherwise surfacing in-progress orders.
 */
export function resolveBuyerReviewEligibility(params: {
  orders: Order[];
  buyerId?: string | null;
  sellerId: string;
  listingId: string;
  isBanned?: boolean;
}): BuyerReviewEligibility {
  const { orders, buyerId, sellerId, listingId, isBanned = false } = params;

  if (!buyerId) {
    return {
      status: 'no_completed_order',
      canSubmit: false,
      completedOrder: null,
      activeOrder: null,
      completedForCurrentListing: false,
    };
  }

  if (buyerId === sellerId) {
    return {
      status: 'own_listing',
      canSubmit: false,
      completedOrder: null,
      activeOrder: null,
      completedForCurrentListing: false,
    };
  }

  if (isBanned) {
    return {
      status: 'suspended',
      canSubmit: false,
      completedOrder: null,
      activeOrder: null,
      completedForCurrentListing: false,
    };
  }

  const sellerOrders = orders.filter(
    (order) => order.buyerId === buyerId && order.sellerId === sellerId
  );

  const completedOrders = sellerOrders
    .filter((order) => order.status === 'completed')
    .sort((a, b) => getOrderPriorityTime(b) - getOrderPriorityTime(a));

  const completedForListing = completedOrders.find((order) => order.listingId === listingId) ?? null;
  if (completedForListing) {
    return {
      status: 'completed_for_listing',
      canSubmit: true,
      completedOrder: completedForListing,
      activeOrder: null,
      completedForCurrentListing: true,
    };
  }

  if (completedOrders.length > 0) {
    return {
      status: 'completed_for_seller',
      canSubmit: true,
      completedOrder: completedOrders[0],
      activeOrder: null,
      completedForCurrentListing: false,
    };
  }

  const inProgressOrders = sellerOrders
    .filter((order) => IN_PROGRESS_ORDER_STATUSES.has(order.status))
    .sort((a, b) => {
      const aListingMatch = a.listingId === listingId ? 1 : 0;
      const bListingMatch = b.listingId === listingId ? 1 : 0;
      if (aListingMatch !== bListingMatch) return bListingMatch - aListingMatch;
      const aShipped = a.status === 'shipped' ? 1 : 0;
      const bShipped = b.status === 'shipped' ? 1 : 0;
      if (aShipped !== bShipped) return bShipped - aShipped;
      return getOrderPriorityTime(b) - getOrderPriorityTime(a);
    });

  if (inProgressOrders.length > 0) {
    return {
      status: 'in_progress',
      canSubmit: false,
      completedOrder: null,
      activeOrder: inProgressOrders[0],
      completedForCurrentListing: false,
    };
  }

  return {
    status: 'no_completed_order',
    canSubmit: false,
    completedOrder: null,
    activeOrder: null,
    completedForCurrentListing: false,
  };
}


