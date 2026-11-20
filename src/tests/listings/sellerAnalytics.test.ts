import { describe, expect, it } from 'vitest';
import {
  buildWeeklySalesPerformance,
  formatCompactGhsAxis,
  getWeekStartUtc,
} from '../../lib/sellerAnalytics';
import type { Order } from '../../types/marketplace';

function createMockOrder(overrides: Partial<Order> = {}): Order {
  const createdAt = overrides.createdAt ?? new Date('2026-11-16T10:00:00.000Z');
  return {
    id: 'ord-1',
    listingId: 'lst-1',
    listingTitle: 'Graphing Calculator',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    currency: 'GHS',
    amountPesewas: 25000,
    commissionBps: 500,
    commissionPesewas: 1250,
    sellerAmountPesewas: 23750,
    paystackReference: 'CM-REF-001',
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

describe('Seller Weekly Sales Analytics', () => {
  it('normalizes dates across the week to Monday 00:00 UTC', () => {
    // 2026-11-18 is a Wednesday; Monday of that week is 2026-11-16
    expect(getWeekStartUtc(new Date('2026-11-18T14:35:00.000Z')).toISOString()).toBe(
      '2026-11-16T00:00:00.000Z'
    );
    // 2026-11-22 is a Sunday; Monday of that week is still 2026-11-16
    expect(getWeekStartUtc(new Date('2026-11-22T23:59:59.000Z')).toISOString()).toBe(
      '2026-11-16T00:00:00.000Z'
    );
  });

  it('returns contiguous zero-filled weekly slots when there are no orders', () => {
    const now = new Date('2026-11-18T12:00:00.000Z');
    const result = buildWeeklySalesPerformance([], { weeks: 4, scope: 'confirmed', now });

    expect(result.points).toHaveLength(4);
    expect(result.points.map((p) => p.weekKey)).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
    ]);
    expect(result.totalSalesPesewas).toBe(0);
    expect(result.totalNetPayoutPesewas).toBe(0);
    expect(result.totalOrders).toBe(0);
    expect(result.averageOrderPesewas).toBe(0);
    expect(result.peakWeek).toBeNull();
    expect(result.weekOverWeekDeltaPercent).toBeNull();
  });

  it('aggregates weekly sales in exact pesewas, orders count, peak week, and WoW delta', () => {
    const now = new Date('2026-11-18T12:00:00.000Z');
    const orders: Order[] = [
      // Prior week (2026-11-09): 2 confirmed orders totaling GHS 200.00
      createMockOrder({
        id: 'ord-prev-1',
        amountPesewas: 12000,
        sellerAmountPesewas: 11400,
        status: 'completed',
        paidAt: new Date('2026-11-10T09:00:00.000Z'),
      }),
      createMockOrder({
        id: 'ord-prev-2',
        amountPesewas: 8000,
        sellerAmountPesewas: 7600,
        status: 'shipped',
        paidAt: new Date('2026-11-13T16:00:00.000Z'),
      }),
      // Current week (2026-11-16): 1 confirmed order totaling GHS 300.00 (+50% WoW)
      createMockOrder({
        id: 'ord-curr-1',
        amountPesewas: 30000,
        sellerAmountPesewas: 28500,
        status: 'paid',
        paidAt: new Date('2026-11-17T11:00:00.000Z'),
      }),
      // Cancelled order should always be ignored
      createMockOrder({
        id: 'ord-cancelled',
        amountPesewas: 50000,
        sellerAmountPesewas: 47500,
        status: 'cancelled',
        paidAt: null,
        createdAt: new Date('2026-11-17T15:00:00.000Z'),
      }),
      // Pending payment order ignored under 'confirmed' scope
      createMockOrder({
        id: 'ord-pending',
        amountPesewas: 15000,
        sellerAmountPesewas: 14250,
        status: 'pending_payment',
        paidAt: null,
        createdAt: new Date('2026-11-18T08:00:00.000Z'),
      }),
    ];

    const confirmed = buildWeeklySalesPerformance(orders, {
      weeks: 4,
      scope: 'confirmed',
      now,
    });

    expect(confirmed.totalOrders).toBe(3);
    expect(confirmed.totalSalesPesewas).toBe(50000);
    expect(confirmed.totalNetPayoutPesewas).toBe(47500);
    expect(confirmed.averageOrderPesewas).toBe(16667);
    expect(confirmed.peakWeek?.weekKey).toBe('2026-11-16');
    expect(confirmed.weekOverWeekDeltaPercent).toBe(50);

    const prevWeek = confirmed.points.find((p) => p.weekKey === '2026-11-09')!;
    expect(prevWeek.ordersCount).toBe(2);
    expect(prevWeek.totalSalesGhs).toBe(200);

    const currWeek = confirmed.points.find((p) => p.weekKey === '2026-11-16')!;
    expect(currWeek.ordersCount).toBe(1);
    expect(currWeek.totalSalesGhs).toBe(300);

    // Under 'all_active', pending_payment is included while cancelled remains excluded
    const allActive = buildWeeklySalesPerformance(orders, {
      weeks: 4,
      scope: 'all_active',
      now,
    });
    expect(allActive.totalOrders).toBe(4);
    expect(allActive.totalSalesPesewas).toBe(65000);
  });

  it('formats compact GHS Y-axis ticks cleanly', () => {
    expect(formatCompactGhsAxis(0)).toBe('GHS 0');
    expect(formatCompactGhsAxis(450)).toBe('GHS 450');
    expect(formatCompactGhsAxis(1000)).toBe('GHS 1k');
    expect(formatCompactGhsAxis(2450)).toBe('GHS 2.5k');
  });
});
