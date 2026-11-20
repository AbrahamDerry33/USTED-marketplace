import { describe, expect, it } from 'vitest';
import {
  filterBuyerOrders,
  filterSellerOrders,
  getSellerActionQueue,
  ORDER_STATUS_META,
  parseDashboardTab,
  summarizeBuyerDashboard,
  summarizeSellerDashboard,
} from '../../lib/dashboardSummary';
import { formatGhs } from '../../lib/money';
import type { FavoriteItem, Listing, Order, OrderStatus } from '../../types/marketplace';
import { createMockListing } from '../fixtures/listings';

function createOrder(overrides: Partial<Order> = {}): Order {
  const now = new Date('2026-11-17T10:00:00.000Z');
  return {
    id: 'ord-1',
    listingId: 'lst-1',
    listingTitle: 'Study Desk Lamp',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    currency: 'GHS',
    amountPesewas: 10000,
    commissionBps: 500,
    commissionPesewas: 500,
    sellerAmountPesewas: 9500,
    paystackReference: 'CM-REF-100',
    paymentMethod: 'paystack',
    receiptStatus: 'none',
    receiptSubmittedAt: null,
    buyerFlaggedPaidAt: null,
    status: 'paid',
    released: false,
    createdAt: now,
    updatedAt: now,
    paidAt: now,
    shippedAt: null,
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

describe('Dashboard Tab, Buyer & Seller Summary Logic', () => {
  it('parses dashboard tab query parameters safely with buyer default', () => {
    expect(parseDashboardTab('seller')).toBe('seller');
    expect(parseDashboardTab('  SELLER ')).toBe('seller');
    expect(parseDashboardTab('buyer')).toBe('buyer');
    expect(parseDashboardTab(null)).toBe('buyer');
    expect(parseDashboardTab(undefined)).toBe('buyer');
    expect(parseDashboardTab('admin')).toBe('buyer');
  });

  it('provides distinct labels and badge classes for all 8 order statuses', () => {
    const allStatuses: OrderStatus[] = [
      'pending_payment',
      'payment_submitted',
      'paid',
      'shipped',
      'completed',
      'cancelled',
      'disputed',
      'refunded',
    ];

    for (const status of allStatuses) {
      const meta = ORDER_STATUS_META[status];
      expect(meta).toBeDefined();
      expect(meta.label.length).toBeGreaterThan(2);
      expect(meta.badgeClass.length).toBeGreaterThan(5);
    }
  });

  it('summarizes buyer active orders, completed purchases, exact whole pesewas spent, and filters orders', () => {
    const orders: Order[] = [
      createOrder({ id: 'o1', status: 'pending_payment', amountPesewas: 5000 }),
      createOrder({ id: 'o2', status: 'payment_submitted', amountPesewas: 7500 }),
      createOrder({ id: 'o3', status: 'paid', amountPesewas: 12000 }),
      createOrder({ id: 'o4', status: 'shipped', amountPesewas: 18500 }),
      createOrder({ id: 'o5', status: 'completed', amountPesewas: 9500 }),
      createOrder({ id: 'o6', status: 'cancelled', amountPesewas: 40000 }),
      createOrder({ id: 'o7', status: 'disputed', amountPesewas: 11000 }),
      createOrder({ id: 'o8', status: 'refunded', amountPesewas: 25000 }),
    ];

    const favorites: FavoriteItem[] = [
      { userId: 'buyer-1', listingId: 'lst-a', createdAt: new Date() },
      { userId: 'buyer-1', listingId: 'lst-b', createdAt: new Date() },
      { userId: 'buyer-1', listingId: 'lst-c', createdAt: new Date() },
    ];

    const summary = summarizeBuyerDashboard(orders, favorites);

    expect(summary.activeOrdersCount).toBe(4);
    expect(summary.completedOrdersCount).toBe(1);
    expect(summary.awaitingConfirmationCount).toBe(1);
    expect(Number.isInteger(summary.totalSpentPesewas)).toBe(true);
    expect(summary.totalSpentPesewas).toBe(40000);
    expect(formatGhs(summary.totalSpentPesewas)).toBe('GHS 400.00');
    expect(summary.savedItemsCount).toBe(3);

    expect(filterBuyerOrders(orders, 'all')).toHaveLength(8);
    expect(filterBuyerOrders(orders, 'active')).toHaveLength(4);
    expect(filterBuyerOrders(orders, 'completed')).toHaveLength(1);
    expect(filterBuyerOrders(orders, 'closed')).toHaveLength(3);
  });

  it('summarizes seller net released earnings, pending escrow, action needed counts, and active vs sold listings', () => {
    const sellerOrders: Order[] = [
      createOrder({
        id: 's-completed',
        status: 'completed',
        released: true,
        amountPesewas: 20000,
        commissionPesewas: 1000,
        sellerAmountPesewas: 19000,
      }),
      createOrder({
        id: 's-paid',
        status: 'paid',
        released: false,
        amountPesewas: 10000,
        commissionPesewas: 500,
        sellerAmountPesewas: 9500,
      }),
      createOrder({
        id: 's-shipped',
        status: 'shipped',
        released: false,
        amountPesewas: 30000,
        commissionPesewas: 1500,
        sellerAmountPesewas: 28500,
      }),
      createOrder({
        id: 's-receipt',
        status: 'payment_submitted',
        released: false,
        amountPesewas: 15000,
        commissionPesewas: 750,
        sellerAmountPesewas: 14250,
      }),
      createOrder({
        id: 's-refunded',
        status: 'refunded',
        released: false,
        amountPesewas: 25000,
        commissionPesewas: 1250,
        sellerAmountPesewas: 23750,
      }),
    ];

    const sellerListings: Listing[] = [
      createMockListing({ id: 'l1', status: 'active' }),
      createMockListing({ id: 'l2', status: 'active' }),
      createMockListing({ id: 'l3', status: 'reserved' }),
      createMockListing({ id: 'l4', status: 'sold' }),
      createMockListing({ id: 'l5', status: 'removed' }),
    ];

    const summary = summarizeSellerDashboard(sellerOrders, sellerListings);

    expect(summary.netEarningsReleasedPesewas).toBe(19000);
    expect(summary.releasedCommissionPesewas).toBe(1000);
    expect(summary.releasedOrdersCount).toBe(1);
    expect(formatGhs(summary.netEarningsReleasedPesewas)).toBe('GHS 190.00');

    expect(summary.pendingEscrowPesewas).toBe(38000); // 9500 (paid) + 28500 (shipped)
    expect(summary.pendingEscrowOrdersCount).toBe(2);
    expect(formatGhs(summary.pendingEscrowPesewas)).toBe('GHS 380.00');

    expect(summary.receiptsToVerifyCount).toBe(1);
    expect(summary.ordersToShipCount).toBe(1);
    expect(summary.actionNeededCount).toBe(2);

    expect(summary.activeListingsCount).toBe(2);
    expect(summary.reservedListingsCount).toBe(1);
    expect(summary.soldListingsCount).toBe(1);
    expect(summary.totalListingsCount).toBe(4); // excludes removed
  });

  it('prioritizes payment_submitted receipts before paid orders in the seller action queue, oldest first', () => {
    const orders: Order[] = [
      createOrder({
        id: 'paid-newer',
        status: 'paid',
        paidAt: new Date('2026-11-17T14:00:00.000Z'),
      }),
      createOrder({
        id: 'receipt-newer',
        status: 'payment_submitted',
        receiptSubmittedAt: new Date('2026-11-17T12:00:00.000Z'),
      }),
      createOrder({
        id: 'paid-older',
        status: 'paid',
        paidAt: new Date('2026-11-16T09:00:00.000Z'),
      }),
      createOrder({
        id: 'receipt-older',
        status: 'payment_submitted',
        receiptSubmittedAt: new Date('2026-11-16T08:00:00.000Z'),
      }),
      createOrder({
        id: 'already-shipped',
        status: 'shipped',
      }),
    ];

    const queue = getSellerActionQueue(orders);
    expect(queue.map((o) => o.id)).toEqual([
      'receipt-older',
      'receipt-newer',
      'paid-older',
      'paid-newer',
    ]);

    expect(filterSellerOrders(orders, 'action_needed')).toHaveLength(4);
    expect(filterSellerOrders(orders, 'in_transit')).toHaveLength(1);
  });

  it('returns zeroed metrics for new users with no orders or listings', () => {
    expect(summarizeBuyerDashboard([], [])).toEqual({
      activeOrdersCount: 0,
      completedOrdersCount: 0,
      totalSpentPesewas: 0,
      savedItemsCount: 0,
      awaitingConfirmationCount: 0,
    });

    expect(summarizeSellerDashboard([], [])).toEqual({
      netEarningsReleasedPesewas: 0,
      releasedCommissionPesewas: 0,
      releasedOrdersCount: 0,
      pendingEscrowPesewas: 0,
      pendingEscrowOrdersCount: 0,
      actionNeededCount: 0,
      receiptsToVerifyCount: 0,
      ordersToShipCount: 0,
      meetupHandoversPendingCount: 0,
      activeListingsCount: 0,
      reservedListingsCount: 0,
      soldListingsCount: 0,
      totalListingsCount: 0,
    });
  });
});
