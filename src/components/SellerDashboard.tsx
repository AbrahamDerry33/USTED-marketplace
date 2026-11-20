import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Edit3,
  ImageOff,
  KeyRound,
  Package,
  Plus,
  QrCode,
  Receipt,
  TrendingDown,
  TrendingUp,
  Truck,
  XCircle,
} from 'lucide-react';
import { MoMoPayoutSettingsCard } from './MoMoPayoutSettingsCard';
import { CATEGORY_LABEL_MAP, LISTING_STATUS_LABELS } from '../config/marketplace';
import { useAuth } from '../context/AuthContext';
import {
  filterSellerOrders,
  getSellerActionQueue,
  ORDER_STATUS_META,
  summarizeSellerDashboard,
  type SellerOrderFilter,
} from '../lib/dashboardSummary';
import {
  ORDER_PAYMENT_STATUS_META,
  resolveNormalizedPaymentStatus,
} from '../lib/localPayments';
import { formatGhs } from '../lib/money';
import {
  buildWeeklySalesPerformance,
  formatCompactGhsAxis,
  type SalesScope,
  type SalesTimeframeWeeks,
  type WeeklySalesPoint,
} from '../lib/sellerAnalytics';
import {
  confirmMoMoPaymentReceived,
  markLocalOrderShipped,
  rejectMoMoPaymentProof,
  reviewPaymentReceipt,
  updateOrderStatus,
} from '../services/ordersService';
import type { Listing, Order } from '../types/marketplace';

interface SellerDashboardProps {
  orders: Order[];
  listings?: Listing[];
  loading?: boolean;
  listingsLoading?: boolean;
  error?: string;
  listingsError?: string;
  showOrdersLink?: boolean;
  variant?: 'analytics' | 'full';
}

interface CustomTooltipPayloadItem {
  payload?: WeeklySalesPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
}

const TIMEFRAME_OPTIONS: { value: SalesTimeframeWeeks; label: string }[] = [
  { value: 4, label: '4 Weeks' },
  { value: 8, label: '8 Weeks' },
  { value: 12, label: '12 Weeks' },
];

const SCOPE_OPTIONS: { value: SalesScope; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed Sales' },
  { value: 'all_active', label: 'All Active Orders' },
];

const SELLER_ORDER_FILTER_TABS: { value: SellerOrderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'action_needed', label: 'Action Needed' },
  { value: 'in_transit', label: 'Shipped' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Pending / Closed' },
];

const FOCUS_RING_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900';

function formatShortOrderDate(date: Date | null): string {
  if (!date) return 'Just now';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function WeeklySalesTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-white border border-stone-300 rounded-lg shadow-sm px-3.5 py-2.5 text-xs space-y-1.5 min-w-44">
      <p className="font-semibold text-zinc-950 border-b border-stone-200 pb-1">
        Week of {point.weekRangeLabel}
      </p>
      <div className="flex items-center justify-between gap-4 tabular-nums">
        <span className="inline-flex items-center gap-1.5 text-zinc-700">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#064e3b] shrink-0" aria-hidden="true" />
          Total Sales
        </span>
        <span className="font-mono font-semibold text-zinc-950">
          {formatGhs(point.totalSalesPesewas)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 tabular-nums">
        <span className="inline-flex items-center gap-1.5 text-zinc-700">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#b45309] shrink-0" aria-hidden="true" />
          Orders
        </span>
        <span className="font-mono font-semibold text-zinc-950">
          {point.ordersCount} {point.ordersCount === 1 ? 'order' : 'orders'}
        </span>
      </div>
      {point.totalSalesPesewas > 0 && (
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-stone-200 text-zinc-700 tabular-nums">
          <span>Net Payout</span>
          <span className="font-mono font-semibold text-emerald-950">
            {formatGhs(point.netPayoutPesewas)}
          </span>
        </div>
      )}
    </div>
  );
}

