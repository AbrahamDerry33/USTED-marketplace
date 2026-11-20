import { describe, it, expect } from 'vitest';
import {
  canSellerTransitionStatus,
  countListingsByCategory,
  countListingsByCondition,
  filterListings,
  isAcademicStudentEmail,
  isAllowedSchoolEmail,
  isValidEmailAddress,
  isValidFirestoreId,
  parseCategoryFilterParam,
  parseConditionFilterParam,
  parseSavedOnlyParam,
  parseSearchQueryParam,
  parseSellerFilterParam,
  parseSortOptionParam,
  stripHtmlTags,
  validateListingForm,
} from '../listingValidation';
import type { Listing } from '../../types/marketplace';

describe('listingValidation helpers', () => {
  it('strips HTML tags from user input', () => {
    expect(stripHtmlTags('  <script>alert(1)</script>Calculus <b>Book</b>  ')).toBe(
      'alert(1)Calculus Book'
    );
  });

  it('accepts any valid email and detects recognized academic emails for Verified Student badge', () => {
    expect(isValidEmailAddress('kwame@gmail.com')).toBe(true);
    expect(isValidEmailAddress('ama@yahoo.com')).toBe(true);
    expect(isValidEmailAddress('kofi@outlook.com')).toBe(true);
    expect(isValidEmailAddress('kwame@st.ug.edu.gh')).toBe(true);
    expect(isValidEmailAddress('bad-email')).toBe(false);

    expect(isAllowedSchoolEmail('kwame@gmail.com', ['st.ug.edu.gh'])).toBe(true);
    expect(isAllowedSchoolEmail('kwame@st.ug.edu.gh', ['st.ug.edu.gh', 'ug.edu.gh'])).toBe(true);

    expect(isAcademicStudentEmail('kwame@st.ug.edu.gh')).toBe(true);
    expect(isAcademicStudentEmail('ama@uew.edu.gh')).toBe(true);
    expect(isAcademicStudentEmail('student@mit.edu')).toBe(true);
    expect(isAcademicStudentEmail('kwame@gmail.com')).toBe(false);
    expect(isAcademicStudentEmail('ama@outlook.com')).toBe(false);
  });

  it('validates listing form bounds and converts GHS to pesewas', () => {
    const valid = validateListingForm(
      {
        title: '<b>TI-84 Plus CE Calculator</b>',
        description: 'Barely used graphing calculator with USB cable.',
        priceGhs: '350.50',
        category: 'electronics',
        condition: 'like_new',
      },
      2
    );
    expect(valid.valid).toBe(true);
    expect(valid.payload?.title).toBe('TI-84 Plus CE Calculator');
    expect(valid.payload?.pricePesewas).toBe(35050);

    const dormValid = validateListingForm(
      {
        title: 'Electric Kettle 1.7L',
        description: 'Clean stainless steel hostel kettle, boils quickly.',
        priceGhs: '140.00',
        category: 'dorm_essentials',
        condition: 'good',
      },
      1
    );
    expect(dormValid.valid).toBe(true);
    expect(dormValid.payload?.category).toBe('dorm_essentials');

    const invalid = validateListingForm(
      {
        title: 'Hi',
        description: 'Short',
        priceGhs: '0.50',
        category: 'electronics',
        condition: 'good',
      },
      0
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.title).toBeTruthy();
    expect(invalid.errors.description).toBeTruthy();
    expect(invalid.errors.priceGhs).toBeTruthy();
    expect(invalid.errors.images).toBeTruthy();
  });

  it('enforces valid seller status transitions and locks removed listings', () => {
    expect(canSellerTransitionStatus('active', 'reserved')).toBe(true);
    expect(canSellerTransitionStatus('active', 'sold')).toBe(true);
    expect(canSellerTransitionStatus('sold', 'removed')).toBe(true);
    expect(canSellerTransitionStatus('removed', 'active')).toBe(false);
  });

  it('filters active listings by keyword, single or multiple categories, and price newest first', () => {
    const sample: Listing[] = [
      {
        id: '1',
        sellerId: 'u1',
        sellerName: 'Kwame',
        title: 'Organic Chemistry Textbook',
        description: 'Hardcover 4th edition in great shape.',
        pricePesewas: 8500,
        category: 'textbooks',
        condition: 'good',
        images: ['https://example.com/1.jpg'],
        status: 'active',
        createdAt: new Date('2026-10-01T10:00:00Z'),
        updatedAt: new Date('2026-10-01T10:00:00Z'),
      },
      {
        id: '2',
        sellerId: 'u2',
        sellerName: 'Ama',
        title: 'HP Pavilion Laptop',
        description: 'Core i5, 16GB RAM, ideal for CS labs.',
        pricePesewas: 320000,
        category: 'electronics',
        condition: 'like_new',
        images: ['https://example.com/2.jpg'],
        status: 'active',
        createdAt: new Date('2026-10-05T10:00:00Z'),
        updatedAt: new Date('2026-10-05T10:00:00Z'),
      },
      {
        id: '3',
        sellerId: 'u3',
        sellerName: 'Kofi',
        title: 'Sold Desk Lamp',
        description: 'LED lamp already sold.',
        pricePesewas: 5000,
        category: 'hostel_furniture',
        condition: 'good',
        images: ['https://example.com/3.jpg'],
        status: 'sold',
        createdAt: new Date('2026-10-06T10:00:00Z'),
        updatedAt: new Date('2026-10-06T10:00:00Z'),
      },
      {
        id: '4',
        sellerId: 'u4',
        sellerName: 'Esi',
        title: 'Rechargeable Hostel Fan',
        description: '16-inch standing fan with backup battery for dorm room.',
        pricePesewas: 24000,
        category: 'dorm_essentials',
        condition: 'like_new',
        images: ['https://example.com/4.jpg'],
        status: 'active',
        createdAt: new Date('2026-10-07T10:00:00Z'),
        updatedAt: new Date('2026-10-07T10:00:00Z'),
      },
      {
        id: '5',
        sellerId: 'u5',
        sellerName: 'Yaw',
        title: 'Canvas Campus Backpack',
        description: 'Padded sleeve fits a 15-inch laptop and textbooks comfortably.',
        pricePesewas: 15000,
        category: 'clothing',
        condition: 'good',
        images: ['https://example.com/5.jpg'],
        status: 'active',
        createdAt: new Date('2026-10-08T10:00:00Z'),
        updatedAt: new Date('2026-10-08T10:00:00Z'),
      },
    ];

    const newest = filterListings(sample, {
      query: '',
      category: 'all',
      minPriceGhs: '',
      maxPriceGhs: '',
    });
    expect(newest.map((l) => l.id)).toEqual(['5', '4', '2', '1']);

    const textbookOnly = filterListings(sample, {
      query: 'chemistry',
      category: 'textbooks',
      minPriceGhs: '50',
      maxPriceGhs: '100',
    });
    expect(textbookOnly.map((l) => l.id)).toEqual(['1']);

    // Multi-word non-contiguous keyword match
    const multiWord = filterListings(sample, {
      query: 'hp laptop',
      minPriceGhs: '',
      maxPriceGhs: '',
    });
    expect(multiWord.map((l) => l.id)).toEqual(['2']);

    // Title match ranks ahead of newer description-only match
    const rankedByTitle = filterListings(sample, {
      query: 'laptop',
      minPriceGhs: '',
      maxPriceGhs: '',
    });
    expect(rankedByTitle.map((l) => l.id)).toEqual(['2', '5']);

    // Combined keyword + category filter narrows results cleanly
    const combinedKeywordCategory = filterListings(sample, {
      query: 'laptop',
      categories: ['electronics'],
      minPriceGhs: '',
      maxPriceGhs: '',
    });
    expect(combinedKeywordCategory.map((l) => l.id)).toEqual(['2']);

    const multiTag = filterListings(sample, {
      query: '',
      categories: ['electronics', 'dorm_essentials'],
      minPriceGhs: '',
      maxPriceGhs: '',
    });
    expect(multiTag.map((l) => l.id)).toEqual(['4', '2']);

    // Price sorting (Low to High and High to Low) with newest-first tie-breaking
    const withSamePrice: Listing[] = [
      ...sample,
      {
        id: '6',
        sellerId: 'u6',
        sellerName: 'Abena',
        title: 'Linear Algebra Notes',
        description: 'Clean spiral bound lecture notes.',
        pricePesewas: 8500,
        category: 'textbooks',
        condition: 'good',
        images: ['https://example.com/6.jpg'],
        status: 'active',
        createdAt: new Date('2026-10-09T10:00:00Z'),
        updatedAt: new Date('2026-10-09T10:00:00Z'),
      },
    ];

    const priceLowToHigh = filterListings(withSamePrice, {
      query: '',
      minPriceGhs: '',
      maxPriceGhs: '',
      sortBy: 'price_asc',
    });
    expect(priceLowToHigh.map((l) => l.id)).toEqual(['6', '1', '5', '4', '2']);

    const priceHighToLow = filterListings(withSamePrice, {
      query: '',
      minPriceGhs: '',
      maxPriceGhs: '',
      sortBy: 'price_desc',
    });
    expect(priceHighToLow.map((l) => l.id)).toEqual(['2', '4', '5', '6', '1']);

    // Price sort overrides search relevance order when explicitly selected
    const searchSortedByPrice = filterListings(sample, {
      query: 'laptop',
      minPriceGhs: '',
      maxPriceGhs: '',
      sortBy: 'price_asc',
    });
    expect(searchSortedByPrice.map((l) => l.id)).toEqual(['5', '2']);

    // Wishlist / saved-only filtering combined with sort and category tags
    const savedSet = new Set(['1', '2', '3', '4']);
    const savedOnlySorted = filterListings(sample, {
      query: '',
      minPriceGhs: '',
      maxPriceGhs: '',
      onlySaved: true,
      favoriteIds: savedSet,
      sortBy: 'price_asc',
    });
    // Excludes sold item ('3') and unsaved item ('5'), sorted low-to-high
    expect(savedOnlySorted.map((l) => l.id)).toEqual(['1', '4', '2']);

    const savedInElectronics = filterListings(sample, {
      query: '',
      categories: ['electronics'],
      minPriceGhs: '',
      maxPriceGhs: '',
      onlySaved: true,
      favoriteIds: ['1', '2'],
    });
    expect(savedInElectronics.map((l) => l.id)).toEqual(['2']);

    // Condition filtering (single and multiple) combined with categories
    const likeNewOnly = filterListings(sample, {
      query: '',
      conditions: ['like_new'],
      minPriceGhs: '',
      maxPriceGhs: '',
    });
    expect(likeNewOnly.map((l) => l.id)).toEqual(['4', '2']);

    const goodElectronicsOrBooks = filterListings(sample, {
      query: '',
      categories: ['textbooks', 'electronics'],
      conditions: ['good'],
      minPriceGhs: '',
      maxPriceGhs: '',
    });
    expect(goodElectronicsOrBooks.map((l) => l.id)).toEqual(['1']);

    // Seller ID filtering (excludes sold listings by that seller)
    const sellerU2Listings = filterListings(sample, {
      query: '',
      sellerId: 'u2',
      minPriceGhs: '',
      maxPriceGhs: '',
    });
    expect(sellerU2Listings.map((l) => l.id)).toEqual(['2']);

    const sellerU3SoldOnly = filterListings(sample, {
      query: '',
      sellerId: 'u3',
      minPriceGhs: '',
      maxPriceGhs: '',
    });
    expect(sellerU3SoldOnly).toEqual([]);

    const counts = countListingsByCategory(sample);
    expect(counts.electronics).toBe(1);
    expect(counts.textbooks).toBe(1);
    expect(counts.dorm_essentials).toBe(1);
    expect(counts.clothing).toBe(1);
    expect(counts.hostel_furniture).toBe(0); // sold listing excluded

    const condCounts = countListingsByCondition(sample);
    expect(condCounts.new).toBe(0);
    expect(condCounts.like_new).toBe(2);
    expect(condCounts.good).toBe(2); // sold 'good' desk lamp excluded
    expect(condCounts.fair).toBe(0);
  });

  it('parses and validates category, condition, seller, search, sort, saved-only, and Firestore ID helpers safely', () => {
    expect(parseCategoryFilterParam('electronics,dorm_essentials,invalid,electronics')).toEqual([
      'electronics',
      'dorm_essentials',
    ]);
    expect(parseCategoryFilterParam(null)).toEqual([]);
    expect(parseCategoryFilterParam('unknown')).toEqual([]);
    expect(parseConditionFilterParam('new,like_new,invalid,new,fair')).toEqual([
      'new',
      'like_new',
      'fair',
    ]);
    expect(parseConditionFilterParam(null)).toEqual([]);
    expect(parseConditionFilterParam('mint')).toEqual([]);
    expect(parseSellerFilterParam('user_abc-123')).toBe('user_abc-123');
    expect(parseSellerFilterParam('../bad/path')).toBeNull();
    expect(parseSellerFilterParam(null)).toBeNull();
    expect(parseSearchQueryParam('hp laptop')).toBe('hp laptop');
    expect(parseSearchQueryParam(null)).toBe('');
    expect(parseSearchQueryParam('a'.repeat(150)).length).toBe(120);
    expect(parseSortOptionParam('price_asc')).toBe('price_asc');
    expect(parseSortOptionParam('price_desc')).toBe('price_desc');
    expect(parseSortOptionParam('newest')).toBe('newest');
    expect(parseSortOptionParam('invalid')).toBe('newest');
    expect(parseSortOptionParam(null)).toBe('newest');
    expect(parseSavedOnlyParam('1')).toBe(true);
    expect(parseSavedOnlyParam('true')).toBe(true);
    expect(parseSavedOnlyParam('0')).toBe(false);
    expect(parseSavedOnlyParam(null)).toBe(false);
    expect(isValidFirestoreId('lst_123-abc')).toBe(true);
    expect(isValidFirestoreId('../bad-id')).toBe(false);
    expect(isValidFirestoreId('')).toBe(false);
    expect(isValidFirestoreId('x'.repeat(129))).toBe(false);
  });
});
