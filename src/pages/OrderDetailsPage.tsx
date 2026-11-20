import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Star,
  Truck,
  XCircle,
} from 'lucide-react';
import { CampusHandoverPanel } from '../components/CampusHandoverPanel';
import { OrderReceiptPanel } from '../components/OrderReceiptPanel';
import { useAuth } from '../context/AuthContext';
import { ORDER_STATUS_META } from '../lib/dashboardSummary';
import {
  ORDER_PAYMENT_STATUS_META,
  PAYMENT_METHOD_LABELS,
  resolveNormalizedPaymentStatus,
} from '../lib/localPayments';
import { formatGhs } from '../lib/money';
import {
  cancelLocalOrder,
  markLocalOrderShipped,
  subscribeOrderById,
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
    return 'You do not have permission to perform this order action right now.';
  }
  return err.message.startsWith('{') ? fallback : err.message;
}

export function OrderDetailsPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setError('Invalid order ID.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const unsub = subscribeOrderById(
      orderId,
      (nextOrder) => {
        setOrder(nextOrder);
        setLoading(false);
      },
      () => {
        setError('Unable to load order details. You may not have access to this order.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [orderId]);

  const handleVerifyPayment = async () => {
    if (!order) return;
    setBusyAction(true);
    setError('');
    setNotice('');
    try {
      const res = await verifyOrderPayment(order.id);
      setNotice(
        res.status === 'paid'
          ? 'Payment verified with Paystack. Order is now paid.'
          : `Order status is ${ORDER_STATUS_LABELS[res.status]}.`
      );
    } catch (err) {
      setError(getFriendlyActionError(err, 'Payment verification failed.'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleStatusUpdate = async (nextStatus: 'shipped' | 'completed' | 'cancelled') => {
    if (!order) return;
    setBusyAction(true);
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
        setNotice('Order marked ready / en route for campus meetup.');
      } else {
        await updateOrderStatus(order.id, nextStatus);
        if (nextStatus === 'shipped') {
          setNotice('Order marked shipped. Buyer has been notified.');
        } else if (nextStatus === 'completed') {
          setNotice(
            'Receipt confirmed. Seller earnings recorded as released — you can now rate and review this transaction.'
          );
        } else {
          setNotice('Order cancelled.');
        }
      }
    } catch (err) {
      setError(getFriendlyActionError(err, 'Could not update order status.'));
    } finally {
      setBusyAction(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <div className="h-8 w-40 bg-stone-200 rounded animate-pulse" />
        <div className="h-44 bg-white border border-stone-200 rounded-xl animate-pulse" />
        <div className="h-56 bg-white border border-stone-200 rounded-xl animate-pulse" />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 hover:text-emerald-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to Orders
        </Link>
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-2">
          <h1 className="text-lg font-semibold text-zinc-900">Order not found</h1>
          <p className="text-sm text-zinc-600">
            {error || 'This order does not exist or belongs to another student account.'}
          </p>
        </div>
      </main>
    );
  }

  const isBuyer = user?.uid === order.buyerId;
  const isSeller = user?.uid === order.sellerId;
  const isLocalOrder =
    order.paymentMethod === 'pay_on_meetup' || order.paymentMethod === 'momo_prepayment';
  const paymentStatus = resolveNormalizedPaymentStatus(order);
  const paymentMeta = ORDER_PAYMENT_STATUS_META[paymentStatus];
  const orderStatusMeta = ORDER_STATUS_META[order.status];

  const showCancelButton =
    (order.status === 'pending_payment' || order.status === 'payment_submitted') &&
    (isLocalOrder ? isSeller : isBuyer || isSeller);

  const showReceiptPanel =
    Boolean(user) && !(order.paymentMethod === 'paystack' && order.receiptStatus === 'none');

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 hover:text-emerald-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to Orders
        </Link>
        <span className="text-xs font-mono text-zinc-500">Order {order.id}</span>
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

      {/* Order Summary Card */}
      <section className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap ${orderStatusMeta.badgeClass}`}
              >
                {ORDER_STATUS_LABELS[order.status]}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap ${paymentMeta.badgeClass}`}
              >
                Payment: {paymentMeta.shortLabel}
              </span>
              <span className="text-zinc-600">
                {isBuyer ? 'Your Purchase' : isSeller ? 'Incoming Sale' : 'Order'}
              </span>
              <span aria-hidden="true" className="text-zinc-400">
                ·
              </span>
              <span className="font-mono text-zinc-500">{order.paystackReference}</span>
              {order.released && (
                <>
                  <span aria-hidden="true" className="text-zinc-400">
                    ·
                  </span>
                  <span className="text-emerald-900 font-medium">Settled</span>
                </>
              )}
            </div>

            <h1 className="text-xl font-bold tracking-tight text-zinc-950">
              <Link
                to={`/listings/${order.listingId}`}
                className="inline-flex items-center gap-1.5 hover:text-emerald-900"
              >
                {order.listingTitle}
                <ExternalLink className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              </Link>
            </h1>

            <p className="text-xs text-zinc-600">
              Method: <span className="font-medium text-zinc-800">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</span>
            </p>
          </div>

          <div className="text-left sm:text-right tabular-nums">
            <span className="text-xs text-zinc-500 block">Order Total</span>
            <span className="text-lg font-bold font-mono text-zinc-950">
              {formatGhs(order.amountPesewas)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-stone-200 text-xs tabular-nums">
          <div>
            <span className="text-zinc-500 block">Item Total</span>
            <span className="font-mono font-semibold text-zinc-950">
              {formatGhs(order.amountPesewas)}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Platform Fee</span>
            <span className="font-mono font-medium text-zinc-700">
              {formatGhs(order.commissionPesewas)}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Seller Net Payout</span>
            <span className="font-mono font-semibold text-emerald-950">
              {formatGhs(order.sellerAmountPesewas)}
            </span>
          </div>
        </div>

        {/* Fulfillment & Payment Actions */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2">
          {order.status === 'pending_payment' && order.paymentMethod === 'paystack' && (
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void handleVerifyPayment()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Verify Paystack Payment
            </button>
          )}

          {showCancelButton && (
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void handleStatusUpdate('cancelled')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-medium text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg disabled:opacity-50 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
              Cancel Order
            </button>
          )}

          {isSeller && order.status === 'paid' && (
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void handleStatusUpdate('shipped')}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors"
            >
              <Truck className="w-3.5 h-3.5" aria-hidden="true" />
              {isLocalOrder ? 'Mark Ready for Meetup' : 'Mark Shipped'}
            </button>
          )}

          {isBuyer && order.status === 'shipped' && !isLocalOrder && (
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void handleStatusUpdate('completed')}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Confirm Receipt
            </button>
          )}

          {isBuyer && order.status === 'completed' && (
            <Link
              to={`/listings/${order.listingId}?review=write#listing-reviews`}
              aria-label={`Rate and review this transaction for ${order.listingTitle}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
            >
              <Star className="w-3.5 h-3.5" aria-hidden="true" />
              Rate &amp; Review This Transaction
            </Link>
          )}
        </div>
      </section>

      {/* Buyer-Only 4-Digit Handover PIN & Seller Campus Handover Verification */}
      {user && (
        <CampusHandoverPanel
          order={order}
          currentUid={user.uid}
          onNotice={setNotice}
          onError={setError}
        />
      )}

      {/* Mobile Money Proof Upload & Verification Panel */}
      {showReceiptPanel && user && (
        <OrderReceiptPanel
          order={order}
          currentUid={user.uid}
          onNotice={setNotice}
          onError={setError}
        />
      )}
    </main>
  );
}
