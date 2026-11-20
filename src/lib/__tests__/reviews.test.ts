import { describe, expect, it } from 'vitest';
import {
  filterAndSortSellerReviews,
  findCompletedOrderForSeller,
  resolveBuyerReviewEligibility,
  REVIEW_COMMENT_MAX_LENGTH,
  sortSellerReviews,
  summarizeSellerReviews,
  validateSellerReviewInput,
} from '../reviews';
import type { Order, SellerReview } from '../../types/marketplace';

describe('validateSellerReviewInput', () => {
  it('accepts valid rating, sanitized comment, and reviewer name', () => {
    const result = validateSellerReviewInput({
      rating: 5,
      comment: '  <b>Prompt meetup</b> at Balme Library, item matched photos.  ',
      reviewerName: 'Ama Boateng',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      rating: 5,
      comment: 'Prompt meetup at Balme Library, item matched photos.',
      reviewerName: 'Ama Boateng',
    });
  });

  it('rejects out-of-range and non-integer star ratings', () => {
    expect(
      validateSellerReviewInput({
        rating: 0,
        comment: 'Nice textbook condition.',
        reviewerName: 'Kofi',
      }).valid
    ).toBe(false);

    expect(
      validateSellerReviewInput({
        rating: 6,
        comment: 'Nice textbook condition.',
        reviewerName: 'Kofi',
      }).valid
    ).toBe(false);

    expect(
      validateSellerReviewInput({
        rating: 4.5,
        comment: 'Nice textbook condition.',
        reviewerName: 'Kofi',
      }).valid
    ).toBe(false);
  });

  it('rejects comments shorter than 5 chars or exceeding 500 chars', () => {
    const tooShort = validateSellerReviewInput({
      rating: 4,
      comment: '<b>ok</b>',
      reviewerName: 'Kwame',
    });
    expect(tooShort.valid).toBe(false);
    expect(tooShort.errors.comment).toBeTruthy();

    const tooLong = validateSellerReviewInput({
      rating: 4,
      comment: 'a'.repeat(REVIEW_COMMENT_MAX_LENGTH + 1),
      reviewerName: 'Kwame',
    });
    expect(tooLong.valid).toBe(false);
    expect(tooLong.errors.comment).toBeTruthy();
  });

  it('falls back to Campus Student when reviewerName is blank or too short', () => {
    const result = validateSellerReviewInput({
      rating: 3,
      comment: 'Decent desk lamp, worked as expected.',
      reviewerName: ' ',
    });
    expect(result.valid).toBe(true);
    expect(result.payload?.reviewerName).toBe('Campus Student');
  });
});

