import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Receipt,
  RefreshCw,
  Star,
  Truck,
  XCircle,
} from 'lucide-react';
import { SellerDashboard } from '../components/SellerDashboard';
import { useAuth } from '../context/AuthContext';
import { ORDER_STATUS_META } from '../lib/dashboardSummary';
import {
  ORDER_PAYMENT_STATUS_META,
  resolveNormalizedPaymentStatus,
} from '../lib/localPayments';
import { formatGhs } from '../lib/money';
import {
  cancelLocalOrder,
  markLocalOrderShipped,
  subscribeBuyerOrders,
  subscribeSellerOrders,
  updateOrderStatus,
  verifyOrderPayment,
} from '../services/ordersService';
import type { Order, OrderStatus } from '../types/marketplace';

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Pending Payment',
  payment_submitted: 'Proof Submitted (Awaiting Seller)',
  paid: 'Paid (Reserved)',
  shipped: 'Shipped',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  refunded: 'Refunded',
};

function getFriendlyActionError(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  const lower = err.message.toLowerCase();
  if (lower.includes('permission') || lower.includes('insufficient')) {
    return 'You do not have permission to update this order right now.';
  }
  return err.message.startsWith('{') ? fallback : err.message;
}

export function OrdersPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<'purchases' | 'sales'>(() =>
    searchParams.get('tab') === 'sales' ? 'sales' : 'purchases'
  );
  const [buyerOrders, setBuyerOrders] = useState<Order[]>([]);
  const [sellerOrders, setSellerOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError('');

    let buyerLoaded = false;
    let sellerLoaded = false;
    const markDone = () => {
      if (buyerLoaded && sellerLoaded) setLoading(false);
    };

    const unsubBuyer = subscribeBuyerOrders(
      user.uid,
      (orders) => {
        setBuyerOrders(orders);
        buyerLoaded = true;
        markDone();
      },
      () => {
        setError('Unable to load your purchases right now.');
        buyerLoaded = true;
        markDone();
      }
    );

    const unsubSeller = subscribeSellerOrders(
      user.uid,
      (orders) => {
        setSellerOrders(orders);
        sellerLoaded = true;
        markDone();
      },
      () => {
        setError('Unable to load your incoming sales right now.');
        sellerLoaded = true;
        markDone();
      }
    );

    return () => {
      unsubBuyer();
      unsubSeller();
    };
  }, [user]);

  // Automatic backup verification on Paystack callback redirect (?orderId=...&reference=...)
  useEffect(() => {
    const callbackOrderId = searchParams.get('orderId');
    if (!callbackOrderId || !user) return;

    let cancelled = false;
    setNotice('Confirming your Paystack payment...');
    setError('');

    verifyOrderPayment(callbackOrderId)
      .then((res) => {
        if (cancelled) return;
        if (res.status === 'paid') {
          setNotice('Payment confirmed! The listing is now reserved for you.');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setNotice('');
        setError(
          getFriendlyActionError(
            err,
            'Could not confirm payment yet. Use Verify Payment on the order below.'
          )
        );
      })
      .finally(() => {
        if (!cancelled) {
          setSearchParams({}, { replace: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams, user]);

  const handleVerifyPayment = async (orderId: string) => {
    setBusyOrderId(orderId);
    setError('');
    setNotice('');
    try {
      const res = await verifyOrderPayment(orderId);
      setNotice(
        res.status === 'paid'
          ? 'Payment verified with Paystack. Order is now paid.'
          : `Order status is ${ORDER_STATUS_LABELS[res.status]}.`
      );
    } catch (err) {
      setError(getFriendlyActionError(err, 'Payment verification failed.'));
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleStatusUpdate = async (
    order: Order,
    nextStatus: 'shipped' | 'completed' | 'cancelled'
  ) => {
    setBusyOrderId(order.id);
    setError('');
    setNotice('');

    const isLocalOrder =
      order.paymentMethod === 'pay_on_meetup' || order.paymentMethod === 'momo_prepayment';

    try {
      if (isLocalOrder && nextStatus === 'cancelled') {
        await cancelLocalOrder(order.id);
        setNotice('Order cancelled.');
      } else if (isLocalOrder && nextStatus === 'shipped') {
        await markLocalOrderShipped(order.id);
        setNotice('Order marked ready for campus meetup.');
      } else {
        await updateOrderStatus(order.id, nextStatus);
        if (nextStatus === 'shipped') {
          setNotice('Order marked shipped. Buyer has been notified.');
        } else if (nextStatus === 'completed') {
          setNotice('Receipt confirmed. Seller earnings recorded as released.');
        } else {
          setNotice('Order cancelled.');
        }
      }
    } catch (err) {
      setError(getFriendlyActionError(err, 'Could not update order status.'));
    } finally {
      setBusyOrderId(null);
    }
  };

  const activeList = tab === 'purchases' ? buyerOrders : sellerOrders;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Orders &amp; Payments</h1>
        <p className="text-sm text-zinc-600">
          Track Campus Meetup payments, Mobile Money proofs, 4-digit handover PINs, and Paystack
          orders.
        </p>
      </div>

      <div className="inline-flex p-1 bg-stone-200/70 rounded-lg" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'purchases'}
          onClick={() => setTab('purchases')}
          className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            tab === 'purchases'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-700 hover:text-zinc-900'
          }`}
        >
          Purchases ({buyerOrders.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sales'}
          onClick={() => setTab('sales')}
          className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            tab === 'sales'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-700 hover:text-zinc-900'
          }`}
        >
          Incoming Sales ({sellerOrders.length})
        </button>
      </div>

      {error && (
        <p
          className="text-sm text-red-900 bg-red-50 border border-red-300 rounded-lg px-4 py-3"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-emerald-950 bg-emerald-50 border border-emerald-300 rounded-lg px-4 py-3"
        >
          {notice}
        </p>
      )}

      {tab === 'sales' && (
        <SellerDashboard
          orders={sellerOrders}
          loading={loading}
          error={error}
          showOrdersLink={false}
        />
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-28 bg-white border border-stone-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : activeList.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
          <h2 className="text-base font-semibold text-zinc-900">
            {tab === 'purchases' ? 'No purchases yet' : 'No incoming sales yet'}
          </h2>
          <p className="text-sm text-zinc-600">
            {tab === 'purchases'
              ? 'Browse campus listings and check out with Pay on Meetup, Mobile Money, or Paystack.'
              : 'When a student places an order for one of your listings, it appears here.'}
          </p>
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors"
          >
            Browse Marketplace
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {activeList.map((order) => {
            const orderMeta = ORDER_STATUS_META[order.status];
            const paymentStatus = resolveNormalizedPaymentStatus(order);
            const paymentMeta = ORDER_PAYMENT_STATUS_META[paymentStatus];
            const isLocalOrder =
              order.paymentMethod === 'pay_on_meetup' ||
              order.paymentMethod === 'momo_prepayment';
            const isOpenOrder =
              order.status !== 'completed' &&
              order.status !== 'cancelled' &&
              order.status !== 'disputed' &&
              order.status !== 'refunded';

            const showHandoverButton =
              isLocalOrder &&
              isOpenOrder &&
              (paymentStatus === 'pay_on_meetup' || paymentStatus === 'verified');

            const showCancelButton =
              (order.status === 'pending_payment' || order.status === 'payment_submitted') &&
              (isLocalOrder ? tab === 'sales' : true);

            return (
              <article
                key={order.id}
                className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap ${orderMeta.badgeClass}`}
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap ${paymentMeta.badgeClass}`}
                    >
                      {paymentMeta.shortLabel}
                    </span>
                    <span className="font-mono text-zinc-500">
                      {order.transactionId || order.manualReference || order.paystackReference}
                    </span>
                    {order.released && (
                      <>
                        <span aria-hidden="true" className="text-zinc-400">
                          ·
                        </span>
                        <span className="text-emerald-900 font-medium">Settled</span>
                      </>
                    )}
                  </div>

                  <Link
                    to={`/listings/${order.listingId}`}
                    className="inline-flex items-center gap-1 text-base font-semibold text-zinc-900 hover:text-emerald-900"
                  >
                    {order.listingTitle}
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                  </Link>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600 tabular-nums">
                    <span>
                      Total:{' '}
                      <strong className="font-mono text-zinc-900">
                        {formatGhs(order.amountPesewas)}
                      </strong>
                    </span>
                    {tab === 'sales' && (
                      <>
                        <span>
                          Fee:{' '}
                          <strong className="font-mono text-zinc-700">
                            {formatGhs(order.commissionPesewas)}
                          </strong>
                        </span>
                        <span>
                          Net Payout:{' '}
                          <strong className="font-mono text-emerald-900">
                            {formatGhs(order.sellerAmountPesewas)}
                          </strong>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {showHandoverButton && (
                    <Link
                      to={`/orders/${order.id}#campus-handover`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                      {tab === 'sales' ? 'Confirm Handover PIN' : 'Handover PIN & QR'}
                    </Link>
                  )}

                  <Link
                    to={`/orders/${order.id}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Receipt className="w-3.5 h-3.5" aria-hidden="true" />
                    {tab === 'purchases' &&
                    order.status === 'pending_payment' &&
                    paymentStatus === 'unpaid'
                      ? order.paymentMethod === 'momo_prepayment'
                        ? 'Submit MoMo Proof'
                        : 'Upload Receipt / Flag Paid'
                      : tab === 'sales' &&
                          (order.status === 'payment_submitted' ||
                            paymentStatus === 'proof_submitted')
                        ? 'Verify MoMo Proof'
                        : 'Order Details'}
                  </Link>

                  {order.status === 'pending_payment' && order.paymentMethod === 'paystack' && (
                    <button
                      type="button"
                      disabled={busyOrderId === order.id}
                      onClick={() => void handleVerifyPayment(order.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      Verify Payment
                    </button>
                  )}

                  {showCancelButton && (
                    <button
                      type="button"
                      disabled={busyOrderId === order.id}
                      onClick={() => void handleStatusUpdate(order, 'cancelled')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-medium text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      Cancel
                    </button>
                  )}

                  {tab === 'sales' && order.status === 'paid' && !isLocalOrder && (
                    <button
                      type="button"
                      disabled={busyOrderId === order.id}
                      onClick={() => void handleStatusUpdate(order, 'shipped')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                      Mark Shipped
                    </button>
                  )}

                  {tab === 'purchases' && order.status === 'shipped' && !isLocalOrder && (
                    <button
                      type="button"
                      disabled={busyOrderId === order.id}
                      onClick={() => void handleStatusUpdate(order, 'completed')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Confirm Receipt
                    </button>
                  )}

                  {tab === 'purchases' && order.status === 'completed' && (
                    <Link
                      to={`/listings/${order.listingId}?review=write#listing-reviews`}
                      aria-label={`Rate and review your completed purchase of ${order.listingTitle}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
                    >
                      <Star className="w-3.5 h-3.5" aria-hidden="true" />
                      Rate &amp; Review
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
