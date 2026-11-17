import { describe, it, expect } from 'vitest';
import {
  canSellerTransitionStatus,
  filterListings,
  isAllowedSchoolEmail,
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

  it('validates allowed school email domains when configured', () => {
    expect(isAllowedSchoolEmail('kwame@st.ug.edu.gh', ['st.ug.edu.gh', 'ug.edu.gh'])).toBe(true);
    expect(isAllowedSchoolEmail('kwame@gmail.com', ['st.ug.edu.gh'])).toBe(false);
    expect(isAllowedSchoolEmail('bad-email', [])).toBe(false);
    expect(isAllowedSchoolEmail('kwame@ug.edu.gh', [])).toBe(true);
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

  it('filters active listings by keyword, category, and price newest first', () => {
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
    ];

    const newest = filterListings(sample, {
      query: '',
      category: 'all',
      minPriceGhs: '',
      maxPriceGhs: '',
    });
    expect(newest.map((l) => l.id)).toEqual(['2', '1']);

    const textbookOnly = filterListings(sample, {
      query: 'chemistry',
      category: 'textbooks',
      minPriceGhs: '50',
      maxPriceGhs: '100',
    });
    expect(textbookOnly.map((l) => l.id)).toEqual(['1']);
  });
});
