export type ListingCategory =
  | 'textbooks'
  | 'electronics'
  | 'hostel_furniture'
  | 'dorm_essentials'
  | 'clothing'
  | 'services'
  | 'other';

export type ListingCondition = 'new' | 'like_new' | 'good' | 'fair';

export type ListingStatus = 'active' | 'reserved' | 'sold' | 'removed';

export type MoMoNetwork = 'mtn' | 'telecel' | 'at';

export interface UserPublicProfile {
  uid: string;
  displayName: string;
  campus?: string;
  momoNetwork?: MoMoNetwork;
  momoNumber?: string;
  momoAccountName?: string;
  verifiedStudent?: boolean;
  role: 'student' | 'admin';
  banned: boolean;
  createdAt: Date | null;
}

export interface Listing {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerVerifiedStudent?: boolean;
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

export type ListingSortOption = 'newest' | 'price_asc' | 'price_desc';

export interface FavoriteItem {
  userId: string;
  listingId: string;
  savedTitle?: string;
  savedPricePesewas?: number;
  savedCategory?: ListingCategory;
  createdAt: Date | null;
}

export interface SellerReview {
  sellerId: string;
  reviewerId: string;
  orderId?: string;
  reviewerName: string;
  rating: number;
  comment: string;
  listingId?: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type ListingChatMessageType = 'text' | 'offer';

export type ListingChatSenderRole = 'buyer' | 'seller';

export interface ListingChatThread {
  listingId: string;
  buyerId: string;
  sellerId: string;
  buyerName: string;
  sellerName: string;
  lastMessageText: string;
  lastMessageSenderId: string;
  lastOfferPesewas?: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ListingChatMessage {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  senderId: string;
  senderName: string;
  senderRole: ListingChatSenderRole;
  type: ListingChatMessageType;
  body: string;
  offerPesewas?: number;
  createdAt: Date | null;
}

export interface ListingFilterOptions {
  query: string;
  category?: ListingCategory | 'all';
  categories?: ListingCategory[];
  conditions?: ListingCondition[];
  sellerId?: string | null;
  minPriceGhs: string;
  maxPriceGhs: string;
  sortBy?: ListingSortOption;
  onlySaved?: boolean;
  favoriteIds?: Set<string> | string[];
}

export type NotificationEventType = 'paid' | 'shipped' | 'completed' | 'cancelled';

export interface AppNotification {
  id: string;
  userId: string;
  orderId: string;
  listingId: string;
  eventType: NotificationEventType;
  recipientRole: 'buyer' | 'seller';
  title: string;
  body: string;
  read: boolean;
  createdAt: Date | null;
  readAt: Date | null;
}

export type OrderStatus =
  | 'pending_payment'
  | 'payment_submitted'
  | 'paid'
  | 'shipped'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | 'refunded';

export type LocalPaymentMethod = 'pay_on_meetup' | 'momo_prepayment';

export type PaymentMethod = LocalPaymentMethod | 'paystack' | 'manual_transfer';

export type OrderPaymentStatus =
  | 'unpaid'
  | 'proof_submitted'
  | 'verified'
  | 'pay_on_meetup';

export type ReceiptStatus = 'none' | 'submitted' | 'verified' | 'rejected';

export interface Order {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  sellerId: string;
  currency: 'GHS';
  amountPesewas: number;
  commissionBps: number;
  commissionPesewas: number;
  sellerAmountPesewas: number;
  paystackReference: string;
  paymentMethod: PaymentMethod;
  paymentStatus?: OrderPaymentStatus;
  receiptStatus: ReceiptStatus;
  transactionId?: string;
  manualReference?: string;
  receiptUrl?: string;
  receiptImageUrl?: string;
  receiptNote?: string;
  sellerMoMoNetwork?: MoMoNetwork;
  sellerMoMoNumber?: string;
  sellerMoMoAccountName?: string;
  handoverPinSet?: boolean;
  handoverPin?: string;
  receiptSubmittedAt: Date | null;
  buyerFlaggedPaidAt: Date | null;
  status: OrderStatus;
  released: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  completedAt: Date | null;
  releasedAt?: Date | null;
  cancelledAt: Date | null;
}

