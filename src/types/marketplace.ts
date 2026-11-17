export type ListingCategory =
  | 'textbooks'
  | 'electronics'
  | 'hostel_furniture'
  | 'clothing'
  | 'services'
  | 'other';

export type ListingCondition = 'new' | 'like_new' | 'good' | 'fair';

export type ListingStatus = 'active' | 'reserved' | 'sold' | 'removed';

export interface UserPublicProfile {
  uid: string;
  displayName: string;
  campus?: string;
  role: 'student' | 'admin';
  banned: boolean;
  createdAt: Date | null;
}

export interface Listing {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  description: string;
  pricePesewas: number;
  category: ListingCategory;
  condition: ListingCondition;
  images: string[];
  status: ListingStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ListingFormValues {
  title: string;
  description: string;
  priceGhs: string;
  category: ListingCategory;
  condition: ListingCondition;
}

export interface ListingFilterOptions {
  query: string;
  category: ListingCategory | 'all';
  minPriceGhs: string;
  maxPriceGhs: string;
}