export function SellerDashboard({
  orders,
  listings = [],
  loading = false,
  listingsLoading = false,
  error = '',
  listingsError = '',
  showOrdersLink = true,
  variant = 'analytics',
}: SellerDashboardProps) {
  const { profile } = useAuth();
  const [weeks, setWeeks] = useState<SalesTimeframeWeeks>(8);
  const [scope, setScope] = useState<SalesScope>('confirmed');
  const [orderFilter, setOrderFilter] = useState<SellerOrderFilter>('all');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const performance = useMemo(
    () => buildWeeklySalesPerformance(orders, { weeks, scope }),
    [orders, weeks, scope]
  );

  const summary = useMemo(
    () => summarizeSellerDashboard(orders, listings),
    [orders, listings]
  );

  const actionQueue = useMemo(() => getSellerActionQueue(orders), [orders]);

  const filteredIncomingOrders = useMemo(
    () => filterSellerOrders(orders, orderFilter),
    [orders, orderFilter]
  );

  const recentListings = useMemo(
    () => listings.filter((item) => item.status !== 'removed').slice(0, 4),
    [listings]
  );

  const hasData = performance.totalOrders > 0;
  const maxOrdersInWindow = useMemo(
    () => Math.max(1, ...performance.points.map((p) => p.ordersCount)),
    [performance.points]
  );
  const maxSalesGhsInWindow = useMemo(
    () => Math.max(100, ...performance.points.map((p) => p.totalSalesGhs)),
    [performance.points]
  );

  const formatSellerActionError = (err: unknown, fallback: string) => {
    if (!(err instanceof Error) || !err.message) return fallback;
    const lower = err.message.toLowerCase();
    if (lower.includes('permission') || lower.includes('insufficient')) {
      return 'You do not have permission to update this order right now.';
    }
    return err.message.startsWith('{') ? fallback : err.message;
  };

  const handleMarkShipped = async (order: Order) => {
    setBusyOrderId(order.id);
    setActionError('');
    setActionNotice('');
    try {
      const isLocalOrder =
        order.paymentMethod === 'pay_on_meetup' || order.paymentMethod === 'momo_prepayment';
      if (isLocalOrder) {
        await markLocalOrderShipped(order.id);
        setActionNotice('Order marked ready for campus meetup. Ask the buyer for their 4-digit PIN at handover.');
      } else {
        await updateOrderStatus(order.id, 'shipped');
        setActionNotice('Order marked as shipped. The buyer has been notified.');
      }
    } catch (err) {
      setActionError(formatSellerActionError(err, 'Unable to update shipment status right now.'));
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleVerifyMoMoProof = async (order: Order) => {
    setBusyOrderId(order.id);
    setActionError('');
    setActionNotice('');
    try {
      if (order.paymentMethod === 'momo_prepayment') {
        await confirmMoMoPaymentReceived({ orderId: order.id, listingId: order.listingId });
        setActionNotice(
          `MoMo receipt verified for "${order.listingTitle}" and listing reserved. Confirm handover with the buyer's 4-digit PIN on meetup.`
        );
      } else {
        await reviewPaymentReceipt({ orderId: order.id, decision: 'verify' });
        setActionNotice(`Manual payment verified for "${order.listingTitle}" and listing reserved.`);
      }
    } catch (err) {
      setActionError(formatSellerActionError(err, 'Unable to confirm payment receipt right now.'));
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleRejectMoMoProof = async (order: Order) => {
    setBusyOrderId(order.id);
    setActionError('');
    setActionNotice('');
    try {
      if (order.paymentMethod === 'momo_prepayment') {
        await rejectMoMoPaymentProof({ orderId: order.id });
        setActionNotice(
          `Flagged invalid payment proof for "${order.listingTitle}". The buyer has been prompted to re-submit.`
        );
      } else {
        await reviewPaymentReceipt({ orderId: order.id, decision: 'reject' });
        setActionNotice(`Rejected payment proof for "${order.listingTitle}".`);
      }
    } catch (err) {
      setActionError(formatSellerActionError(err, 'Unable to flag this payment proof right now.'));
    } finally {
      setBusyOrderId(null);
    }
  };

  const chartCard = (
    <section
      aria-labelledby="seller-performance-heading"
      className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6"
    >
      {/* Header & Interactive Controls */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-1">
          <h2
            id="seller-performance-heading"
            className="text-base sm:text-lg font-semibold tracking-tight text-zinc-950"
          >
            Total Sales vs. Orders
          </h2>
          <p className="text-xs sm:text-sm text-zinc-700">
            Weekly sales performance in Ghana Cedis compared against order volume · Last{' '}
            <span className="tabular-nums">{weeks}</span> weeks
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <div
            className="inline-flex items-center p-1 bg-stone-200/80 rounded-lg max-w-full overflow-x-auto"
            role="group"
            aria-label="Order inclusion filter"
          >
            {SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={`Show ${option.label.toLowerCase()} in weekly chart`}
                aria-pressed={scope === option.value}
                onClick={() => setScope(option.value)}
                className={`min-h-[40px] sm:min-h-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${FOCUS_RING_CLASS} ${
                  scope === option.value
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-800 hover:text-zinc-950'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div
            className="inline-flex items-center p-1 bg-stone-200/80 rounded-lg max-w-full overflow-x-auto"
            role="group"
            aria-label="Weekly timeframe"
          >
            {TIMEFRAME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={`Show weekly sales performance for the last ${option.label.toLowerCase()}`}
                aria-pressed={weeks === option.value}
                onClick={() => setWeeks(option.value)}
                className={`min-h-[40px] sm:min-h-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${FOCUS_RING_CLASS} ${
                  weeks === option.value
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-800 hover:text-zinc-950'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Period Metric Strip (flat hairline dividers, tabular numerals) */}
      {loading ? (
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 border-y border-stone-200 py-4"
          aria-label="Loading weekly performance totals"
        >
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="space-y-2">
              <div className="h-3 w-20 bg-stone-100 rounded animate-pulse" />
              <div className="h-6 w-28 bg-stone-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-y-4 gap-x-6 border-y border-stone-200 py-4">
          <div className="space-y-0.5">
            <dt className="text-xs font-medium text-zinc-700">Gross Sales ({weeks}w)</dt>
            <dd
              aria-label={`Gross sales for last ${weeks} weeks: ${formatGhs(performance.totalSalesPesewas)}`}
              className="font-mono text-lg font-semibold text-zinc-950 tabular-nums"
            >
              {formatGhs(performance.totalSalesPesewas)}
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-xs font-medium text-zinc-700">Orders ({weeks}w)</dt>
            <dd
              aria-label={`Orders for last ${weeks} weeks: ${performance.totalOrders}`}
              className="font-mono text-lg font-semibold text-zinc-950 tabular-nums"
            >
              {performance.totalOrders}
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-xs font-medium text-zinc-700">Net Payout ({weeks}w)</dt>
            <dd
              aria-label={`Net payout for last ${weeks} weeks: ${formatGhs(performance.totalNetPayoutPesewas)}`}
              className="font-mono text-lg font-semibold text-emerald-950 tabular-nums"
            >
              {formatGhs(performance.totalNetPayoutPesewas)}
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-xs font-medium text-zinc-700">Avg. Order Value</dt>
            <dd
              aria-label={`Average order value: ${formatGhs(performance.averageOrderPesewas)}`}
              className="font-mono text-lg font-semibold text-zinc-950 tabular-nums"
            >
              {formatGhs(performance.averageOrderPesewas)}
            </dd>
          </div>
        </dl>
      )}

      {/* Chart Area */}
      {error ? (
        <p
          className="text-sm text-red-900 bg-red-50 border border-red-300 rounded-lg px-4 py-3"
          role="alert"
        >
          {error}
        </p>
      ) : loading ? (
        <div
          className="h-[280px] w-full bg-stone-100 rounded-lg animate-pulse"
          aria-label="Loading weekly sales chart"
        />
      ) : (
        <div className="space-y-4">
          {!hasData && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF9F6] border border-stone-200 rounded-lg px-4 py-3">
              <p className="text-xs sm:text-sm text-zinc-700">
                No {scope === 'confirmed' ? 'confirmed sales' : 'active orders'} recorded in the
                last {weeks} weeks yet. Weekly totals appear automatically once buyers check out
                your items.
              </p>
              <Link
                to="/sell"
                aria-label="Post a new listing to start selling"
                className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-0 px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap shrink-0 ${FOCUS_RING_CLASS}`}
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Post a Listing
              </Link>
            </div>
          )}

          <div
            className="w-full h-[280px]"
            role="img"
            aria-label={`Weekly Total Sales vs. Orders bar chart for the last ${weeks} weeks. Total sales ${formatGhs(performance.totalSalesPesewas)} across ${performance.totalOrders} orders.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={performance.points}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                barGap={6}
                barCategoryGap="24%"
              >
                <CartesianGrid stroke="#d6d3d1" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="weekLabel"
                  tick={{ fill: '#3f3f46', fontSize: 11 }}
                  axisLine={{ stroke: '#a8a29e' }}
                  tickLine={false}
                  dy={6}
                />
                <YAxis
                  yAxisId="sales"
                  orientation="left"
                  domain={[0, hasData ? 'auto' : maxSalesGhsInWindow]}
                  tickFormatter={(value: number) => formatCompactGhsAxis(value)}
                  tick={{
                    fill: '#3f3f46',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <YAxis
                  yAxisId="orders"
                  orientation="right"
                  allowDecimals={false}
                  domain={[0, hasData ? Math.max(2, maxOrdersInWindow + 1) : 4]}
                  tick={{
                    fill: '#3f3f46',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                />
                <Tooltip
                  content={<WeeklySalesTooltip />}
                  cursor={{ fill: 'rgba(214, 211, 209, 0.45)' }}
                />
                <Bar
                  yAxisId="sales"
                  dataKey="totalSalesGhs"
                  name="Total Sales (GHS)"
                  fill="#064e3b"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  yAxisId="orders"
                  dataKey="ordersCount"
                  name="Orders"
                  fill="#b45309"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart Legend & Weekly Insights Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs text-zinc-700">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-xs bg-[#064e3b]" aria-hidden="true" />
                <span>Total Sales (GHS, left axis)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-xs bg-[#b45309]" aria-hidden="true" />
                <span>Orders (count, right axis)</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 tabular-nums">
              {performance.peakWeek && (
                <span>
                  Best week:{' '}
                  <strong className="font-semibold text-zinc-950">
                    {performance.peakWeek.weekRangeLabel}
                  </strong>{' '}
                  (
                  <span className="font-mono font-semibold text-emerald-950">
                    {formatGhs(performance.peakWeek.totalSalesPesewas)}
                  </span>
                  )
                </span>
              )}

              {performance.weekOverWeekDeltaPercent !== null && (
                <span
                  className={`inline-flex items-center gap-1 font-mono font-semibold ${
                    performance.weekOverWeekDeltaPercent >= 0
                      ? 'text-emerald-950'
                      : 'text-amber-900'
                  }`}
                >
                  {performance.weekOverWeekDeltaPercent >= 0 ? (
                    <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {performance.weekOverWeekDeltaPercent > 0 ? '+' : ''}
                  {performance.weekOverWeekDeltaPercent.toFixed(1)}% vs prior week
                </span>
              )}

              {showOrdersLink && (
                <Link
                  to="/orders?tab=sales"
                  aria-label="View all incoming orders on Orders page"
                  className={`font-semibold text-emerald-950 hover:underline underline-offset-4 whitespace-nowrap rounded ${FOCUS_RING_CLASS}`}
                >
                  View Incoming Orders
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );

  if (variant === 'analytics') {
    return chartCard;
  }

  return (
    <div className="space-y-6">
      {/* 4 Summary KPI Cards */}
      <section aria-label="Seller summary metrics">
        {loading && listingsLoading ? (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
            aria-label="Loading seller summary metrics"
          >
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-2.5 animate-pulse"
              >
                <div className="h-3.5 w-24 bg-stone-100 rounded" />
                <div className="h-7 w-28 bg-stone-100 rounded" />
                <div className="h-3 w-32 bg-stone-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-1">
              <dt className="text-xs font-semibold text-zinc-700">Net Earnings Released</dt>
              <dd
                aria-label={`Net earnings released: ${formatGhs(summary.netEarningsReleasedPesewas)}`}
                className="font-mono text-2xl font-bold text-emerald-950 tabular-nums"
              >
                {formatGhs(summary.netEarningsReleasedPesewas)}
              </dd>
              <p className="text-xs text-zinc-600 tabular-nums">
                {summary.releasedOrdersCount > 0
                  ? `After ${formatGhs(summary.releasedCommissionPesewas)} commission`
                  : 'Released after buyer confirmation'}
              </p>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-1">
              <dt className="text-xs font-semibold text-zinc-700">Pending Escrow Balance</dt>
              <dd
                aria-label={`Pending escrow balance: ${formatGhs(summary.pendingEscrowPesewas)}`}
                className="font-mono text-2xl font-bold text-zinc-950 tabular-nums"
              >
                {formatGhs(summary.pendingEscrowPesewas)}
              </dd>
              <p className="text-xs text-zinc-600 tabular-nums">
                {summary.pendingEscrowOrdersCount}{' '}
                {summary.pendingEscrowOrdersCount === 1 ? 'order' : 'orders'} paid or in transit
              </p>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-1">
              <dt className="text-xs font-semibold text-zinc-700">Action Needed</dt>
              <dd
                aria-label={`Orders needing action: ${summary.actionNeededCount}`}
                className={`font-mono text-2xl font-bold tabular-nums ${
                  summary.actionNeededCount > 0 ? 'text-amber-900' : 'text-zinc-950'
                }`}
              >
                {summary.actionNeededCount}
              </dd>
              <p className="text-xs text-zinc-600 tabular-nums">
                {summary.actionNeededCount > 0
                  ? [
                      summary.receiptsToVerifyCount > 0
                        ? `${summary.receiptsToVerifyCount} to verify`
                        : null,
                      summary.ordersToShipCount > 0 ? `${summary.ordersToShipCount} to ship` : null,
                      summary.meetupHandoversPendingCount > 0
                        ? `${summary.meetupHandoversPendingCount} meetup PIN`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'All receipts and handovers caught up'}
              </p>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-1">
              <dt className="text-xs font-semibold text-zinc-700">Active vs. Sold Listings</dt>
              <dd
                aria-label={`${summary.activeListingsCount} active listings and ${summary.soldListingsCount} sold listings`}
                className="font-mono text-2xl font-bold text-zinc-950 tabular-nums"
              >
                <span>{summary.activeListingsCount}</span>
                <span aria-hidden="true" className="text-zinc-600 font-normal mx-1.5">
                  /
                </span>
                <span className="text-emerald-950">{summary.soldListingsCount}</span>
              </dd>
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-600 tabular-nums">
                <span>
                  {summary.reservedListingsCount > 0
                    ? `${summary.reservedListingsCount} reserved`
                    : `${summary.totalListingsCount} total listings`}
                </span>
                <Link
                  to="/my-listings"
                  aria-label="Manage your listings on My Listings page"
                  className={`font-semibold text-emerald-950 hover:underline underline-offset-4 whitespace-nowrap rounded ${FOCUS_RING_CLASS}`}
                >
                  Manage
                </Link>
              </div>
            </div>
          </dl>
        )}
      </section>

      {/* Action feedback alerts */}
      {actionError && (
        <p
          className="text-sm text-red-900 bg-red-50 border border-red-300 rounded-lg px-4 py-3"
          role="alert"
        >
          {actionError}
        </p>
      )}
      {actionNotice && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-emerald-950 bg-emerald-50 border border-emerald-400 rounded-lg px-4 py-3"
        >
          {actionNotice}
        </p>
      )}

      {/* Seller Mobile Money Wallet Configuration */}
      <MoMoPayoutSettingsCard />

      {!profile?.momoNumber && (
        <p className="text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5">
          Add your preferred MTN MoMo, Telecel Cash, or ATMoney number above so student buyers can
          pre-pay for your listings cleanly.
        </p>
      )}

      {/* Orders Needing Action Priority Queue */}
      <section
        aria-labelledby="seller-action-queue-heading"
        className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <h2
              id="seller-action-queue-heading"
              className="text-base sm:text-lg font-semibold tracking-tight text-zinc-950"
            >
              Orders Needing Action
            </h2>
            <p className="text-xs text-zinc-700 tabular-nums">
              Priority queue · {summary.receiptsToVerifyCount} MoMo{' '}
              {summary.receiptsToVerifyCount === 1 ? 'proof' : 'proofs'} awaiting verification ·{' '}
              {summary.ordersToShipCount + summary.meetupHandoversPendingCount} ready for handover
            </p>
          </div>
          <Link
            to="/orders?tab=sales"
            aria-label="Open incoming sales console on Orders page"
            className={`inline-flex items-center gap-1 min-h-[44px] sm:min-h-0 px-1 text-xs font-semibold text-emerald-950 hover:underline underline-offset-4 whitespace-nowrap shrink-0 self-start sm:self-auto rounded ${FOCUS_RING_CLASS}`}
          >
            Open Sales Console
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3" aria-label="Loading orders needing action">
            {[1, 2].map((n) => (
              <div key={n} className="h-20 bg-stone-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : actionQueue.length === 0 ? (
          <div className="flex items-center gap-3 bg-[#FAF9F6] border border-stone-200 rounded-lg px-4 py-3.5 text-xs sm:text-sm text-zinc-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-900 shrink-0" aria-hidden="true" />
            <span>
              You are all caught up. Buyer payment receipts awaiting verification and paid orders
              ready to ship will be prioritized here.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-stone-200 border-t border-stone-200">
            {actionQueue.map((order) => {
              const paymentStatus = resolveNormalizedPaymentStatus(order);
              const paymentMeta = ORDER_PAYMENT_STATUS_META[paymentStatus];
              const isReceiptVerification =
                order.status === 'payment_submitted' || paymentStatus === 'proof_submitted';
              const isMeetupHandover =
                order.status === 'pending_payment' && paymentStatus === 'pay_on_meetup';
              const isLocalOrder =
                order.paymentMethod === 'pay_on_meetup' ||
                order.paymentMethod === 'momo_prepayment';
              const statusMeta = ORDER_STATUS_META[order.status];
              const badgeLabel = isReceiptVerification
                ? 'Verify MoMo Proof'
                : isMeetupHandover
                  ? 'Pay on Meetup · Confirm PIN'
                  : 'Paid · Ready for Handover';

              return (
                <article
                  key={order.id}
                  className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        data-order-status={order.status}
                        aria-label={`Priority order status: ${badgeLabel}`}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap ${statusMeta.badgeClass}`}
                      >
                        <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                        {badgeLabel}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap ${paymentMeta.badgeClass}`}
                      >
                        {paymentMeta.shortLabel}
                      </span>
                      <span className="text-zinc-600 tabular-nums">
                        {formatShortOrderDate(
                          isReceiptVerification
                            ? order.receiptSubmittedAt ?? order.createdAt
                            : order.paidAt ?? order.createdAt
                        )}
                      </span>
                      <span aria-hidden="true" className="text-zinc-500">
                        ·
                      </span>
                      <span className="font-mono text-zinc-600 truncate max-w-[165px] sm:max-w-xs">
                        {order.transactionId || order.manualReference || order.paystackReference}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Link
                        to={`/orders/${order.id}`}
                        aria-label={`Open order details for ${order.listingTitle}`}
                        className={`text-sm sm:text-base font-semibold text-zinc-950 hover:text-emerald-900 truncate max-w-full rounded ${FOCUS_RING_CLASS}`}
                      >
                        {order.listingTitle}
                      </Link>
                      <span className="font-mono text-sm font-semibold text-emerald-950 tabular-nums whitespace-nowrap">
                        {formatGhs(order.sellerAmountPesewas)} net
                      </span>
                    </div>

                    <p className="text-xs text-zinc-700">
                      {isReceiptVerification
                        ? order.receiptNote
                          ? `MoMo Tx ID ${order.transactionId || order.manualReference || '—'} · "${order.receiptNote}"`
                          : `Buyer submitted MoMo Tx ID ${order.transactionId || order.manualReference || 'above'}. Confirm receipt to reserve listing or flag invalid proof.`
                        : isMeetupHandover
                          ? 'Collect Cash or MoMo in person on campus, then enter the buyer’s 4-digit PIN to complete.'
                          : isLocalOrder
                            ? 'MoMo payment verified. Enter the buyer’s 4-digit PIN at campus handover to complete.'
                            : 'Payment is confirmed in escrow. Hand off the item and mark this order shipped.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2 shrink-0">
                    {isReceiptVerification ? (
                      <>
                        <button
                          type="button"
                          disabled={busyOrderId === order.id}
                          aria-label={`Confirm MoMo receipt for ${order.listingTitle}`}
                          onClick={() => void handleVerifyMoMoProof(order)}
                          className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          {busyOrderId === order.id ? 'Updating...' : 'Confirm MoMo Receipt'}
                        </button>
                        <button
                          type="button"
                          disabled={busyOrderId === order.id}
                          aria-label={`Flag invalid MoMo proof for ${order.listingTitle}`}
                          onClick={() => void handleRejectMoMoProof(order)}
                          className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 py-2 text-xs font-medium text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                        >
                          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          Flag Invalid Proof
                        </button>
                        <Link
                          to={`/orders/${order.id}`}
                          aria-label={`Review payment details for ${order.listingTitle}`}
                          className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 py-2 text-xs font-medium text-zinc-900 bg-stone-100 hover:bg-stone-200 border border-stone-400 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                        >
                          <Receipt className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          Details
                        </Link>
                      </>
                    ) : isMeetupHandover ? (
                      <Link
                        to={`/orders/${order.id}#campus-handover`}
                        aria-label={`Confirm campus handover PIN for ${order.listingTitle}`}
                        className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                      >
                        <KeyRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        Confirm Handover PIN
                      </Link>
                    ) : (
                      <>
                        {isLocalOrder && (
                          <Link
                            to={`/orders/${order.id}#campus-handover`}
                            aria-label={`Confirm campus handover PIN for ${order.listingTitle}`}
                            className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                          >
                            <KeyRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            Confirm Handover PIN
                          </Link>
                        )}
                        <button
                          type="button"
                          disabled={busyOrderId === order.id}
                          aria-label={`Mark order for ${order.listingTitle} as shipped`}
                          onClick={() => void handleMarkShipped(order)}
                          className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 py-2 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap ${FOCUS_RING_CLASS} ${
                            isLocalOrder
                              ? 'text-zinc-900 bg-stone-100 hover:bg-stone-200 border border-stone-400'
                              : 'text-white bg-emerald-900 hover:bg-emerald-950'
                          }`}
                        >
                          <Truck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          {busyOrderId === order.id
                            ? 'Updating...'
                            : isLocalOrder
                              ? 'Mark Ready'
                              : 'Mark Shipped'}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Weekly Total Sales vs. Orders Recharts Chart */}
      {chartCard}

      {/* Incoming Orders List */}
      <section
        aria-labelledby="seller-incoming-orders-heading"
        className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <h2
              id="seller-incoming-orders-heading"
              className="text-base sm:text-lg font-semibold tracking-tight text-zinc-950"
            >
              Incoming Orders
            </h2>
            <p className="text-xs text-zinc-600 tabular-nums">
              {filteredIncomingOrders.length} shown · {orders.length} total{' '}
              {orders.length === 1 ? 'order' : 'orders'}
            </p>
          </div>
          <Link
            to="/orders?tab=sales"
            aria-label="View all incoming sales on Orders page"
            className={`inline-flex items-center gap-1 min-h-[44px] sm:min-h-0 px-1 text-xs font-semibold text-emerald-950 hover:underline underline-offset-4 whitespace-nowrap shrink-0 self-start sm:self-auto rounded ${FOCUS_RING_CLASS}`}
          >
            All Incoming Sales
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        {!loading && orders.length > 0 && (
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
            role="group"
            aria-label="Filter incoming orders by status"
          >
            {SELLER_ORDER_FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-label={`Filter incoming orders by ${tab.label}`}
                aria-pressed={orderFilter === tab.value}
                onClick={() => setOrderFilter(tab.value)}
                className={`min-h-[40px] sm:min-h-0 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${FOCUS_RING_CLASS} ${
                  orderFilter === tab.value
                    ? 'bg-emerald-900 text-white'
                    : 'bg-stone-100 text-zinc-800 hover:bg-stone-200 border border-stone-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3" aria-label="Loading incoming orders">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-20 bg-stone-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-[#FAF9F6] border border-stone-200 rounded-lg p-5 sm:p-6 text-center space-y-3">
            <Package className="w-6 h-6 text-zinc-600 mx-auto" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-900">No incoming orders yet</h3>
              <p className="text-xs sm:text-sm text-zinc-700 max-w-md mx-auto">
                When verified buyers check out your campus listings, incoming orders and payouts
                will appear here.
              </p>
            </div>
            <Link
              to="/sell"
              aria-label="Post a new listing"
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Post a Listing
            </Link>
          </div>
        ) : filteredIncomingOrders.length === 0 ? (
          <div className="bg-[#FAF9F6] border border-stone-200 rounded-lg p-5 text-center space-y-2.5">
            <p className="text-xs sm:text-sm text-zinc-700">
              No incoming orders match this filter.
            </p>
            <button
              type="button"
              aria-label="Reset incoming order filter and show all orders"
              onClick={() => setOrderFilter('all')}
              className={`inline-flex items-center justify-center min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-zinc-900 bg-stone-200 hover:bg-stone-300 rounded-lg transition-colors ${FOCUS_RING_CLASS}`}
            >
              Show All Orders
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-200 border-t border-stone-200">
            {filteredIncomingOrders.map((order) => {
              const statusMeta = ORDER_STATUS_META[order.status];
              const paymentStatus = resolveNormalizedPaymentStatus(order);
              const paymentMeta = ORDER_PAYMENT_STATUS_META[paymentStatus];
              const isLocalOrder =
                order.paymentMethod === 'pay_on_meetup' ||
                order.paymentMethod === 'momo_prepayment';
              const isProofPending =
                order.status === 'payment_submitted' || paymentStatus === 'proof_submitted';
              const canConfirmHandover =
                order.status !== 'completed' &&
                order.status !== 'cancelled' &&
                order.status !== 'disputed' &&
                order.status !== 'refunded' &&
                (paymentStatus === 'pay_on_meetup' || paymentStatus === 'verified') &&
                isLocalOrder;

              return (
                <article
                  key={order.id}
                  className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        data-order-status={order.status}
                        aria-label={`Order status: ${statusMeta.label}`}
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap ${paymentMeta.badgeClass}`}
                      >
                        {paymentMeta.shortLabel}
                      </span>
                      <span className="text-zinc-600 tabular-nums">
                        {formatShortOrderDate(order.createdAt)}
                      </span>
                      <span aria-hidden="true" className="text-zinc-500">
                        ·
                      </span>
                      <span className="font-mono text-zinc-600 truncate max-w-[165px] sm:max-w-xs">
                        {order.transactionId || order.manualReference || order.paystackReference}
                      </span>
                      {order.released && (
                        <>
                          <span aria-hidden="true" className="text-zinc-500">
                            ·
                          </span>
                          <span className="font-semibold text-emerald-950">Released</span>
                        </>
                      )}
                    </div>

                    <Link
                      to={`/orders/${order.id}`}
                      aria-label={`Open incoming order details for ${order.listingTitle}`}
                      className={`block text-sm sm:text-base font-semibold text-zinc-950 hover:text-emerald-900 truncate rounded ${FOCUS_RING_CLASS}`}
                    >
                      {order.listingTitle}
                    </Link>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-700 tabular-nums">
                      <span>
                        Gross:{' '}
                        <strong className="font-mono text-zinc-950">
                          {formatGhs(order.amountPesewas)}
                        </strong>
                      </span>
                      <span>
                        Commission:{' '}
                        <strong className="font-mono text-zinc-800">
                          {formatGhs(order.commissionPesewas)}
                        </strong>
                      </span>
                      <span>
                        Net:{' '}
                        <strong className="font-mono text-emerald-950">
                          {formatGhs(order.sellerAmountPesewas)}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2 shrink-0">
                    {isProofPending && (
                      <>
                        <button
                          type="button"
                          disabled={busyOrderId === order.id}
                          aria-label={`Confirm MoMo receipt for ${order.listingTitle}`}
                          onClick={() => void handleVerifyMoMoProof(order)}
                          className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          {busyOrderId === order.id ? 'Updating...' : 'Confirm MoMo Receipt'}
                        </button>
                        <button
                          type="button"
                          disabled={busyOrderId === order.id}
                          aria-label={`Flag invalid MoMo proof for ${order.listingTitle}`}
                          onClick={() => void handleRejectMoMoProof(order)}
                          className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 py-2 text-xs font-medium text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                        >
                          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          Flag Invalid
                        </button>
                      </>
                    )}

                    {canConfirmHandover && (
                      <Link
                        to={`/orders/${order.id}#campus-handover`}
                        aria-label={`Confirm campus handover PIN for ${order.listingTitle}`}
                        className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                      >
                        <KeyRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        Confirm Handover PIN
                      </Link>
                    )}

                    {order.status === 'paid' && !isLocalOrder && (
                      <button
                        type="button"
                        disabled={busyOrderId === order.id}
                        aria-label={`Mark incoming order for ${order.listingTitle} as shipped`}
                        onClick={() => void handleMarkShipped(order)}
                        className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                      >
                        <Truck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {busyOrderId === order.id ? 'Updating...' : 'Mark Shipped'}
                      </button>
                    )}

                    <Link
                      to={`/orders/${order.id}`}
                      aria-label={`View order details for ${order.listingTitle}`}
                      className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 py-2 text-xs font-medium text-zinc-900 bg-stone-100 hover:bg-stone-200 border border-stone-400 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                    >
                      <Receipt className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      Order Details
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Manage Listings Quick Links & Recent Inventory */}
      <section
        aria-labelledby="seller-manage-listings-heading"
        className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <h2
              id="seller-manage-listings-heading"
              className="text-base sm:text-lg font-semibold tracking-tight text-zinc-950"
            >
              Manage Listings
            </h2>
            <p className="text-xs text-zinc-600 tabular-nums">
              {summary.activeListingsCount} active · {summary.reservedListingsCount} reserved ·{' '}
              {summary.soldListingsCount} sold
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0">
            <Link
              to="/my-listings"
              aria-label="Manage all listings on My Listings page"
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 py-2 text-xs font-medium text-zinc-950 bg-stone-100 hover:bg-stone-200 border border-stone-400 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
            >
              <span>All My Listings</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </Link>
            <Link
              to="/sell"
              aria-label="Create a new marketplace listing"
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>New Listing</span>
            </Link>
          </div>
        </div>

        {listingsError && (
          <p
            className="text-sm text-red-900 bg-red-50 border border-red-300 rounded-lg px-4 py-3"
            role="alert"
          >
            {listingsError}
          </p>
        )}

        {listingsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Loading seller listings">
            {[1, 2].map((n) => (
              <div key={n} className="h-20 bg-stone-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : recentListings.length === 0 ? (
          <div className="bg-[#FAF9F6] border border-stone-200 rounded-lg p-5 text-center space-y-3">
            <p className="text-xs sm:text-sm text-zinc-700">
              You have not posted any campus listings yet. Create a listing to start receiving
              student orders.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                to="/sell"
                aria-label="Post your first marketplace listing"
                className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Post Your First Listing
              </Link>
              <Link
                to="/my-listings"
                aria-label="Go to My Listings management page"
                className={`inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs font-medium text-zinc-900 bg-stone-200 hover:bg-stone-300 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
              >
                Go to My Listings
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-stone-200 pt-4">
            {recentListings.map((item) => (
              <article
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#FAF9F6] border border-stone-200 min-w-0"
              >
                <Link
                  to={`/listings/${item.id}`}
                  aria-label={`View listing ${item.title}, priced at ${formatGhs(item.pricePesewas)}`}
                  className={`flex items-center gap-3 min-w-0 flex-1 group rounded-lg ${FOCUS_RING_CLASS}`}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-100 border border-stone-200 shrink-0 flex items-center justify-center">
                    {item.images[0] ? (
                      <img
                        src={item.images[0]}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageOff className="w-4 h-4 text-zinc-600" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[11px] text-zinc-600 truncate">
                      {LISTING_STATUS_LABELS[item.status]} · {CATEGORY_LABEL_MAP[item.category]}
                    </p>
                    <p className="text-sm font-semibold text-zinc-950 group-hover:text-emerald-900 truncate">
                      {item.title}
                    </p>
                    <p className="font-mono text-xs font-semibold text-emerald-950 tabular-nums">
                      {formatGhs(item.pricePesewas)}
                    </p>
                  </div>
                </Link>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Link
                    to={`/listings/${item.id}/flyer`}
                    aria-label={`Print QR code flyer for ${item.title}`}
                    className={`inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-0 px-2.5 sm:px-3 py-2 text-xs font-medium text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/20 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                  >
                    <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">QR Flyer</span>
                  </Link>
                  <Link
                    to={`/listings/${item.id}/edit`}
                    aria-label={`Edit ${item.title}`}
                    className={`inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-0 px-2.5 sm:px-3 py-2 text-xs font-medium text-zinc-900 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Edit</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
