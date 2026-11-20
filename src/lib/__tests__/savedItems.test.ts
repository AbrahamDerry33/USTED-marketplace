import { describe, expect, it } from 'vitest';
import {
  buildSavedFavoriteWriteFields,
  extractSavedSnapshotFromListing,
  filterAndSortSavedItems,
  resolveSavedItems,
  SAVED_TITLE_MAX_LENGTH,
  summarizeSavedItems,
} from '../savedItems';
import type { FavoriteItem, Listing } from '../../types/marketplace';

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'lst-1',
    sellerId: 'seller-1',
    sellerName: 'Ama Owusu',
    title: 'Engineering Mathematics 7th Ed',
    description: 'Clean textbook with zero highlights.',
    pricePesewas: 12000,
    category: 'textbooks',
    condition: 'like_new',
    images: ['https://firebasestorage.googleapis.com/v0/b/demo/o/book.jpg'],
    status: 'active',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    ...overrides,
  };
}

describe('Saved Items helpers', () => {
  it('sanitizes snapshot fields within Firestore security rule bounds', () => {
    const longTitle = `<b>${'A'.repeat(130)}</b>`;
    const listing = makeListing({
      title: longTitle,
      pricePesewas: 25500,
      category: 'electronics',
    });

    const snapshot = extractSavedSnapshotFromListing(listing);
    expect(snapshot.savedTitle).toHaveLength(SAVED_TITLE_MAX_LENGTH);
    expect(snapshot.savedTitle).not.toContain('<b>');
    expect(snapshot.savedPricePesewas).toBe(25500);
    expect(snapshot.savedCategory).toBe('electronics');

    const writeFields = buildSavedFavoriteWriteFields('user-1', 'lst-1', snapshot);
    expect(writeFields).toEqual({
      userId: 'user-1',
      listingId: 'lst-1',
      savedTitle: 'A'.repeat(100),
      savedPricePesewas: 25500,
      savedCategory: 'electronics',
    });
  });

  it('rejects invalid user or listing IDs and omits out-of-bounds optional snapshot fields', () => {
    expect(() => buildSavedFavoriteWriteFields('../bad', 'lst-1')).toThrow(
      'Invalid user or listing identifier.'
    );
    expect(() => buildSavedFavoriteWriteFields('user-1', 'bad id')).toThrow(
      'Invalid user or listing identifier.'
    );

    const fields = buildSavedFavoriteWriteFields('user-1', 'lst-1', {
      savedTitle: '   ',
      savedPricePesewas: -500,
      savedCategory: 'not_valid' as Listing['category'],
    });
    expect(fields).toEqual({ userId: 'user-1', listingId: 'lst-1' });
  });

  it('resolves live listings, detects price drops, and handles sold and removed items', () => {
    const favorites: FavoriteItem[] = [
      {
        userId: 'user-1',
        listingId: 'lst-drop',
        savedTitle: 'HP Scientific Calculator',
        savedPricePesewas: 15000,
        savedCategory: 'electronics',
        createdAt: new Date('2026-11-10T12:00:00Z'),
      },
      {
        userId: 'user-1',
        listingId: 'lst-sold',
        savedTitle: 'Hostel Mini Fridge',
        savedPricePesewas: 90000,
        savedCategory: 'hostel_furniture',
        createdAt: new Date('2026-11-09T12:00:00Z'),
      },
      {
        userId: 'user-1',
        listingId: 'lst-removed',
        savedTitle: 'Organic Chemistry Notes',
        savedPricePesewas: 4500,
        savedCategory: 'textbooks',
        createdAt: new Date('2026-11-08T12:00:00Z'),
      },
    ];

    const listingsById = new Map<string, Listing>([
      [
        'lst-drop',
        makeListing({
          id: 'lst-drop',
          title: 'HP Scientific Calculator',
          pricePesewas: 11500,
          category: 'electronics',
          status: 'active',
        }),
      ],
      [
        'lst-sold',
        makeListing({
          id: 'lst-sold',
          title: 'Hostel Mini Fridge',
          pricePesewas: 90000,
          category: 'hostel_furniture',
          status: 'sold',
        }),
      ],
    ]);

    const resolved = resolveSavedItems(favorites, listingsById);
    expect(resolved).toHaveLength(3);

    expect(resolved[0].availability).toBe('available');
    expect(resolved[0].hasPriceDrop).toBe(true);
    expect(resolved[0].priceDeltaPesewas).toBe(-3500);

    expect(resolved[1].availability).toBe('reserved_or_sold');
    expect(resolved[1].hasPriceDrop).toBe(false);

    expect(resolved[2].availability).toBe('unavailable');
    expect(resolved[2].displayTitle).toBe('Organic Chemistry Notes');
    expect(resolved[2].displayPricePesewas).toBe(4500);
    expect(resolved[2].displayCategory).toBe('textbooks');

    const summary = summarizeSavedItems(resolved);
    expect(summary).toEqual({
      totalCount: 3,
      availableCount: 1,
      reservedOrSoldCount: 1,
      unavailableCount: 1,
      priceDropCount: 1,
      availableTotalPesewas: 11500,
    });
  });

  it('filters by availability & search query and sorts by recency or price', () => {
    const favorites: FavoriteItem[] = [
      {
        userId: 'user-1',
        listingId: 'lst-a',
        createdAt: new Date('2026-11-01T10:00:00Z'),
      },
      {
        userId: 'user-1',
        listingId: 'lst-b',
        createdAt: new Date('2026-11-03T10:00:00Z'),
      },
      {
        userId: 'user-1',
        listingId: 'lst-c',
        savedTitle: 'Removed Study Desk',
        savedPricePesewas: 20000,
        savedCategory: 'hostel_furniture',
        createdAt: new Date('2026-11-02T10:00:00Z'),
      },
    ];

    const listingsById = new Map<string, Listing>([
      [
        'lst-a',
        makeListing({
          id: 'lst-a',
          title: 'Study Desk Lamp',
          pricePesewas: 6000,
          category: 'dorm_essentials',
        }),
      ],
      [
        'lst-b',
        makeListing({
          id: 'lst-b',
          title: 'USB-C Monitor Hub',
          pricePesewas: 18000,
          category: 'electronics',
        }),
      ],
    ]);

    const resolved = resolveSavedItems(favorites, listingsById);

    const byRecent = filterAndSortSavedItems(resolved, {
      query: '',
      availability: 'all',
      sortBy: 'recently_saved',
    });
    expect(byRecent.map((e) => e.listingId)).toEqual(['lst-b', 'lst-c', 'lst-a']);

    const availableByPriceAsc = filterAndSortSavedItems(resolved, {
      query: '',
      availability: 'available',
      sortBy: 'price_asc',
    });
    expect(availableByPriceAsc.map((e) => e.listingId)).toEqual(['lst-a', 'lst-b']);

    const unavailableOnly = filterAndSortSavedItems(resolved, {
      query: 'desk',
      availability: 'unavailable',
      sortBy: 'recently_saved',
    });
    expect(unavailableOnly.map((e) => e.listingId)).toEqual(['lst-c']);
  });
});
