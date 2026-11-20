import type { Listing, ListingFormValues } from '../../types/marketplace';

let listingCounter = 1;

export function createMockListing(overrides: Partial<Listing> = {}): Listing {
  const index = listingCounter++;
  const baseDate = new Date(`2026-11-${String((index % 28) + 1).padStart(2, '0')}T10:00:00Z`);

  return {
    id: `lst-${index}`,
    sellerId: `seller-${index}`,
    sellerName: `Student Seller ${index}`,
    title: `Campus Textbook Edition ${index}`,
    description: 'Clean gently used university textbook with intact cover and minimal notes.',
    pricePesewas: 12000,
    category: 'textbooks',
    condition: 'good',
    images: [`https://firebasestorage.googleapis.com/v0/b/demo/o/item-${index}.jpg?alt=media`],
    status: 'active',
    createdAt: baseDate,
    updatedAt: baseDate,
    ...overrides,
  };
}

export function createMockListingFormValues(
  overrides: Partial<ListingFormValues> = {}
): ListingFormValues {
  return {
    title: 'Casio FX-991EX Scientific Calculator',
    description: 'Barely used engineering calculator with protective slide cover.',
    priceGhs: '185.00',
    category: 'electronics',
    condition: 'like_new',
    ...overrides,
  };
}

export function createMockImageFile(options: {
  name?: string;
  type?: string;
  sizeBytes?: number;
} = {}): File {
  const { name = 'photo.jpg', type = 'image/jpeg', sizeBytes = 256_000 } = options;
  const file = new File(['image-bytes'], name, { type });
  Object.defineProperty(file, 'size', {
    value: sizeBytes,
    configurable: true,
  });
  return file;
}
