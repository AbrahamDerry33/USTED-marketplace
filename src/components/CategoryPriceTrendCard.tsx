import React, { useEffect, useMemo, useState } from 'react';
import { bisector, curveMonotoneX, area as d3Area, line as d3Line, scaleLinear, scaleTime } from 'd3';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { CATEGORY_LABEL_MAP } from '../config/marketplace';
import { formatGhs } from '../lib/money';
import {
  buildCategoryPriceTrend,
  formatShortUtcDate,
  type PriceTrendPoint,
} from '../lib/priceTrend';
import { getCategoryListingsLast30Days } from '../services/listingsService';
import type { Listing, ListingCategory } from '../types/marketplace';

interface CategoryPriceTrendCardProps {
  category: ListingCategory;
  currentListingId: string;
  currentPricePesewas: number;
}

const CHART_WIDTH = 480;
const CHART_HEIGHT = 164;
const MARGIN = { top: 14, right: 14, bottom: 26, left: 62 };
const PLOT_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

const dateBisector = bisector<PriceTrendPoint, Date>((d) => d.date).center;

function formatCompactGhs(pesewas: number): string {
  const ghs = pesewas / 100;
  if (ghs >= 1000) {
    return `GHS ${(ghs / 1000).toFixed(1)}k`;
  }
  return `GHS ${Math.round(ghs)}`;
}

