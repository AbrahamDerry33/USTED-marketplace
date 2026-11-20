import type { Order, OrderStatus } from '../types/marketplace';

export type SalesTimeframeWeeks = 4 | 8 | 12;

export type SalesScope = 'confirmed' | 'all_active';

export interface WeeklySalesPoint {
  weekKey: string;
  weekLabel: string;
  weekRangeLabel: string;
  weekStart: Date;
  weekEnd: Date;
  totalSalesPesewas: number;
  totalSalesGhs: number;
  netPayoutPesewas: number;
  ordersCount: number;
}

export interface SellerWeeklyPerformance {
  weeks: SalesTimeframeWeeks;
  scope: SalesScope;
  points: WeeklySalesPoint[];
  totalSalesPesewas: number;
  totalNetPayoutPesewas: number;
  totalOrders: number;
  averageOrderPesewas: number;
  peakWeek: WeeklySalesPoint | null;
  weekOverWeekDeltaPercent: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

const CONFIRMED_ORDER_STATUSES = new Set<OrderStatus>(['paid', 'shipped', 'completed']);
const ACTIVE_ORDER_STATUSES = new Set<OrderStatus>([
  'pending_payment',
  'payment_submitted',
  'paid',
  'shipped',
  'completed',
  'disputed',
]);

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Returns the Monday 00:00:00.000 UTC start of the ISO week containing `date`.
 */
export function getWeekStartUtc(date: Date): Date {
  const utcDay = date.getUTCDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const daysSinceMonday = (utcDay + 6) % 7;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday)
  );
}

export function formatWeekKeyUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatShortUtcMonthDay(date: Date): string {
  return `${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function isOrderIncluded(order: Order, scope: SalesScope): boolean {
  if (scope === 'confirmed') {
    return CONFIRMED_ORDER_STATUSES.has(order.status);
  }
  return ACTIVE_ORDER_STATUSES.has(order.status);
}

function getOrderEffectiveDate(order: Order, scope: SalesScope): Date | null {
  if (scope === 'confirmed') {
    return order.paidAt ?? order.completedAt ?? order.createdAt ?? order.updatedAt;
  }
  return order.createdAt ?? order.paidAt ?? order.updatedAt;
}

export function formatCompactGhsAxis(ghsAmount: number): string {
  if (!Number.isFinite(ghsAmount) || ghsAmount <= 0) {
    return 'GHS 0';
  }
  if (ghsAmount >= 1000) {
    const scaled = ghsAmount / 1000;
    return `GHS ${Number.isInteger(scaled) ? scaled : scaled.toFixed(1)}k`;
  }
  return `GHS ${Math.round(ghsAmount)}`;
}

/**
 * Aggregates a seller's Firestore orders into contiguous weekly buckets (Monday–Sunday UTC)
 * for the "Total Sales vs. Orders" Recharts bar chart and KPI summary.
 */
export function buildWeeklySalesPerformance(
  orders: Order[],
  options?: {
    weeks?: SalesTimeframeWeeks;
    scope?: SalesScope;
    now?: Date;
  }
): SellerWeeklyPerformance {
  const weeks: SalesTimeframeWeeks = options?.weeks ?? 8;
  const scope: SalesScope = options?.scope ?? 'confirmed';
  const now = options?.now ?? new Date();

  const currentWeekStart = getWeekStartUtc(now);
  const firstWeekStart = new Date(currentWeekStart.getTime() - (weeks - 1) * MS_PER_WEEK);

  const buckets = new Map<string, WeeklySalesPoint>();
  const orderedKeys: string[] = [];

  for (let i = 0; i < weeks; i += 1) {
    const weekStart = new Date(firstWeekStart.getTime() + i * MS_PER_WEEK);
    const weekEnd = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
    const weekKey = formatWeekKeyUtc(weekStart);
    const startLabel = formatShortUtcMonthDay(weekStart);
    const endLabel = formatShortUtcMonthDay(weekEnd);

    orderedKeys.push(weekKey);
    buckets.set(weekKey, {
      weekKey,
      weekLabel: startLabel,
      weekRangeLabel: `${startLabel} – ${endLabel}`,
      weekStart,
      weekEnd,
      totalSalesPesewas: 0,
      totalSalesGhs: 0,
      netPayoutPesewas: 0,
      ordersCount: 0,
    });
  }

  for (const order of orders) {
    if (!isOrderIncluded(order, scope)) continue;
    const effectiveDate = getOrderEffectiveDate(order, scope);
    if (!effectiveDate || Number.isNaN(effectiveDate.getTime())) continue;

    const bucketStart = getWeekStartUtc(effectiveDate);
    const key = formatWeekKeyUtc(bucketStart);
    const point = buckets.get(key);
    if (!point) continue;

    const amount = Number.isFinite(order.amountPesewas) ? Math.max(0, Math.round(order.amountPesewas)) : 0;
    const net = Number.isFinite(order.sellerAmountPesewas)
      ? Math.max(0, Math.round(order.sellerAmountPesewas))
      : amount;

    point.totalSalesPesewas += amount;
    point.netPayoutPesewas += net;
    point.ordersCount += 1;
  }

  let totalSalesPesewas = 0;
  let totalNetPayoutPesewas = 0;
  let totalOrders = 0;
  let peakWeek: WeeklySalesPoint | null = null;

  const points: WeeklySalesPoint[] = orderedKeys.map((key) => {
    const point = buckets.get(key)!;
    point.totalSalesGhs = Number((point.totalSalesPesewas / 100).toFixed(2));

    totalSalesPesewas += point.totalSalesPesewas;
    totalNetPayoutPesewas += point.netPayoutPesewas;
    totalOrders += point.ordersCount;

    if (
      point.ordersCount > 0 &&
      (!peakWeek ||
        point.totalSalesPesewas > peakWeek.totalSalesPesewas ||
        (point.totalSalesPesewas === peakWeek.totalSalesPesewas &&
          point.ordersCount > peakWeek.ordersCount))
    ) {
      peakWeek = point;
    }

    return point;
  });

  const averageOrderPesewas =
    totalOrders > 0 ? Math.round(totalSalesPesewas / totalOrders) : 0;

  let weekOverWeekDeltaPercent: number | null = null;
  if (points.length >= 2) {
    const currentWeek = points[points.length - 1];
    const previousWeek = points[points.length - 2];
    if (previousWeek.totalSalesPesewas > 0) {
      weekOverWeekDeltaPercent = Number(
        (
          ((currentWeek.totalSalesPesewas - previousWeek.totalSalesPesewas) /
            previousWeek.totalSalesPesewas) *
          100
        ).toFixed(1)
      );
    }
  }

  return {
    weeks,
    scope,
    points,
    totalSalesPesewas,
    totalNetPayoutPesewas,
    totalOrders,
    averageOrderPesewas,
    peakWeek,
    weekOverWeekDeltaPercent,
  };
}
