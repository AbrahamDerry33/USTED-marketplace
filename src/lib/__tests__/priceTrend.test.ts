import { describe, it, expect } from 'vitest';
import { buildCategoryPriceTrend } from '../priceTrend';

describe('buildCategoryPriceTrend', () => {
  const now = new Date('2026-11-17T12:00:00.000Z');

  it('aggregates last-30-day listings into daily averages in whole pesewas and excludes old/removed items', () => {
    const summary = buildCategoryPriceTrend(
      [
        // Outside 30-day window (35 days ago) -> excluded
        {
          pricePesewas: 99000,
          status: 'active',
          createdAt: new Date('2026-10-13T10:00:00.000Z'),
        },
        // Removed listing -> excluded
        {
          pricePesewas: 50000,
          status: 'removed',
          createdAt: new Date('2026-11-10T10:00:00.000Z'),
        },
        // Day 1 (Nov 02): 10000 and 20000 -> avg 15000
        {
          pricePesewas: 10000,
          status: 'active',
          createdAt: new Date('2026-11-02T09:00:00.000Z'),
        },
        {
          pricePesewas: 20000,
          status: 'active',
          createdAt: new Date('2026-11-02T18:00:00.000Z'),
        },
        // Day 2 (Nov 15): 18000
        {
          pricePesewas: 18000,
          status: 'active',
          createdAt: new Date('2026-11-15T14:00:00.000Z'),
        },
      ],
      14400, // GHS 144.00
      { days: 30, now }
    );

    expect(summary.listingCount).toBe(3);
    expect(summary.points.map((p) => p.dateKey)).toEqual(['2026-11-02', '2026-11-15']);
    expect(summary.points[0].avgPricePesewas).toBe(15000);
    expect(summary.points[0].count).toBe(2);
    expect(summary.points[1].avgPricePesewas).toBe(18000);
    expect(summary.points[1].count).toBe(1);

    // Overall avg = (10000 + 20000 + 18000) / 3 = 16000
    expect(summary.overallAvgPesewas).toBe(16000);
    // Trend delta from 15000 to 18000 = +20.0%
    expect(summary.deltaPercent).toBe(20);
    // Current 14400 vs 16000 = -10.0%
    expect(summary.currentVsAvgPercent).toBe(-10);
  });

  it('returns empty summary when no listings exist in the 30-day window', () => {
    const summary = buildCategoryPriceTrend([], 12000, { days: 30, now });
    expect(summary.points).toEqual([]);
    expect(summary.overallAvgPesewas).toBeNull();
    expect(summary.listingCount).toBe(0);
    expect(summary.deltaPercent).toBeNull();
    expect(summary.currentVsAvgPercent).toBeNull();
  });
});