export function CategoryPriceTrendCard({
  category,
  currentListingId,
  currentPricePesewas,
}: CategoryPriceTrendCardProps) {
  const [categoryListings, setCategoryListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<PriceTrendPoint | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setHoveredPoint(null);

    getCategoryListingsLast30Days(category, 30)
      .then((items) => {
        if (!cancelled) {
          setCategoryListings(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [category, currentListingId]);

  const trend = useMemo(
    () => buildCategoryPriceTrend(categoryListings, currentPricePesewas, { days: 30 }),
    [categoryListings, currentPricePesewas]
  );

  const chartGeometry = useMemo(() => {
    if (trend.points.length === 0) return null;

    const now = new Date();
    const startWindow = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const midWindow = new Date((startWindow.getTime() + now.getTime()) / 2);

    const xScale = scaleTime()
      .domain([startWindow, now])
      .range([0, PLOT_WIDTH]);

    const values = trend.points.map((p) => p.avgPricePesewas);
    if (currentPricePesewas > 0) {
      values.push(currentPricePesewas);
    }

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = Math.max(rawMax - rawMin, Math.round(rawMax * 0.25), 500);
    const yMin = Math.max(0, Math.floor((rawMin - span * 0.2) / 100) * 100);
    const yMax = Math.ceil((rawMax + span * 0.2) / 100) * 100;

    const yScale = scaleLinear()
      .domain([yMin, yMax === yMin ? yMin + 1000 : yMax])
      .range([PLOT_HEIGHT, 0])
      .nice();

    const lineGenerator = d3Line<PriceTrendPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.avgPricePesewas))
      .curve(curveMonotoneX);

    const areaGenerator = d3Area<PriceTrendPoint>()
      .x((d) => xScale(d.date))
      .y0(PLOT_HEIGHT)
      .y1((d) => yScale(d.avgPricePesewas))
      .curve(curveMonotoneX);

    const linePath = trend.points.length >= 2 ? lineGenerator(trend.points) || '' : '';
    const areaPath = trend.points.length >= 2 ? areaGenerator(trend.points) || '' : '';
    const yTicks = yScale.ticks(3);
    const xTicks = [startWindow, midWindow, now];
    const currentPriceY = yScale(currentPricePesewas);

    return {
      xScale,
      yScale,
      linePath,
      areaPath,
      yTicks,
      xTicks,
      currentPriceY,
    };
  }, [trend.points, currentPricePesewas]);

  const handlePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!chartGeometry || trend.points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * PLOT_WIDTH;
    const hoveredDate = chartGeometry.xScale.invert(relX);
    const idx = Math.min(
      trend.points.length - 1,
      Math.max(0, dateBisector(trend.points, hoveredDate))
    );
    const candidate = trend.points[idx];
    const prev = idx > 0 ? trend.points[idx - 1] : null;
    if (
      prev &&
      Math.abs(hoveredDate.getTime() - prev.date.getTime()) <
        Math.abs(candidate.date.getTime() - hoveredDate.getTime())
    ) {
      setHoveredPoint(prev);
    } else {
      setHoveredPoint(candidate);
    }
  };

  const categoryLabel = CATEGORY_LABEL_MAP[category];
  const activePoint = hoveredPoint ?? trend.points[trend.points.length - 1] ?? null;

  return (
    <section
      aria-labelledby="category-price-trend-heading"
      className="bg-white border border-stone-200 rounded-xl p-5 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h2 id="category-price-trend-heading" className="text-sm font-semibold text-zinc-900">
            30-Day Category Price Trend
          </h2>
          <p className="text-xs text-zinc-600">
            {categoryLabel} · Last 30 days
            {!loading && !loadError && (
              <>
                {' '}
                · <span className="tabular-nums">{trend.listingCount}</span> active{' '}
                {trend.listingCount === 1 ? 'listing' : 'listings'}
              </>
            )}
          </p>
        </div>

        {!loading && !loadError && trend.overallAvgPesewas !== null && (
          <div className="text-left sm:text-right tabular-nums">
            <span className="text-[11px] text-zinc-500 block">30d Category Avg</span>
            <span className="font-mono text-sm font-semibold text-zinc-900">
              {formatGhs(trend.overallAvgPesewas)}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-36 bg-stone-100 rounded-lg animate-pulse" aria-label="Loading price trend" />
      ) : loadError ? (
        <p className="text-xs text-zinc-600 bg-[#FAF9F6] border border-stone-200 rounded-lg px-3.5 py-3">
          Category price history is temporarily unavailable.
        </p>
      ) : trend.points.length === 0 || !chartGeometry ? (
        <p className="text-xs text-zinc-600 bg-[#FAF9F6] border border-stone-200 rounded-lg px-3.5 py-3">
          Not enough recent listings in {categoryLabel} over the last 30 days to chart a trend yet.
        </p>
      ) : (
        <>
          {/* Comparison Summary & Interactive Readout */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-700 bg-[#FAF9F6] border border-stone-200 rounded-lg px-3 py-2">
            <div className="inline-flex items-center gap-1.5 font-medium">
              {trend.currentVsAvgPercent === null || Math.abs(trend.currentVsAvgPercent) < 0.5 ? (
                <>
                  <Minus className="w-3.5 h-3.5 text-zinc-600" aria-hidden="true" />
                  <span>Priced right around the 30-day average</span>
                </>
              ) : trend.currentVsAvgPercent < 0 ? (
                <>
                  <TrendingDown className="w-3.5 h-3.5 text-emerald-900" aria-hidden="true" />
                  <span className="text-emerald-900 tabular-nums">
                    {Math.abs(trend.currentVsAvgPercent).toFixed(1)}% below category avg
                  </span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-3.5 h-3.5 text-amber-800" aria-hidden="true" />
                  <span className="text-amber-800 tabular-nums">
                    {trend.currentVsAvgPercent.toFixed(1)}% above category avg
                  </span>
                </>
              )}
            </div>

            {activePoint && (
              <div className="text-zinc-600 tabular-nums">
                <span className="font-medium text-zinc-900">{activePoint.label}</span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono font-medium text-emerald-900">
                  {formatGhs(activePoint.avgPricePesewas)}
                </span>
                <span aria-hidden="true"> · </span>
                <span>
                  {activePoint.count} {activePoint.count === 1 ? 'item' : 'items'}
                </span>
              </div>
            )}
          </div>

          {/* D3 SVG Chart */}
          <div className="w-full">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              role="img"
              aria-label={`Average daily prices for ${categoryLabel} listings over the last 30 days`}
              className="w-full h-auto select-none overflow-visible"
            >
              <defs>
                <linearGradient id={`trendFill-${category}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#064e3b" stopOpacity={0.14} />
                  <stop offset="100%" stopColor="#064e3b" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {/* Horizontal gridlines & Y ticks */}
                {chartGeometry.yTicks.map((tick) => {
                  const y = chartGeometry.yScale(tick);
                  return (
                    <g key={tick} transform={`translate(0,${y})`}>
                      <line
                        x1={0}
                        x2={PLOT_WIDTH}
                        y1={0}
                        y2={0}
                        stroke="#e7e5e4"
                        strokeWidth={1}
                      />
                      <text
                        x={-8}
                        y={3}
                        textAnchor="end"
                        className="fill-zinc-500 text-[10px] font-mono tabular-nums"
                      >
                        {formatCompactGhs(tick)}
                      </text>
                    </g>
                  );
                })}

                {/* X-axis baseline & date ticks */}
                <line
                  x1={0}
                  x2={PLOT_WIDTH}
                  y1={PLOT_HEIGHT}
                  y2={PLOT_HEIGHT}
                  stroke="#d6d3d1"
                  strokeWidth={1}
                />
                {chartGeometry.xTicks.map((tick, idx) => {
                  const x = chartGeometry.xScale(tick);
                  const anchor = idx === 0 ? 'start' : idx === 2 ? 'end' : 'middle';
                  return (
                    <text
                      key={tick.toISOString()}
                      x={x}
                      y={PLOT_HEIGHT + 17}
                      textAnchor={anchor}
                      className="fill-zinc-500 text-[10px] tabular-nums"
                    >
                      {formatShortUtcDate(tick)}
                    </text>
                  );
                })}

                {/* Reference line for current listing price */}
                {currentPricePesewas > 0 && (
                  <line
                    x1={0}
                    x2={PLOT_WIDTH}
                    y1={chartGeometry.currentPriceY}
                    y2={chartGeometry.currentPriceY}
                    stroke="#71717a"
                    strokeWidth={1.25}
                    strokeDasharray="4 3"
                  />
                )}

                {/* D3 Area & Line */}
                {chartGeometry.areaPath && (
                  <path d={chartGeometry.areaPath} fill={`url(#trendFill-${category})`} />
                )}
                {chartGeometry.linePath && (
                  <path
                    d={chartGeometry.linePath}
                    fill="none"
                    stroke="#064e3b"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                )}

                {/* Observed Daily Average Points */}
                {trend.points.map((pt) => {
                  const cx = chartGeometry.xScale(pt.date);
                  const cy = chartGeometry.yScale(pt.avgPricePesewas);
                  const isActive = activePoint?.dateKey === pt.dateKey;
                  return (
                    <circle
                      key={pt.dateKey}
                      cx={cx}
                      cy={cy}
                      r={isActive ? 4.5 : 3}
                      fill={isActive ? '#064e3b' : '#ffffff'}
                      stroke="#064e3b"
                      strokeWidth={2}
                    />
                  );
                })}

                {/* Pointer hit-area for smooth D3 bisector inspection */}
                <rect
                  x={0}
                  y={0}
                  width={PLOT_WIDTH}
                  height={PLOT_HEIGHT}
                  fill="transparent"
                  onPointerMove={handlePointerMove}
                  onPointerLeave={() => setHoveredPoint(null)}
                />
              </g>
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-0.5 bg-emerald-900" aria-hidden="true" />
                <span>Category daily avg</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-3 border-t border-dashed border-zinc-500"
                  aria-hidden="true"
                />
                <span>This item ({formatGhs(currentPricePesewas)})</span>
              </span>
            </div>
            {trend.deltaPercent !== null && (
              <span className="font-mono tabular-nums text-zinc-600">
                30d shift: {trend.deltaPercent > 0 ? '+' : ''}
                {trend.deltaPercent.toFixed(1)}%
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
