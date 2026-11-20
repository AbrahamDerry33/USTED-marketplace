import type { FavoriteItem, Listing, Order, OrderStatus } from '../types/marketplace';

export type DashboardTab = 'buyer' | 'seller';

export type BuyerOrderFilter = 'all' | 'active' | 'completed' | 'closed';

export type SellerOrderFilter = 'all' | 'action_needed' | 'in_transit' | 'completed' | 'closed';

export interface OrderStatusMeta {
  label: string;
  badgeClass: string;
  group: 'active' | 'completed' | 'closed';
}

export const ORDER_STATUS_META: Record<OrderStatus, OrderStatusMeta> = {
  pending_payment: {
    label: 'Pending Payment',
    badgeClass: 'bg-stone-100 text-zinc-900 border-stone-400',
    group: 'active',
  },
  payment_submitted: {
    label: 'Payment Submitted',
    badgeClass: 'bg-amber-50 text-amber-950 border-amber-600',
    group: 'active',
  },
  paid: {
    label: 'Paid',
    badgeClass: 'bg-emerald-50 text-emerald-950 border-emerald-600',
    group: 'active',
  },
  shipped: {
    label: 'Shipped',
    badgeClass: 'bg-sky-50 text-sky-950 border-sky-600',
    group: 'active',
  },
  completed: {
    label: 'Completed',
    badgeClass: 'bg-emerald-900 text-white border-emerald-950',
    group: 'completed',
  },
  cancelled: {
    label: 'Cancelled',
    badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-400',
    group: 'closed',
  },
  disputed: {
    label: 'Disputed',
    badgeClass: 'bg-red-50 text-red-950 border-red-600',
    group: 'closed',
  },
  refunded: {
    label: 'Refunded',
    badgeClass: 'bg-slate-100 text-slate-900 border-slate-500',
    group: 'closed',
  },
};

const BUYER_ACTIVE_STATUSES = new Set<OrderStatus>([
  'pending_payment',
  'payment_submitted',
  'paid',
  'shipped',
]);

const BUYER_SPENT_STATUSES = new Set<OrderStatus>(['paid', 'shipped', 'completed']);

const SELLER_ESCROW_STATUSES = new Set<OrderStatus>(['paid', 'shipped']);

function isActionableMeetupOrder(order: Order): boolean {
  return (
    order.status === 'pending_payment' &&
    (order.paymentMethod === 'pay_on_meetup' || order.paymentStatus === 'pay_on_meetup')
  );
}

function isReceiptVerificationOrder(order: Order): boolean {
  return order.status === 'payment_submitted' || order.paymentStatus === 'proof_submitted';
}

export interface BuyerDashboardSummary {
  activeOrdersCount: number;
  completedOrdersCount: number;
  totalSpentPesewas: number;
  savedItemsCount: number;
  awaitingConfirmationCount: number;
}

export interface SellerDashboardSummary {
  netEarningsReleasedPesewas: number;
  releasedCommissionPesewas: number;
  releasedOrdersCount: number;
  pendingEscrowPesewas: number;
  pendingEscrowOrdersCount: number;
  actionNeededCount: number;
  receiptsToVerifyCount: number;
  ordersToShipCount: number;
  meetupHandoversPendingCount: number;
  activeListingsCount: number;
  reservedListingsCount: number;
  soldListingsCount: number;
  totalListingsCount: number;
}

