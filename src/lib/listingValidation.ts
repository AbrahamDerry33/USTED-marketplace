import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_LISTING_IMAGES,
  MAX_PRICE_PESEWAS,
  MIN_LISTING_IMAGES,
  MIN_PRICE_PESEWAS,
} from '../config/marketplace';
import type {
  Listing,
  ListingCategory,
  ListingCondition,
  ListingFilterOptions,
  ListingFormValues,
  ListingStatus,
} from '../types/marketplace';
import { ghsToPesewas } from './money';

const VALID_CATEGORIES = new Set<ListingCategory>([
  'textbooks',
  'electronics',
  'hostel_furniture',
  'clothing',
  'services',
  'other',
]);

const VALID_CONDITIONS = new Set<ListingCondition>(['new', 'like_new', 'good', 'fair']);

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

export function isAllowedSchoolEmail(email: string, allowedDomains: string[]): boolean {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) return false;
  const domain = normalized.slice(atIndex + 1);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return false;

  if (allowedDomains.length === 0) {
    // Until the school specifies exact domains, accept valid email addresses
    return true;
  }

  return allowedDomains.some((allowed) => {
    const clean = allowed.trim().toLowerCase().replace(/^@/, '');
    return domain === clean;
  });
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

export function filterListings(listings: Listing[], options: ListingFilterOptions): Listing[] {
  const keyword = stripHtmlTags(options.query).toLowerCase();
  const minPesewas = options.minPriceGhs.trim() ? ghsToPesewas(options.minPriceGhs) : null;
  const maxPesewas = options.maxPriceGhs.trim() ? ghsToPesewas(options.maxPriceGhs) : null;

  return listings
    .filter((item) => {
      if (item.status !== 'active') return false;

      if (options.category !== 'all' && item.category !== options.category) {
        return false;
      }

      if (minPesewas !== null && item.pricePesewas < minPesewas) {
        return false;
      }

      if (maxPesewas !== null && item.pricePesewas > maxPesewas) {
        return false;
      }

      if (keyword) {
        const haystack = `${item.title} ${item.description} ${item.sellerName}`.toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const timeA = a.createdAt ? a.createdAt.getTime() : 0;
      const timeB = b.createdAt ? b.createdAt.getTime() : 0;
      return timeB - timeA;
    });
}
