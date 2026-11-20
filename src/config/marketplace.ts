import type {
  ListingCategory,
  ListingCondition,
  ListingSortOption,
  ListingStatus,
} from '../types/marketplace';

export const LISTING_SORT_OPTIONS: { value: ListingSortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price (Low to High)' },
  { value: 'price_desc', label: 'Price (High to Low)' },
];

export const LISTING_CATEGORIES: { value: ListingCategory; label: string }[] = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'textbooks', label: 'Books' },
  { value: 'hostel_furniture', label: 'Furniture' },
  { value: 'dorm_essentials', label: 'Dorm Essentials' },
  { value: 'clothing', label: 'Clothing & Accessories' },
  { value: 'services', label: 'Student Services' },
  { value: 'other', label: 'Other' },
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

/**
 * Recognized academic domains eligible for the optional "Verified Student" badge.
 * Any domain ending in `.edu` or `.edu.gh` is also recognized automatically.
 * Non-academic emails (e.g. Gmail, Yahoo, Outlook) are always allowed to register and trade.
 */
export const RECOGNIZED_ACADEMIC_DOMAINS: readonly string[] = [
  'st.ug.edu.gh',
  'ug.edu.gh',
  'st.knust.edu.gh',
  'knust.edu.gh',
  'stu.ucc.edu.gh',
  'ucc.edu.gh',
  'uew.edu.gh',
  'uds.edu.gh',
  'umat.edu.gh',
  'gimpa.edu.gh',
  'upsa.edu.gh',
  'ashesi.edu.gh',
  'atu.edu.gh',
  'ktu.edu.gh',
  'htu.edu.gh',
  'tatu.edu.gh',
];

/**
 * Parses optional extra academic domains from `VITE_SCHOOL_EMAIL_DOMAINS` for
 * awarding the non-blocking "Verified Student" badge. Does not block sign-up or sign-in.
 */
export function getConfiguredSchoolDomains(): string[] {
  const raw = import.meta.env?.VITE_SCHOOL_EMAIL_DOMAINS ?? '';
  return raw
    .split(',')
    .map((d: string) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

/**
 * Formats normalized academic domains into a Firestore Security Rules list expression.
 */
export function formatFirestoreAllowedDomainsList(domains: string[]): string {
  const normalized = Array.from(
    new Set(
      domains
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
    )
  );
  if (normalized.length === 0) return '[]';
  return `[${normalized.map((d) => `'${d}'`).join(', ')}]`;
}