function toSafeWholePesewas(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function parseDashboardTab(raw: string | null | undefined): DashboardTab {
  return raw?.trim().toLowerCase() === 'seller' ? 'seller' : 'buyer';
}

export function filterBuyerOrders(orders: Order[], filter: BuyerOrderFilter): Order[] {
  if (filter === 'all') return orders;
  return orders.filter((order) => ORDER_STATUS_META[order.status]?.group === filter);
}

export function summarizeBuyerDashboard(
  buyerOrders: Order[],
  favorites: FavoriteItem[]
): BuyerDashboardSummary {
  let activeOrdersCount = 0;
  let completedOrdersCount = 0;
  let totalSpentPesewas = 0;
  let awaitingConfirmationCount = 0;

  for (const order of buyerOrders) {
    if (BUYER_ACTIVE_STATUSES.has(order.status)) {
      activeOrdersCount += 1;
    }
    if (order.status === 'completed') {
      completedOrdersCount += 1;
    }
    if (order.status === 'shipped') {
      awaitingConfirmationCount += 1;
    }
    if (BUYER_SPENT_STATUSES.has(order.status)) {
      totalSpentPesewas += toSafeWholePesewas(order.amountPesewas);
    }
  }

  return {
    activeOrdersCount,
    completedOrdersCount,
    totalSpentPesewas,
    savedItemsCount: favorites.length,
    awaitingConfirmationCount,
  };
}

export function summarizeSellerDashboard(
  sellerOrders: Order[],
  sellerListings: Listing[]
): SellerDashboardSummary {
  let netEarningsReleasedPesewas = 0;
  let releasedCommissionPesewas = 0;
  let releasedOrdersCount = 0;
  let pendingEscrowPesewas = 0;
  let pendingEscrowOrdersCount = 0;
  let receiptsToVerifyCount = 0;
  let ordersToShipCount = 0;
  let meetupHandoversPendingCount = 0;

  for (const order of sellerOrders) {
    const netAmount = toSafeWholePesewas(order.sellerAmountPesewas);
    const commission = toSafeWholePesewas(order.commissionPesewas);

    const isCancelledOrRefunded =
      order.status === 'cancelled' || order.status === 'refunded';

    if (!isCancelledOrRefunded && (order.status === 'completed' || order.released)) {
      netEarningsReleasedPesewas += netAmount;
      releasedCommissionPesewas += commission;
      releasedOrdersCount += 1;
    } else if (SELLER_ESCROW_STATUSES.has(order.status) && !order.released) {
      pendingEscrowPesewas += netAmount;
      pendingEscrowOrdersCount += 1;
    }

    if (isReceiptVerificationOrder(order)) {
      receiptsToVerifyCount += 1;
    } else if (order.status === 'paid') {
      ordersToShipCount += 1;
    } else if (isActionableMeetupOrder(order)) {
      meetupHandoversPendingCount += 1;
    }
  }

  let activeListingsCount = 0;
  let reservedListingsCount = 0;
  let soldListingsCount = 0;

  for (const listing of sellerListings) {
    if (listing.status === 'active') activeListingsCount += 1;
    else if (listing.status === 'reserved') reservedListingsCount += 1;
    else if (listing.status === 'sold') soldListingsCount += 1;
  }

  return {
    netEarningsReleasedPesewas,
    releasedCommissionPesewas,
    releasedOrdersCount,
    pendingEscrowPesewas,
    pendingEscrowOrdersCount,
    actionNeededCount: receiptsToVerifyCount + ordersToShipCount + meetupHandoversPendingCount,
    receiptsToVerifyCount,
    ordersToShipCount,
    meetupHandoversPendingCount,
    activeListingsCount,
    reservedListingsCount,
    soldListingsCount,
    totalListingsCount: sellerListings.filter((l) => l.status !== 'removed').length,
  };
}

/**
 * Returns seller orders requiring immediate action:
 * 1. `payment_submitted` / `proof_submitted` MoMo receipts awaiting seller verification (oldest first)
 * 2. `paid` orders awaiting handover or shipment (oldest first)
 * 3. `pay_on_meetup` orders awaiting physical campus handover PIN confirmation (oldest first)
 */
export function getSellerActionQueue(sellerOrders: Order[]): Order[] {
  const actionOrders = sellerOrders.filter(
    (order) =>
      isReceiptVerificationOrder(order) ||
      order.status === 'paid' ||
      isActionableMeetupOrder(order)
  );

  return [...actionOrders].sort((a, b) => {
    const priorityA = isReceiptVerificationOrder(a) ? 0 : a.status === 'paid' ? 1 : 2;
    const priorityB = isReceiptVerificationOrder(b) ? 0 : b.status === 'paid' ? 1 : 2;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    const timeA =
      (isReceiptVerificationOrder(a)
        ? a.receiptSubmittedAt ?? a.buyerFlaggedPaidAt ?? a.createdAt
        : a.paidAt ?? a.createdAt
      )?.getTime() ?? 0;
    const timeB =
      (isReceiptVerificationOrder(b)
        ? b.receiptSubmittedAt ?? b.buyerFlaggedPaidAt ?? b.createdAt
        : b.paidAt ?? b.createdAt
      )?.getTime() ?? 0;

    return timeA - timeB;
  });
}

export function filterSellerOrders(orders: Order[], filter: SellerOrderFilter): Order[] {
  switch (filter) {
    case 'action_needed':
      return getSellerActionQueue(orders);
    case 'in_transit':
      return orders.filter((order) => order.status === 'shipped');
    case 'completed':
      return orders.filter((order) => order.status === 'completed');
    case 'closed':
      return orders.filter(
        (order) =>
          (order.status === 'pending_payment' && !isActionableMeetupOrder(order)) ||
          order.status === 'cancelled' ||
          order.status === 'disputed' ||
          order.status === 'refunded'
      );
    case 'all':
    default:
      return orders;
  }
}

