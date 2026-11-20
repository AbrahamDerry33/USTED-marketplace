import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  MAX_LISTING_IMAGES,
  MAX_PRICE_PESEWAS,
  MIN_PRICE_PESEWAS,
} from '../../config/marketplace';
import {
  canSellerTransitionStatus,
  countListingsByCategory,
  countListingsByCondition,
  filterListings,
  isValidFirestoreId,
  parseCategoryFilterParam,
  parseConditionFilterParam,
  parseSavedOnlyParam,
  parseSortOptionParam,
  stripHtmlTagsPreserveNewlines,
  validateImageFiles,
  validateListingForm,
} from '../../lib/listingValidation';
import {
  createMockImageFile,
  createMockListing,
  createMockListingFormValues,
} from '../fixtures/listings';

describe('Listings Business Logic', () => {
  describe('form validation & sanitization', () => {
    it('sanitizes title/description, preserves paragraph breaks, and converts GHS to integer pesewas', () => {
      const form = createMockListingFormValues({
        title: '  <b>MacBook Air M1</b> 256GB  ',
        description: '  Great battery health.\n\n\nIncludes <i>original</i> charger.  ',
        priceGhs: '4250.75',
        category: 'electronics',
        condition: 'like_new',
      });

      const result = validateListingForm(form, 3);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
      expect(result.payload).toEqual({
        title: 'MacBook Air M1 256GB',
        description: 'Great battery health.\n\nIncludes original charger.',
        pricePesewas: 425075,
        category: 'electronics',
        condition: 'like_new',
      });
    });

    it('enforces exact minimum and maximum price boundaries in pesewas', () => {
      const minAllowed = validateListingForm(
        createMockListingFormValues({ priceGhs: (MIN_PRICE_PESEWAS / 100).toFixed(2) }),
        1
      );
      expect(minAllowed.valid).toBe(true);
      expect(minAllowed.payload?.pricePesewas).toBe(MIN_PRICE_PESEWAS);

      const maxAllowed = validateListingForm(
        createMockListingFormValues({ priceGhs: (MAX_PRICE_PESEWAS / 100).toFixed(2) }),
        1
      );
      expect(maxAllowed.valid).toBe(true);
      expect(maxAllowed.payload?.pricePesewas).toBe(MAX_PRICE_PESEWAS);

      const belowMin = validateListingForm(createMockListingFormValues({ priceGhs: '0.99' }), 1);
      expect(belowMin.valid).toBe(false);
      expect(belowMin.errors.priceGhs).toBeTruthy();

      const aboveMax = validateListingForm(
        createMockListingFormValues({ priceGhs: '1000000.01' }),
        1
      );
      expect(aboveMax.valid).toBe(false);
      expect(aboveMax.errors.priceGhs).toBeTruthy();

      const tooManyDecimals = validateListingForm(
        createMockListingFormValues({ priceGhs: '12.345' }),
        1
      );
      expect(tooManyDecimals.valid).toBe(false);
      expect(tooManyDecimals.errors.priceGhs).toBeTruthy();
    });

    it('collapses excessive blank lines while preserving intentional line breaks', () => {
      const cleaned = stripHtmlTagsPreserveNewlines('Line 1\n\n\n\nLine 2\n  <p>Line 3</p>  ');
      expect(cleaned).toBe('Line 1\n\nLine 2\n Line 3');
    });
  });

  describe('image upload constraints', () => {
    it('accepts valid JPEG, PNG, and WebP photos within the 5-image and 5 MB limits', () => {
      const files = [
        createMockImageFile({ name: 'front.jpg', type: 'image/jpeg', sizeBytes: 1_000_000 }),
        createMockImageFile({ name: 'side.png', type: 'image/png', sizeBytes: 2_000_000 }),
        createMockImageFile({ name: 'detail.webp', type: 'image/webp', sizeBytes: MAX_IMAGE_BYTES }),
      ];

      expect(validateImageFiles(files, 2)).toBeNull();
    });

    it('rejects missing photos, excess photo counts, unsupported MIME types, and oversized files', () => {
      expect(validateImageFiles([], 0)).toMatch(/at least 1 photo/i);

      const oneMore = [createMockImageFile()];
      expect(validateImageFiles(oneMore, MAX_LISTING_IMAGES)).toMatch(/up to 5 photos/i);

      const gifFile = [createMockImageFile({ name: 'anim.gif', type: 'image/gif' })];
      expect(validateImageFiles(gifFile, 0)).toMatch(/JPEG, PNG, or WebP/i);

      const emptyFile = [createMockImageFile({ name: 'empty.jpg', sizeBytes: 0 })];
      expect(validateImageFiles(emptyFile, 0)).toMatch(/5 MB/i);

      const oversizedFile = [
        createMockImageFile({ name: 'raw.png', type: 'image/png', sizeBytes: MAX_IMAGE_BYTES + 1 }),
      ];
      expect(validateImageFiles(oversizedFile, 0)).toMatch(/5 MB/i);
    });
  });

  describe('seller status transitions', () => {
    it('permits valid lifecycle transitions and permanently locks removed listings', () => {
      expect(canSellerTransitionStatus('active', 'active')).toBe(true);
      expect(canSellerTransitionStatus('active', 'reserved')).toBe(true);
      expect(canSellerTransitionStatus('active', 'sold')).toBe(true);
      expect(canSellerTransitionStatus('active', 'removed')).toBe(true);

      expect(canSellerTransitionStatus('reserved', 'active')).toBe(true);
      expect(canSellerTransitionStatus('reserved', 'sold')).toBe(true);
      expect(canSellerTransitionStatus('reserved', 'removed')).toBe(true);

      expect(canSellerTransitionStatus('sold', 'active')).toBe(true);
      expect(canSellerTransitionStatus('sold', 'reserved')).toBe(false);
      expect(canSellerTransitionStatus('sold', 'removed')).toBe(true);

      expect(canSellerTransitionStatus('removed', 'active')).toBe(false);
      expect(canSellerTransitionStatus('removed', 'reserved')).toBe(false);
      expect(canSellerTransitionStatus('removed', 'sold')).toBe(false);
      expect(canSellerTransitionStatus('removed', 'removed')).toBe(false);
    });
  });

  describe('catalog filtering, facet counts, and URL parameter parsing', () => {
    it('filters active items across search, category, condition, seller, wishlist, and sort order', () => {
      const items = [
        createMockListing({
          id: 'item-a',
          sellerId: 'seller-kwame',
          title: 'Study Desk Lamp',
          description: 'Warm LED light for dorm desk.',
          category: 'dorm_essentials',
          condition: 'like_new',
          pricePesewas: 9500,
          createdAt: new Date('2026-11-01T10:00:00Z'),
        }),
        createMockListing({
          id: 'item-b',
          sellerId: 'seller-kwame',
          title: 'Mini Fridge 90L',
          description: 'Quiet hostel fridge with lamp inside.',
          category: 'dorm_essentials',
          condition: 'good',
          pricePesewas: 78000,
          createdAt: new Date('2026-11-05T10:00:00Z'),
        }),
        createMockListing({
          id: 'item-c',
          sellerId: 'seller-ama',
          title: 'Reserved Desk Lamp',
          description: 'Should be excluded because status is reserved.',
          category: 'dorm_essentials',
          condition: 'new',
          pricePesewas: 6000,
          status: 'reserved',
          createdAt: new Date('2026-11-06T10:00:00Z'),
        }),
      ];

      // Title match ('item-a') ranks ahead of newer description-only match ('item-b')
      const searchMatches = filterListings(items, {
        query: 'lamp',
        minPriceGhs: '',
        maxPriceGhs: '',
      });
      expect(searchMatches.map((l) => l.id)).toEqual(['item-a', 'item-b']);

      // Combined seller + condition + saved-only filter
      const narrowed = filterListings(items, {
        query: '',
        sellerId: 'seller-kwame',
        conditions: ['good', 'fair'],
        onlySaved: true,
        favoriteIds: new Set(['item-b', 'item-c']),
        minPriceGhs: '500',
        maxPriceGhs: '900',
        sortBy: 'price_desc',
      });
      expect(narrowed.map((l) => l.id)).toEqual(['item-b']);

      // Facet counts ignore non-active listings
      const catCounts = countListingsByCategory(items);
      expect(catCounts.dorm_essentials).toBe(2);

      const condCounts = countListingsByCondition(items);
      expect(condCounts.new).toBe(0);
      expect(condCounts.like_new).toBe(1);
      expect(condCounts.good).toBe(1);
    });

    it('sanitizes URL query parameters and Firestore identifiers safely', () => {
      expect(parseCategoryFilterParam('electronics,textbooks,bogus,electronics')).toEqual([
        'electronics',
        'textbooks',
      ]);
      expect(parseConditionFilterParam('new,fair,mint')).toEqual(['new', 'fair']);
      expect(parseSortOptionParam('price_asc')).toBe('price_asc');
      expect(parseSortOptionParam('unsupported')).toBe('newest');
      expect(parseSavedOnlyParam('1')).toBe(true);
      expect(parseSavedOnlyParam('false')).toBe(false);
      expect(isValidFirestoreId('valid_doc-123')).toBe(true);
      expect(isValidFirestoreId('bad/path')).toBe(false);
    });
  });
});