describe('summarizeSellerReviews', () => {
  it('returns null average and zero counts for empty reviews', () => {
    const summary = summarizeSellerReviews([]);
    expect(summary).toEqual({
      averageRating: null,
      totalCount: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it('computes rounded average and star distribution accurately', () => {
    const reviews: SellerReview[] = [
      {
        sellerId: 'seller1',
        reviewerId: 'u1',
        reviewerName: 'Student A',
        rating: 5,
        comment: 'Smooth pickup at Night Market.',
        createdAt: new Date('2026-11-10T10:00:00Z'),
        updatedAt: new Date('2026-11-10T10:00:00Z'),
      },
      {
        sellerId: 'seller1',
        reviewerId: 'u2',
        reviewerName: 'Student B',
        rating: 5,
        comment: 'Very honest about minor scratches.',
        createdAt: new Date('2026-11-11T10:00:00Z'),
        updatedAt: new Date('2026-11-11T10:00:00Z'),
      },
      {
        sellerId: 'seller1',
        reviewerId: 'u3',
        reviewerName: 'Student C',
        rating: 4,
        comment: 'Good seller, slight delay on pickup time.',
        createdAt: new Date('2026-11-12T10:00:00Z'),
        updatedAt: new Date('2026-11-12T10:00:00Z'),
      },
    ];

    const summary = summarizeSellerReviews(reviews);
    expect(summary.totalCount).toBe(3);
    expect(summary.averageRating).toBe(4.7);
    expect(summary.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 });
  });
});

describe('sortSellerReviews', () => {
  it('pins the current user review first and orders the rest newest-first', () => {
    const reviews: SellerReview[] = [
      {
        sellerId: 'seller1',
        reviewerId: 'older_other',
        reviewerName: 'Older',
        rating: 4,
        comment: 'Older review text.',
        createdAt: new Date('2026-11-01T09:00:00Z'),
        updatedAt: new Date('2026-11-01T09:00:00Z'),
      },
      {
        sellerId: 'seller1',
        reviewerId: 'mine',
        reviewerName: 'Me',
        rating: 5,
        comment: 'My earlier review text.',
        createdAt: new Date('2026-11-02T09:00:00Z'),
        updatedAt: new Date('2026-11-02T09:00:00Z'),
      },
      {
        sellerId: 'seller1',
        reviewerId: 'newest_other',
        reviewerName: 'Newest',
        rating: 5,
        comment: 'Most recent review text.',
        createdAt: new Date('2026-11-15T09:00:00Z'),
        updatedAt: new Date('2026-11-15T09:00:00Z'),
      },
    ];

    const sorted = sortSellerReviews(reviews, 'mine');
    expect(sorted.map((r) => r.reviewerId)).toEqual(['mine', 'newest_other', 'older_other']);
  });

  it('places pending latency-compensated local reviews with null timestamps first among peers', () => {
    const reviews: SellerReview[] = [
      {
        sellerId: 'seller1',
        reviewerId: 'u1',
        reviewerName: 'Earlier',
        rating: 4,
        comment: 'Older review text.',
        createdAt: new Date('2026-11-15T09:00:00Z'),
        updatedAt: new Date('2026-11-15T09:00:00Z'),
      },
      {
        sellerId: 'seller1',
        reviewerId: 'u2',
        reviewerName: 'Just Posted',
        rating: 5,
        comment: 'Freshly submitted feedback.',
        createdAt: null,
        updatedAt: null,
      },
    ];

    const sorted = sortSellerReviews(reviews);
    expect(sorted.map((r) => r.reviewerId)).toEqual(['u2', 'u1']);
  });
});

describe('filterAndSortSellerReviews', () => {
  const sampleReviews: SellerReview[] = [
    {
      sellerId: 'seller1',
      reviewerId: 'u1',
      reviewerName: 'Ama',
      rating: 5,
      comment: 'Great textbook condition.',
      listingId: 'lst-1',
      createdAt: new Date('2026-11-10T10:00:00Z'),
      updatedAt: new Date('2026-11-10T10:00:00Z'),
    },
    {
      sellerId: 'seller1',
      reviewerId: 'u2',
      reviewerName: 'Kojo',
      rating: 2,
      comment: 'Pickup took longer than agreed.',
      listingId: 'lst-2',
      createdAt: new Date('2026-11-12T10:00:00Z'),
      updatedAt: new Date('2026-11-12T10:00:00Z'),
    },
    {
      sellerId: 'seller1',
      reviewerId: 'u3',
      reviewerName: 'Esi',
      rating: 4,
      comment: 'Smooth campus handoff.',
      listingId: 'lst-1',
      createdAt: new Date('2026-11-14T10:00:00Z'),
      updatedAt: new Date('2026-11-14T10:00:00Z'),
    },
  ];

  it('filters by star rating and current listing scope', () => {
    const fiveStar = filterAndSortSellerReviews(sampleReviews, { starFilter: 5 });
    expect(fiveStar.map((r) => r.reviewerId)).toEqual(['u1']);

    const thisListing = filterAndSortSellerReviews(sampleReviews, { listingIdOnly: 'lst-1' });
    expect(thisListing.map((r) => r.reviewerId)).toEqual(['u3', 'u1']);

    const combined = filterAndSortSellerReviews(sampleReviews, {
      starFilter: 4,
      listingIdOnly: 'lst-1',
    });
    expect(combined.map((r) => r.reviewerId)).toEqual(['u3']);
  });

  it('sorts by highest and lowest rating with recency tie-breaking', () => {
    const highest = filterAndSortSellerReviews(sampleReviews, { sortBy: 'highest' });
    expect(highest.map((r) => r.reviewerId)).toEqual(['u1', 'u3', 'u2']);

    const lowest = filterAndSortSellerReviews(sampleReviews, { sortBy: 'lowest' });
    expect(lowest.map((r) => r.reviewerId)).toEqual(['u2', 'u3', 'u1']);
  });
});

function makeTestOrder(overrides: Partial<Order>): Order {
  return {
    id: 'ord-1',
    listingId: 'lst-1',
    listingTitle: 'Calculus Textbook',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    currency: 'GHS',
    amountPesewas: 8500,
    commissionBps: 500,
    commissionPesewas: 425,
    sellerAmountPesewas: 8075,
    paystackReference: 'cm_ord-1',
    paymentMethod: 'paystack',
    receiptStatus: 'none',
    receiptSubmittedAt: null,
    buyerFlaggedPaidAt: null,
    status: 'completed',
    released: true,
    createdAt: new Date('2026-11-10T10:00:00Z'),
    updatedAt: new Date('2026-11-11T10:00:00Z'),
    paidAt: new Date('2026-11-10T10:05:00Z'),
    shippedAt: new Date('2026-11-10T14:00:00Z'),
    completedAt: new Date('2026-11-11T10:00:00Z'),
    cancelledAt: null,
    ...overrides,
  };
}

describe('findCompletedOrderForSeller', () => {
  it('returns null when buyer has no completed order with that seller', () => {
    const orders: Order[] = [
      makeTestOrder({ id: 'ord-paid', status: 'paid' }),
      makeTestOrder({ id: 'ord-shipped', status: 'shipped' }),
      makeTestOrder({ id: 'ord-refunded', status: 'refunded' }),
      makeTestOrder({ id: 'ord-other-seller', sellerId: 'seller-2', status: 'completed' }),
      makeTestOrder({ id: 'ord-other-buyer', buyerId: 'buyer-2', status: 'completed' }),
    ];

    expect(findCompletedOrderForSeller(orders, 'buyer-1', 'seller-1')).toBeNull();
    expect(findCompletedOrderForSeller(orders, 'seller-1', 'seller-1')).toBeNull();
  });

  it('returns the most recently completed order matching both buyer and seller', () => {
    const orders: Order[] = [
      makeTestOrder({
        id: 'ord-older',
        completedAt: new Date('2026-11-05T10:00:00Z'),
      }),
      makeTestOrder({
        id: 'ord-newest',
        completedAt: new Date('2026-11-14T16:30:00Z'),
      }),
      makeTestOrder({
        id: 'ord-shipped',
        status: 'shipped',
        completedAt: null,
        updatedAt: new Date('2026-11-16T10:00:00Z'),
      }),
    ];

    const match = findCompletedOrderForSeller(orders, 'buyer-1', 'seller-1');
    expect(match?.id).toBe('ord-newest');
  });
});

describe('resolveBuyerReviewEligibility', () => {
  it('prioritizes a completed order for the current listing over a newer completed order for another listing', () => {
    const orders: Order[] = [
      makeTestOrder({
        id: 'ord-other-newer',
        listingId: 'lst-other',
        completedAt: new Date('2026-11-18T10:00:00Z'),
      }),
      makeTestOrder({
        id: 'ord-current-listing',
        listingId: 'lst-target',
        completedAt: new Date('2026-11-10T10:00:00Z'),
      }),
    ];

    const result = resolveBuyerReviewEligibility({
      orders,
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      listingId: 'lst-target',
    });

    expect(result.status).toBe('completed_for_listing');
    expect(result.canSubmit).toBe(true);
    expect(result.completedForCurrentListing).toBe(true);
    expect(result.completedOrder?.id).toBe('ord-current-listing');
  });

  it('falls back to completed_for_seller when buyer completed a different item with the same seller', () => {
    const orders: Order[] = [
      makeTestOrder({
        id: 'ord-seller-other',
        listingId: 'lst-other',
        completedAt: new Date('2026-11-15T10:00:00Z'),
      }),
    ];

    const result = resolveBuyerReviewEligibility({
      orders,
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      listingId: 'lst-target',
    });

    expect(result.status).toBe('completed_for_seller');
    expect(result.canSubmit).toBe(true);
    expect(result.completedForCurrentListing).toBe(false);
    expect(result.completedOrder?.id).toBe('ord-seller-other');
  });

  it('identifies in-progress orders and prefers shipped orders for the current listing', () => {
    const orders: Order[] = [
      makeTestOrder({
        id: 'ord-paid-other',
        listingId: 'lst-other',
        status: 'paid',
        completedAt: null,
      }),
      makeTestOrder({
        id: 'ord-shipped-target',
        listingId: 'lst-target',
        status: 'shipped',
        completedAt: null,
      }),
    ];

    const result = resolveBuyerReviewEligibility({
      orders,
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      listingId: 'lst-target',
    });

    expect(result.status).toBe('in_progress');
    expect(result.canSubmit).toBe(false);
    expect(result.activeOrder?.id).toBe('ord-shipped-target');
  });

  it('blocks sellers reviewing themselves, banned users, and buyers with only cancelled/refunded orders', () => {
    expect(
      resolveBuyerReviewEligibility({
        orders: [makeTestOrder({ status: 'completed' })],
        buyerId: 'seller-1',
        sellerId: 'seller-1',
        listingId: 'lst-1',
      })
    ).toMatchObject({ status: 'own_listing', canSubmit: false });

    expect(
      resolveBuyerReviewEligibility({
        orders: [makeTestOrder({ status: 'completed' })],
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        listingId: 'lst-1',
        isBanned: true,
      })
    ).toMatchObject({ status: 'suspended', canSubmit: false });

    expect(
      resolveBuyerReviewEligibility({
        orders: [makeTestOrder({ status: 'cancelled' }), makeTestOrder({ status: 'refunded' })],
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        listingId: 'lst-1',
      })
    ).toMatchObject({ status: 'no_completed_order', canSubmit: false, activeOrder: null });
  });
});


