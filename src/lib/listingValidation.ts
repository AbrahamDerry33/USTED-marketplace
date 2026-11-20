import {
  ALLOWED_IMAGE_MIME_TYPES,
  CATEGORY_LABEL_MAP,
  CONDITION_LABEL_MAP,
  MAX_IMAGE_BYTES,
  MAX_LISTING_IMAGES,
  MAX_PRICE_PESEWAS,
  MIN_LISTING_IMAGES,
  MIN_PRICE_PESEWAS,
  RECOGNIZED_ACADEMIC_DOMAINS,
} from '../config/marketplace';
import type {
  Listing,
  ListingCategory,
  ListingCondition,
  ListingFilterOptions,
  ListingFormValues,
  ListingSortOption,
  ListingStatus,
} from '../types/marketplace';
import { ghsToPesewas } from './money';

const VALID_CATEGORIES = new Set<ListingCategory>([
  'textbooks',
  'electronics',
  'hostel_furniture',
  'dorm_essentials',
  'clothing',
  'services',
  'other',
]);

export function isValidListingCategory(value: string): value is ListingCategory {
  return VALID_CATEGORIES.has(value as ListingCategory);
}

export function parseCategoryFilterParam(raw: string | null): ListingCategory[] {
  if (!raw) return [];
  const seen = new Set<ListingCategory>();
  const result: ListingCategory[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (isValidListingCategory(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

export function parseSearchQueryParam(raw: string | null): string {
  if (!raw) return '';
  return raw.slice(0, 120);
}

const FIRESTORE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidFirestoreId(value: string): boolean {
  return FIRESTORE_ID_PATTERN.test(value);
}

export function parseSellerFilterParam(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return isValidFirestoreId(trimmed) ? trimmed : null;
}

const VALID_SORT_OPTIONS = new Set<ListingSortOption>(['newest', 'price_asc', 'price_desc']);

export function parseSortOptionParam(raw: string | null): ListingSortOption {
  if (raw && VALID_SORT_OPTIONS.has(raw as ListingSortOption)) {
    return raw as ListingSortOption;
  }
  return 'newest';
}

export function parseSavedOnlyParam(raw: string | null): boolean {
  return raw === '1' || raw === 'true';
}

const VALID_CONDITIONS = new Set<ListingCondition>(['new', 'like_new', 'good', 'fair']);

export function isValidListingCondition(value: string): value is ListingCondition {
  return VALID_CONDITIONS.has(value as ListingCondition);
}

export function parseConditionFilterParam(raw: string | null): ListingCondition[] {
  if (!raw) return [];
  const seen = new Set<ListingCondition>();
  const result: ListingCondition[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (isValidListingCondition(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

export function stripHtmlTags(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripHtmlTagsPreserveNewlines(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Validates any standard email address (e.g. Gmail, Yahoo, Outlook, or university domains)
 * without restricting registration to institutional school domains.
 */
export function isValidEmailAddress(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized.length < 5 || normalized.length > 254 || /\s/.test(normalized)) {
    return false;
  }
  const atIndex = normalized.indexOf('@');
  if (atIndex <= 0 || atIndex !== normalized.lastIndexOf('@') || atIndex === normalized.length - 1) {
    return false;
  }
  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  if (localPart.length > 64 || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return false;
  }
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) {
    return false;
  }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(domain);
}

/**
 * Returns true if the email belongs to a recognized academic institution
 * (`.edu`, `.edu.gh`, or recognized Ghanaian university domains) for awarding
 * the optional, non-blocking "Verified Student" badge.
 */
export function isAcademicStudentEmail(
  email?: string | null,
  extraAcademicDomains: string[] = []
): boolean {
  if (!email || !isValidEmailAddress(email)) return false;
  const normalized = email.trim().toLowerCase();
  const domain = normalized.slice(normalized.indexOf('@') + 1);

  if (domain.endsWith('.edu.gh') || domain.endsWith('.edu')) {
    return true;
  }
  if (RECOGNIZED_ACADEMIC_DOMAINS.includes(domain)) {
    return true;
  }
  return extraAcademicDomains.some((entry) => {
    const clean = entry.trim().toLowerCase().replace(/^@/, '');
    return clean.length > 0 && domain === clean;
  });
}

/**
 * Registration and sign-in accept any valid email address regardless of domain.
 */
export function isAllowedSchoolEmail(email: string, _allowedDomains: string[] = []): boolean {
  return isValidEmailAddress(email);
}

export function validateImageFiles(files: File[], existingCount = 0): string | null {
  const total = existingCount + files.length;
  if (total < MIN_LISTING_IMAGES) {
    return `Add at least ${MIN_LISTING_IMAGES} photo of your item.`;
  }
  if (total > MAX_LISTING_IMAGES) {
    return `You can upload up to ${MAX_LISTING_IMAGES} photos per listing.`;
  }
  for (const file of files) {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
      return `"${file.name}" must be a JPEG, PNG, or WebP image.`;
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return `"${file.name}" exceeds the 5 MB image size limit.`;
    }
  }
  return null;
}

export interface ValidatedListingPayload {
  title: string;
  description: string;
  pricePesewas: number;
  category: ListingCategory;
  condition: ListingCondition;
}

export function validateListingForm(
  values: ListingFormValues,
  totalImageCount: number
): { valid: boolean; errors: Record<string, string>; payload?: ValidatedListingPayload } {
  const errors: Record<string, string> = {};

  const title = stripHtmlTags(values.title);
  if (title.length < 3 || title.length > 100) {
    errors.title = 'Title must be between 3 and 100 characters.';
  }

  const description = stripHtmlTagsPreserveNewlines(values.description);
  if (description.length < 10 || description.length > 2000) {
    errors.description = 'Description must be between 10 and 2000 characters.';
  }

  const pricePesewas = ghsToPesewas(values.priceGhs);
  if (pricePesewas === null || pricePesewas < MIN_PRICE_PESEWAS || pricePesewas > MAX_PRICE_PESEWAS) {
    errors.priceGhs = 'Enter a valid price between GHS 1.00 and GHS 1,000,000.00 (max 2 decimals).';
  }

  if (!VALID_CATEGORIES.has(values.category)) {
    errors.category = 'Select a valid category.';
  }

  if (!VALID_CONDITIONS.has(values.condition)) {
    errors.condition = 'Select the item condition.';
  }

  if (totalImageCount < MIN_LISTING_IMAGES || totalImageCount > MAX_LISTING_IMAGES) {
    errors.images = `Upload between ${MIN_LISTING_IMAGES} and ${MAX_LISTING_IMAGES} photos.`;
  }

  if (Object.keys(errors).length > 0 || pricePesewas === null) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    payload: {
      title,
      description,
      pricePesewas,
      category: values.category,
      condition: values.condition,
    },
  };
}

export function canSellerTransitionStatus(current: ListingStatus, next: ListingStatus): boolean {
  if (current === 'removed') return false;
  if (current === next) return true;
  const allowed: Record<Exclude<ListingStatus, 'removed'>, ListingStatus[]> = {
    active: ['reserved', 'sold', 'removed'],
    reserved: ['active', 'sold', 'removed'],
    sold: ['active', 'removed'],
  };
  return allowed[current].includes(next);
}

function getSearchRelevanceScore(item: Listing, fullQuery: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const titleLower = item.title.toLowerCase();
  if (titleLower === fullQuery) return 4;
  if (titleLower.includes(fullQuery)) return 3;
  if (tokens.every((token) => titleLower.includes(token))) return 2;
  if (tokens.some((token) => titleLower.includes(token))) return 1;
  return 0;
}

export function filterListings(listings: Listing[], options: ListingFilterOptions): Listing[] {
  const normalizedQuery = stripHtmlTags(options.query).toLowerCase();
  const tokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : [];
  const minPesewas = options.minPriceGhs.trim() ? ghsToPesewas(options.minPriceGhs) : null;
  const maxPesewas = options.maxPriceGhs.trim() ? ghsToPesewas(options.maxPriceGhs) : null;
  const sortBy: ListingSortOption = options.sortBy ?? 'newest';
  const savedSet = options.onlySaved
    ? options.favoriteIds instanceof Set
      ? options.favoriteIds
      : new Set<string>(options.favoriteIds ?? [])
    : null;
  const selectedCategories =
    options.categories && options.categories.length > 0
      ? new Set<ListingCategory>(options.categories)
      : options.category && options.category !== 'all'
        ? new Set<ListingCategory>([options.category])
        : null;
  const selectedConditions =
    options.conditions && options.conditions.length > 0
      ? new Set<ListingCondition>(options.conditions)
      : null;
  const targetSellerId =
    options.sellerId && isValidFirestoreId(options.sellerId.trim())
      ? options.sellerId.trim()
      : null;

  return listings
    .filter((item) => {
      if (item.status !== 'active') return false;

      if (targetSellerId && item.sellerId !== targetSellerId) {
        return false;
      }

      if (savedSet && !savedSet.has(item.id)) {
        return false;
      }

      if (selectedCategories && !selectedCategories.has(item.category)) {
        return false;
      }

      if (selectedConditions && !selectedConditions.has(item.condition)) {
        return false;
      }

      if (minPesewas !== null && item.pricePesewas < minPesewas) {
        return false;
      }

      if (maxPesewas !== null && item.pricePesewas > maxPesewas) {
        return false;
      }

      if (tokens.length > 0) {
        const categoryLabel = CATEGORY_LABEL_MAP[item.category] ?? item.category;
        const conditionLabel = CONDITION_LABEL_MAP[item.condition] ?? item.condition;
        const haystack =
          `${item.title} ${item.description} ${item.sellerName} ${categoryLabel} ${conditionLabel}`.toLowerCase();
        if (!tokens.every((token) => haystack.includes(token))) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const timeA = a.createdAt ? a.createdAt.getTime() : 0;
      const timeB = b.createdAt ? b.createdAt.getTime() : 0;

      if (sortBy === 'price_asc') {
        const priceDiff = a.pricePesewas - b.pricePesewas;
        return priceDiff !== 0 ? priceDiff : timeB - timeA;
      }

      if (sortBy === 'price_desc') {
        const priceDiff = b.pricePesewas - a.pricePesewas;
        return priceDiff !== 0 ? priceDiff : timeB - timeA;
      }

      if (tokens.length > 0) {
        const scoreDiff =
          getSearchRelevanceScore(b, normalizedQuery, tokens) -
          getSearchRelevanceScore(a, normalizedQuery, tokens);
        if (scoreDiff !== 0) return scoreDiff;
      }
      return timeB - timeA;
    });
}

export function countListingsByCategory(listings: Listing[]): Record<ListingCategory, number> {
  const counts: Record<ListingCategory, number> = {
    electronics: 0,
    textbooks: 0,
    hostel_furniture: 0,
    dorm_essentials: 0,
    clothing: 0,
    services: 0,
    other: 0,
  };

  for (const item of listings) {
    if (item.status === 'active' && VALID_CATEGORIES.has(item.category)) {
      counts[item.category] += 1;
    }
  }

  return counts;
}

export function countListingsByCondition(listings: Listing[]): Record<ListingCondition, number> {
  const counts: Record<ListingCondition, number> = {
    new: 0,
    like_new: 0,
    good: 0,
    fair: 0,
  };

  for (const item of listings) {
    if (item.status === 'active' && VALID_CONDITIONS.has(item.condition)) {
      counts[item.condition] += 1;
    }
  }

  return counts;
}
