import type { Listing } from '../types/marketplace';

export interface PriceTrendPoint {
  dateKey: string;
  label: string;
  date: Date;
  avgPricePesewas: number;
  minPricePesewas: number;
  maxPricePesewas: number;
  count: number;
}

export interface CategoryPriceTrendSummary {
  points: PriceTrendPoint[];
  overallAvgPesewas: number | null;
  listingCount: number;
  deltaPercent: number | null;
  currentVsAvgPercent: number | null;
}

const SHORT_DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatShortUtcDate(date: Date): string {
  return SHORT_DATE_FMT.format(date);
}

/**
 * Aggregates listings from a category over the rolling N-day window (default 30 days)
 * into daily average prices in whole pesewas.
 */
export function buildCategoryPriceTrend(
  listings: Array<Pick<Listing, 'pricePesewas' | 'createdAt' | 'status'>>,
  currentListingPricePesewas: number,
  options?: { days?: number; now?: Date }
): CategoryPriceTrendSummary {
  const days = options?.days ?? 30;
  const now = options?.now ?? new Date();
  const windowEndMs = now.getTime();
  const windowStartMs = windowEndMs - days * 24 * 60 * 60 * 1000;

  const buckets = new Map<
    string,
    { sum: number; min: number; max: number; count: number; date: Date }
  >();

  let totalPesewas = 0;
  let totalCount = 0;

  for (const item of listings) {
    if (item.status === 'removed') continue;
    if (!item.createdAt || Number.isNaN(item.createdAt.getTime())) continue;
    if (!Number.isFinite(item.pricePesewas) || item.pricePesewas <= 0) continue;

    const ts = item.createdAt.getTime();
    if (ts < windowStartMs || ts > windowEndMs) continue;

    const dateKey = toUtcDateKey(item.createdAt);
    const bucketDate = new Date(`${dateKey}T12:00:00.000Z`);
    const existing = buckets.get(dateKey);

    if (existing) {
      existing.sum += item.pricePesewas;
      existing.min = Math.min(existing.min, item.pricePesewas);
      existing.max = Math.max(existing.max, item.pricePesewas);
      existing.count += 1;
    } else {
      buckets.set(dateKey, {
        sum: item.pricePesewas,
        min: item.pricePesewas,
        max: item.pricePesewas,
        count: 1,
        date: bucketDate,
      });
    }

    totalPesewas += item.pricePesewas;
    totalCount += 1;
  }

  const points: PriceTrendPoint[] = Array.from(buckets.entries())
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([dateKey, bucket]) => ({
      dateKey,
      label: formatShortUtcDate(bucket.date),
      date: bucket.date,
      avgPricePesewas: Math.round(bucket.sum / bucket.count),
      minPricePesewas: bucket.min,
      maxPricePesewas: bucket.max,
      count: bucket.count,
    }));

  const overallAvgPesewas = totalCount > 0 ? Math.round(totalPesewas / totalCount) : null;

  let deltaPercent: number | null = null;
  if (points.length >= 2) {
    const firstAvg = points[0].avgPricePesewas;
    const lastAvg = points[points.length - 1].avgPricePesewas;
    if (firstAvg > 0) {
      deltaPercent = Math.round(((lastAvg - firstAvg) / firstAvg) * 1000) / 10;
    }
  }

  let currentVsAvgPercent: number | null = null;
  if (overallAvgPesewas && overallAvgPesewas > 0 && currentListingPricePesewas > 0) {
    currentVsAvgPercent =
      Math.round(((currentListingPricePesewas - overallAvgPesewas) / overallAvgPesewas) * 1000) / 10;
  }

  return {
    points,
    overallAvgPesewas,
    listingCount: totalCount,
    deltaPercent,
    currentVsAvgPercent,
  };
}
