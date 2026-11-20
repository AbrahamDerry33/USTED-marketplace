import {
  CATEGORY_LABEL_MAP,
  CONDITION_LABEL_MAP,
  MAX_PRICE_PESEWAS,
  MIN_PRICE_PESEWAS,
} from '../config/marketplace';
import type { FavoriteItem, Listing, ListingCategory } from '../types/marketplace';
import {
  isValidFirestoreId,
  isValidListingCategory,
  stripHtmlTags,
} from './listingValidation';

export const SAVED_TITLE_MAX_LENGTH = 100;

export interface SavedItemSnapshotInput {
  savedTitle?: string;
  savedPricePesewas?: number;
  savedCategory?: ListingCategory;
}

export interface SanitizedFavoriteWriteFields {
  userId: string;
  listingId: string;
  savedTitle?: string;
  savedPricePesewas?: number;
  savedCategory?: ListingCategory;
}

export type SavedAvailability = 'available' | 'reserved_or_sold' | 'unavailable';
export type SavedAvailabilityFilter = 'all' | 'available' | 'unavailable';
export type SavedSortOption = 'recently_saved' | 'price_asc' | 'price_desc';

export interface ResolvedSavedItem {
  favorite: FavoriteItem;
  listing: Listing | null;
  listingId: string;
  displayTitle: string;
  displayPricePesewas: number | null;
  displayCategory: ListingCategory | null;
  savedPricePesewas: number | null;
  priceDeltaPesewas: number | null;
  hasPriceDrop: boolean;
  availability: SavedAvailability;
  savedAt: Date | null;
}

export interface SavedItemsSummary {
  totalCount: number;
  availableCount: number;
  reservedOrSoldCount: number;
  unavailableCount: number;
  priceDropCount: number;
  availableTotalPesewas: number;
}

export function extractSavedSnapshotFromListing(listing: Listing): SavedItemSnapshotInput {
  const snapshot: SavedItemSnapshotInput = {};

  const cleanTitle = stripHtmlTags(listing.title).slice(0, SAVED_TITLE_MAX_LENGTH);
  if (cleanTitle.length >= 1) {
    snapshot.savedTitle = cleanTitle;
  }

  if (
    Number.isInteger(listing.pricePesewas) &&
    listing.pricePesewas >= MIN_PRICE_PESEWAS &&
    listing.pricePesewas <= MAX_PRICE_PESEWAS
  ) {
    snapshot.savedPricePesewas = listing.pricePesewas;
  }

  if (isValidListingCategory(listing.category)) {
    snapshot.savedCategory = listing.category;
  }

  return snapshot;
}

export function buildSavedFavoriteWriteFields(
  userId: string,
  listingId: string,
  snapshot?: SavedItemSnapshotInput
): SanitizedFavoriteWriteFields {
  if (!isValidFirestoreId(userId) || !isValidFirestoreId(listingId)) {
    throw new Error('Invalid user or listing identifier.');
  }

  const fields: SanitizedFavoriteWriteFields = {
    userId,
    listingId,
  };

  if (snapshot?.savedTitle) {
    const cleanTitle = stripHtmlTags(snapshot.savedTitle).slice(0, SAVED_TITLE_MAX_LENGTH);
    if (cleanTitle.length >= 1) {
      fields.savedTitle = cleanTitle;
    }
  }

  if (
    typeof snapshot?.savedPricePesewas === 'number' &&
    Number.isInteger(snapshot.savedPricePesewas) &&
    snapshot.savedPricePesewas >= MIN_PRICE_PESEWAS &&
    snapshot.savedPricePesewas <= MAX_PRICE_PESEWAS
  ) {
    fields.savedPricePesewas = snapshot.savedPricePesewas;
  }

  if (snapshot?.savedCategory && isValidListingCategory(snapshot.savedCategory)) {
    fields.savedCategory = snapshot.savedCategory;
  }

  return fields;
}

