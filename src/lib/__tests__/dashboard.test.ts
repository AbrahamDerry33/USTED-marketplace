import { describe, expect, it } from 'vitest';
import { calculateOrderSplit } from '../../../functions/src/paymentLogic';
import {
  filterBuyerOrders,
  filterSellerOrders,
  getSellerActionQueue,
  ORDER_STATUS_META,
  parseDashboardTab,
  summarizeBuyerDashboard,
  summarizeSellerDashboard,
} from '../dashboardSummary';
import { formatGhs } from '../money';
import {
  buildWeeklySalesPerformance,
  formatCompactGhsAxis,
  getWeekStartUtc,
} from '../sellerAnalytics';
import type { FavoriteItem, Listing, Order, OrderStatus } from '../../types/marketplace';

function makeOrder(
  overrides: Partial<Order> & { commissionBps?: number } = {}
): Order {
  const createdAt = overrides.createdAt ?? new Date('2026-11-17T10:00:00.000Z');
  const amountPesewas = overrides.amountPesewas ?? 12550;
  const commissionBps = overrides.commissionBps ?? 500;
  const split =
    Number.isInteger(amountPesewas) && amountPesewas >= 100
      ? calculateOrderSplit(amountPesewas, commissionBps)
      : {
          amountPesewas,
          commissionPesewas: 0,
          sellerAmountPesewas: amountPesewas,
        };

  return {
    id: 'ord-dash-1',
    listingId: 'lst-dash-1',
    listingTitle: 'Engineering Mechanics Textbook',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    currency: 'GHS',
    amountPesewas: split.amountPesewas,
    commissionBps,
    commissionPesewas: overrides.commissionPesewas ?? split.commissionPesewas,
    sellerAmountPesewas: overrides.sellerAmountPesewas ?? split.sellerAmountPesewas,
    paystackReference: 'CM-REF-DASH-01',
    paymentMethod: 'paystack',
    receiptStatus: 'none',
    receiptSubmittedAt: null,
    buyerFlaggedPaidAt: null,
    status: 'paid',
    released: false,
    createdAt,
    updatedAt: createdAt,
    paidAt: overrides.paidAt !== undefined ? overrides.paidAt : createdAt,
    shippedAt: null,
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function makeListing(overrides: Partial<Listing> = {}): Listing {
  const now = new Date('2026-11-17T10:00:00.000Z');
  return {
    id: 'lst-1',
    sellerId: 'seller-1',
    sellerName: 'Kwame Mensah',
    title: 'Campus Study Chair',
    description: 'Sturdy foldable study chair in great condition.',
    pricePesewas: 15000,
    category: 'hostel_furniture',
    condition: 'good',
    images: ['https://firebasestorage.googleapis.com/v0/b/demo/o/chair.jpg'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Dashboard Pure Aggregations (GHS/Pesewas, Commission Earnings & Action Filtering)', () => {
  describe('GHS and whole-pesewa totals', () => {
    it('sums buyer spend in exact integer pesewas without floating-point drift', () => {
      const buyerOrders: Order[] = [
        makeOrder({ id: 'b1', status: 'paid', amountPesewas: 1999 }), // GHS 19.99
        makeOrder({ id: 'b2', status: 'shipped', amountPesewas: 2501 }), // GHS 25.01
        makeOrder({ id: 'b3', status: 'completed', amountPesewas: 3333 }), // GHS 33.33
        // Non-settled / closed orders must not count toward spent total
        makeOrder({ id: 'b4', status: 'pending_payment', amountPesewas: 9900 }),
        makeOrder({ id: 'b5', status: 'payment_submitted', amountPesewas: 8800 }),
        makeOrder({ id: 'b6', status: 'cancelled', amountPesewas: 7700 }),
        makeOrder({ id: 'b7', status: 'disputed', amountPesewas: 6600 }),
        makeOrder({ id: 'b8', status: 'refunded', amountPesewas: 5500 }),
      ];
      const favorites: FavoriteItem[] = [
        { userId: 'buyer-1', listingId: 'lst-1', createdAt: new Date() },
        { userId: 'buyer-1', listingId: 'lst-2', createdAt: new Date() },
      ];

      const summary = summarizeBuyerDashboard(buyerOrders, favorites);

      expect(Number.isInteger(summary.totalSpentPesewas)).toBe(true);
      expect(summary.totalSpentPesewas).toBe(7833);
      expect(formatGhs(summary.totalSpentPesewas)).toBe('GHS 78.33');
      expect(summary.activeOrdersCount).toBe(4); // pending_payment, payment_submitted, paid, shipped
      expect(summary.completedOrdersCount).toBe(1);
      expect(summary.awaitingConfirmationCount).toBe(1);
      expect(summary.savedItemsCount).toBe(2);
    });

    it('coerces non-finite or negative pesewa amounts defensively to whole non-negative integers', () => {
      const malformedOrders: Order[] = [
        makeOrder({
          id: 'bad-nan',
          status: 'completed',
          released: true,
          amountPesewas: Number.NaN,
          commissionPesewas: Number.NaN,
          sellerAmountPesewas: Number.NaN,
        }),
        makeOrder({
          id: 'bad-neg',
          status: 'paid',
          released: false,
          amountPesewas: -4000,
          commissionPesewas: -200,
          sellerAmountPesewas: -3800,
        }),
        makeOrder({
          id: 'fractional',
          status: 'completed',
          released: true,
          amountPesewas: 1000.6,
          commissionPesewas: 50.4,
          sellerAmountPesewas: 950.2,
        }),
      ];

      const buyerSummary = summarizeBuyerDashboard(malformedOrders, []);
      expect(buyerSummary.totalSpentPesewas).toBe(1001);
      expect(formatGhs(buyerSummary.totalSpentPesewas)).toBe('GHS 10.01');

      const sellerSummary = summarizeSellerDashboard(malformedOrders, []);
      expect(sellerSummary.netEarningsReleasedPesewas).toBe(950);
      expect(sellerSummary.releasedCommissionPesewas).toBe(50);
      expect(sellerSummary.pendingEscrowPesewas).toBe(0);
    });

    it('buckets weekly GHS sales and order counts across contiguous Monday UTC windows', () => {
      const now = new Date('2026-11-18T12:00:00.000Z'); // Wednesday -> week start 2026-11-16
      expect(getWeekStartUtc(now).toISOString()).toBe('2026-11-16T00:00:00.000Z');

      const orders: Order[] = [
        makeOrder({
          id: 'w-prev-1',
          status: 'completed',
          amountPesewas: 12550, // GHS 125.50
          paidAt: new Date('2026-11-10T09:00:00.000Z'), // week of 2026-11-09
        }),
        makeOrder({
          id: 'w-prev-2',
          status: 'shipped',
          amountPesewas: 7450, // GHS 74.50 -> week total GHS 200.00
          paidAt: new Date('2026-11-15T22:30:00.000Z'), // Sunday of 2026-11-09
        }),
        makeOrder({
          id: 'w-curr-1',
          status: 'paid',
          amountPesewas: 35000, // GHS 350.00 (+75% WoW)
          paidAt: new Date('2026-11-16T00:15:00.000Z'), // Monday of 2026-11-16
        }),
        makeOrder({
          id: 'w-pending',
          status: 'pending_payment',
          amountPesewas: 10000,
          paidAt: null,
          createdAt: new Date('2026-11-17T10:00:00.000Z'),
        }),
        makeOrder({
          id: 'w-cancelled',
          status: 'cancelled',
          amountPesewas: 90000,
          paidAt: null,
          createdAt: new Date('2026-11-17T11:00:00.000Z'),
        }),
      ];

      const confirmed = buildWeeklySalesPerformance(orders, {
        weeks: 4,
        scope: 'confirmed',
        now,
      });

      expect(confirmed.points).toHaveLength(4);
      expect(confirmed.totalOrders).toBe(3);
      expect(confirmed.totalSalesPesewas).toBe(55000);
      expect(formatGhs(confirmed.totalSalesPesewas)).toBe('GHS 550.00');
      expect(confirmed.averageOrderPesewas).toBe(18333);
      expect(confirmed.peakWeek?.weekKey).toBe('2026-11-16');
      expect(confirmed.weekOverWeekDeltaPercent).toBe(75);

      const allActive = buildWeeklySalesPerformance(orders, {
        weeks: 4,
        scope: 'all_active',
        now,
      });
      expect(allActive.totalOrders).toBe(4);
      expect(allActive.totalSalesPesewas).toBe(65000);

      expect(formatCompactGhsAxis(0)).toBe('GHS 0');
      expect(formatCompactGhsAxis(550)).toBe('GHS 550');
      expect(formatCompactGhsAxis(1500)).toBe('GHS 1.5k');
    });
  });

  describe('commission-adjusted seller earnings and escrow separation', () => {
    it('computes net released earnings after commission separately from pending escrow', () => {
      // Exact 5% commission splits from server paymentLogic:
      // 12550 -> commission 628, seller 11922
      // 20000 -> commission 1000, seller 19000
      // 15000 -> commission 750, seller 14250
      // 30000 -> commission 1500, seller 28500
      const sellerOrders: Order[] = [
        makeOrder({
          id: 'rel-completed',
          status: 'completed',
          released: true,
          amountPesewas: 12550,
          commissionBps: 500,
        }),
        makeOrder({
          id: 'rel-flag-only',
          status: 'shipped',
          released: true,
          amountPesewas: 20000,
          commissionBps: 500,
        }),
        makeOrder({
          id: 'escrow-paid',
          status: 'paid',
          released: false,
          amountPesewas: 15000,
          commissionBps: 500,
        }),
        makeOrder({
          id: 'escrow-shipped',
          status: 'shipped',
          released: false,
          amountPesewas: 30000,
          commissionBps: 500,
        }),
        // Cancelled / refunded orders must NEVER count even if released flag were stale
        makeOrder({
          id: 'refunded-stale',
          status: 'refunded',
          released: true,
          amountPesewas: 50000,
          commissionBps: 500,
        }),
        makeOrder({
          id: 'cancelled-stale',
          status: 'cancelled',
          released: true,
          amountPesewas: 40000,
          commissionBps: 500,
        }),
        // Unverified receipt or unpaid order is neither released nor escrow
        makeOrder({
          id: 'receipt-pending',
          status: 'payment_submitted',
          released: false,
          amountPesewas: 18000,
          commissionBps: 500,
        }),
      ];

      const sellerListings: Listing[] = [
        makeListing({ id: 'l-act-1', status: 'active' }),
        makeListing({ id: 'l-act-2', status: 'active' }),
        makeListing({ id: 'l-res-1', status: 'reserved' }),
        makeListing({ id: 'l-sold-1', status: 'sold' }),
        makeListing({ id: 'l-sold-2', status: 'sold' }),
        makeListing({ id: 'l-rem-1', status: 'removed' }),
      ];

      const summary = summarizeSellerDashboard(sellerOrders, sellerListings);

      // Net released: 11922 + 19000 = 30922 pesewas (GHS 309.22)
      expect(summary.netEarningsReleasedPesewas).toBe(30922);
      expect(formatGhs(summary.netEarningsReleasedPesewas)).toBe('GHS 309.22');
      // Commission deducted on released orders: 628 + 1000 = 1628 pesewas
      expect(summary.releasedCommissionPesewas).toBe(1628);
      expect(summary.netEarningsReleasedPesewas + summary.releasedCommissionPesewas).toBe(32550);
      expect(summary.releasedOrdersCount).toBe(2);

      // Pending escrow: 14250 (paid) + 28500 (shipped) = 42750 pesewas (GHS 427.50)
      expect(summary.pendingEscrowPesewas).toBe(42750);
      expect(formatGhs(summary.pendingEscrowPesewas)).toBe('GHS 427.50');
      expect(summary.pendingEscrowOrdersCount).toBe(2);

      // Action needed: 1 receipt_submitted + 1 paid
      expect(summary.receiptsToVerifyCount).toBe(1);
      expect(summary.ordersToShipCount).toBe(1);
      expect(summary.actionNeededCount).toBe(2);

      // Active vs Sold listings
      expect(summary.activeListingsCount).toBe(2);
      expect(summary.reservedListingsCount).toBe(1);
      expect(summary.soldListingsCount).toBe(2);
      expect(summary.totalListingsCount).toBe(5); // excludes removed
    });
  });

  describe('action-needed priority queue and status filtering', () => {
    it('filters strictly to payment_submitted and paid orders, prioritizing receipts oldest-first', () => {
      const orders: Order[] = [
        makeOrder({
          id: 'paid-2',
          status: 'paid',
          paidAt: new Date('2026-11-17T14:00:00.000Z'),
        }),
        makeOrder({
          id: 'receipt-2',
          status: 'payment_submitted',
          receiptSubmittedAt: new Date('2026-11-17T12:00:00.000Z'),
        }),
        makeOrder({
          id: 'paid-1',
          status: 'paid',
          paidAt: new Date('2026-11-16T08:00:00.000Z'),
        }),
        makeOrder({
          id: 'receipt-1-flagged',
          status: 'payment_submitted',
          receiptSubmittedAt: null,
          buyerFlaggedPaidAt: new Date('2026-11-16T06:30:00.000Z'),
        }),
        makeOrder({ id: 'pending-only', status: 'pending_payment' }),
        makeOrder({ id: 'shipped-1', status: 'shipped' }),
        makeOrder({ id: 'completed-1', status: 'completed', released: true }),
        makeOrder({ id: 'cancelled-1', status: 'cancelled' }),
        makeOrder({ id: 'disputed-1', status: 'disputed' }),
        makeOrder({ id: 'refunded-1', status: 'refunded' }),
      ];

      const queue = getSellerActionQueue(orders);
      expect(queue.map((o) => o.id)).toEqual([
        'receipt-1-flagged',
        'receipt-2',
        'paid-1',
        'paid-2',
      ]);

      expect(filterSellerOrders(orders, 'all')).toHaveLength(10);
      expect(filterSellerOrders(orders, 'action_needed').map((o) => o.id)).toEqual([
        'receipt-1-flagged',
        'receipt-2',
        'paid-1',
        'paid-2',
      ]);
      expect(filterSellerOrders(orders, 'in_transit').map((o) => o.id)).toEqual(['shipped-1']);
      expect(filterSellerOrders(orders, 'completed').map((o) => o.id)).toEqual(['completed-1']);
      expect(filterSellerOrders(orders, 'closed').map((o) => o.id)).toEqual([
        'pending-only',
        'cancelled-1',
        'disputed-1',
        'refunded-1',
      ]);

      expect(filterBuyerOrders(orders, 'active')).toHaveLength(6); // pending, 2 receipts, 2 paid, shipped
      expect(filterBuyerOrders(orders, 'completed')).toHaveLength(1);
      expect(filterBuyerOrders(orders, 'closed')).toHaveLength(3); // cancelled, disputed, refunded
    });

    it('covers all 8 order statuses in ORDER_STATUS_META and defaults tab query safely', () => {
      const statuses: OrderStatus[] = [
        'pending_payment',
        'payment_submitted',
        'paid',
        'shipped',
        'completed',
        'cancelled',
        'disputed',
        'refunded',
      ];
      for (const status of statuses) {
        expect(ORDER_STATUS_META[status].label).toBeTruthy();
        expect(ORDER_STATUS_META[status].badgeClass).toBeTruthy();
      }

      expect(parseDashboardTab('seller')).toBe('seller');
      expect(parseDashboardTab('SELLER')).toBe('seller');
      expect(parseDashboardTab('buyer')).toBe('buyer');
      expect(parseDashboardTab('')).toBe('buyer');
      expect(parseDashboardTab(null)).toBe('buyer');
    });
  });
});
