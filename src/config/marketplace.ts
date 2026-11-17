import type { ListingCategory, ListingCondition, ListingStatus } from '../types/marketplace';

export const LISTING_CATEGORIES: { value: ListingCategory; label: string }[] = [
  { value: 'textbooks', label: 'Textbooks & Notes' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'hostel_furniture', label: 'Hostel & Furniture' },
  { value: 'clothing', label: 'Clothing & Accessories' },
  { value: 'services', label: 'Student Services' },
  { value: 'other', label: 'Other Essentials' },
];

export const LISTING_CONDITIONS: { value: ListingCondition; label: string }[] = [
  { value: 'new', label: 'Brand New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
];

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  active: 'Active',
  reserved: 'Reserved',
  sold: 'Sold',
  removed: 'Removed',
};

export const CATEGORY_LABEL_MAP: Record<ListingCategory, string> = Object.fromEntries(
  LISTING_CATEGORIES.map((c) => [c.value, c.label])
) as Record<ListingCategory, string>;

export const CONDITION_LABEL_MAP: Record<ListingCondition, string> = Object.fromEntries(
  LISTING_CONDITIONS.map((c) => [c.value, c.label])
) as Record<ListingCondition, string>;

export const MAX_LISTING_IMAGES = 5;
export const MIN_LISTING_IMAGES = 1;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const MIN_PRICE_PESEWAS = 100; // GHS 1.00
export const MAX_PRICE_PESEWAS = 100_000_000; // GHS 1,000,000.00

export function getConfiguredSchoolDomains(): string[] {
  const raw = import.meta.env?.VITE_SCHOOL_EMAIL_DOMAINS ?? '';
  return raw
    .split(',')
    .map((d: string) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}