export function resolveSavedItems(
  favorites: FavoriteItem[],
  listingsById: ReadonlyMap<string, Listing>
): ResolvedSavedItem[] {
  return favorites.map((favorite) => {
    const rawListing = listingsById.get(favorite.listingId) ?? null;
    const isRemoved = !rawListing || rawListing.status === 'removed';
    const listing = isRemoved ? null : rawListing;

    let availability: SavedAvailability = 'unavailable';
    if (listing) {
      availability = listing.status === 'active' ? 'available' : 'reserved_or_sold';
    }

    const savedPricePesewas =
      typeof favorite.savedPricePesewas === 'number' && Number.isInteger(favorite.savedPricePesewas)
        ? favorite.savedPricePesewas
        : null;

    const displayPricePesewas = listing ? listing.pricePesewas : savedPricePesewas;
    const priceDeltaPesewas =
      listing && listing.status === 'active' && savedPricePesewas !== null
        ? listing.pricePesewas - savedPricePesewas
        : null;

    const displayTitle =
      listing?.title || favorite.savedTitle || 'Removed campus listing';

    const displayCategory =
      listing?.category ??
      (favorite.savedCategory && isValidListingCategory(favorite.savedCategory)
        ? favorite.savedCategory
        : null);

    return {
      favorite,
      listing,
      listingId: favorite.listingId,
      displayTitle,
      displayPricePesewas,
      displayCategory,
      savedPricePesewas,
      priceDeltaPesewas,
      hasPriceDrop: priceDeltaPesewas !== null && priceDeltaPesewas < 0,
      availability,
      savedAt: favorite.createdAt,
    };
  });
}

export function filterAndSortSavedItems(
  entries: ResolvedSavedItem[],
  options: {
    query: string;
    availability: SavedAvailabilityFilter;
    sortBy: SavedSortOption;
  }
): ResolvedSavedItem[] {
  const normalizedQuery = stripHtmlTags(options.query).toLowerCase();
  const tokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : [];

  const filtered = entries.filter((entry) => {
    if (options.availability === 'available' && entry.availability !== 'available') {
      return false;
    }
    if (options.availability === 'unavailable' && entry.availability === 'available') {
      return false;
    }

    if (tokens.length > 0) {
      const categoryLabel = entry.displayCategory
        ? CATEGORY_LABEL_MAP[entry.displayCategory]
        : '';
      const conditionLabel = entry.listing
        ? CONDITION_LABEL_MAP[entry.listing.condition]
        : '';
      const haystack = [
        entry.displayTitle,
        entry.listing?.description ?? '',
        entry.listing?.sellerName ?? '',
        categoryLabel,
        conditionLabel,
      ]
        .join(' ')
        .toLowerCase();

      if (!tokens.every((token) => haystack.includes(token))) {
        return false;
      }
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    const savedTimeA = a.savedAt ? a.savedAt.getTime() : Number.MAX_SAFE_INTEGER;
    const savedTimeB = b.savedAt ? b.savedAt.getTime() : Number.MAX_SAFE_INTEGER;

    if (options.sortBy === 'price_asc') {
      const priceA = a.displayPricePesewas ?? Number.MAX_SAFE_INTEGER;
      const priceB = b.displayPricePesewas ?? Number.MAX_SAFE_INTEGER;
      return priceA !== priceB ? priceA - priceB : savedTimeB - savedTimeA;
    }

    if (options.sortBy === 'price_desc') {
      const priceA = a.displayPricePesewas ?? -1;
      const priceB = b.displayPricePesewas ?? -1;
      return priceA !== priceB ? priceB - priceA : savedTimeB - savedTimeA;
    }

    return savedTimeB - savedTimeA;
  });
}

export function summarizeSavedItems(entries: ResolvedSavedItem[]): SavedItemsSummary {
  let availableCount = 0;
  let reservedOrSoldCount = 0;
  let unavailableCount = 0;
  let priceDropCount = 0;
  let availableTotalPesewas = 0;

  for (const entry of entries) {
    if (entry.availability === 'available') {
      availableCount += 1;
      if (entry.listing) {
        availableTotalPesewas += entry.listing.pricePesewas;
      }
      if (entry.hasPriceDrop) {
        priceDropCount += 1;
      }
    } else if (entry.availability === 'reserved_or_sold') {
      reservedOrSoldCount += 1;
    } else {
      unavailableCount += 1;
    }
  }

  return {
    totalCount: entries.length,
    availableCount,
    reservedOrSoldCount,
    unavailableCount,
    priceDropCount,
    availableTotalPesewas,
  };
}
