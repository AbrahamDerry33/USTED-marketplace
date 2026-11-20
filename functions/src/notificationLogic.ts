export type AlertableOrderStatus = 'paid' | 'shipped' | 'completed' | 'cancelled';

export interface OrderSnapshotData {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  sellerId: string;
  amountPesewas: number;
  sellerAmountPesewas?: number;
  status: string;
}

export interface NotificationDraft {
  id: string;
  userId: string;
  orderId: string;
  listingId: string;
  eventType: AlertableOrderStatus;
  recipientRole: 'buyer' | 'seller';
  title: string;
  body: string;
  read: false;
}

export interface TriggerEmailDoc {
  id: string;
  to: string[];
  message: {
    subject: string;
    text: string;
    html: string;
  };
}

const ALERTABLE_STATUSES = new Set<AlertableOrderStatus>([
  'paid',
  'shipped',
  'completed',
  'cancelled',
]);

export function isAlertableOrderStatus(status: string | undefined): status is AlertableOrderStatus {
  return Boolean(status && ALERTABLE_STATUSES.has(status as AlertableOrderStatus));
}

export function shouldTriggerOrderAlert(
  beforeStatus: string | undefined,
  afterStatus: string | undefined
): afterStatus is AlertableOrderStatus {
  if (!isAlertableOrderStatus(afterStatus)) {
    return false;
  }
  return beforeStatus !== afterStatus;
}

export function sanitizeText(input: string, maxLen: number): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPesewasAsGhs(pesewas: number): string {
  if (!Number.isFinite(pesewas) || !Number.isInteger(pesewas) || pesewas < 0) {
    return 'GHS 0.00';
  }
  const whole = Math.floor(pesewas / 100);
  const frac = pesewas % 100;
  return `GHS ${whole.toLocaleString('en-US')}.${String(frac).padStart(2, '0')}`;
}

export function buildOrderNotificationPayloads(
  order: OrderSnapshotData,
  eventType: AlertableOrderStatus
): { buyer: NotificationDraft; seller: NotificationDraft } {
  const safeTitle = sanitizeText(order.listingTitle || 'Campus item', 80);
  const priceText = formatPesewasAsGhs(order.amountPesewas);
  const sellerNetText = formatPesewasAsGhs(order.sellerAmountPesewas ?? order.amountPesewas);

  const buyerId = order.buyerId;
  const sellerId = order.sellerId;

  let buyerCopy: { title: string; body: string };
  let sellerCopy: { title: string; body: string };

  switch (eventType) {
    case 'paid':
      buyerCopy = {
        title: `Payment confirmed for ${safeTitle}`,
        body: `Your payment of ${priceText} is confirmed. Wait for the seller to mark the item handed over or shipped.`,
      };
      sellerCopy = {
        title: `New paid order: ${safeTitle}`,
        body: `A buyer paid ${priceText} (net ${sellerNetText} after fee). Arrange campus delivery and mark the order shipped.`,
      };
      break;
    case 'shipped':
      buyerCopy = {
        title: `Order shipped: ${safeTitle}`,
        body: `The seller marked your ${priceText} order as shipped. Confirm receipt once you inspect the item.`,
      };
      sellerCopy = {
        title: `Marked shipped: ${safeTitle}`,
        body: `You marked this order shipped. Funds release once the buyer confirms receipt.`,
      };
      break;
    case 'completed':
      buyerCopy = {
        title: `Order completed: ${safeTitle}`,
        body: `Receipt confirmed for ${safeTitle} (${priceText}). Thank you for trading safely on Campus Market.`,
      };
      sellerCopy = {
        title: `Order completed: ${safeTitle}`,
        body: `The buyer confirmed receipt. ${sellerNetText} is recorded as released to your seller balance.`,
      };
      break;
    case 'cancelled':
      buyerCopy = {
        title: `Order cancelled: ${safeTitle}`,
        body: `Your order for ${safeTitle} (${priceText}) was cancelled.`,
      };
      sellerCopy = {
        title: `Order cancelled: ${safeTitle}`,
        body: `The order for ${safeTitle} (${priceText}) was cancelled.`,
      };
      break;
  }

  return {
    buyer: {
      id: `${order.id}_${eventType}_buyer`,
      userId: buyerId,
      orderId: order.id,
      listingId: order.listingId,
      eventType,
      recipientRole: 'buyer',
      title: sanitizeText(buyerCopy.title, 120),
      body: sanitizeText(buyerCopy.body, 300),
      read: false,
    },
    seller: {
      id: `${order.id}_${eventType}_seller`,
      userId: sellerId,
      orderId: order.id,
      listingId: order.listingId,
      eventType,
      recipientRole: 'seller',
      title: sanitizeText(sellerCopy.title, 120),
      body: sanitizeText(sellerCopy.body, 300),
      read: false,
    },
  };
}

export function buildPaymentEmailDocuments(params: {
  order: OrderSnapshotData;
  buyerEmail?: string | null;
  sellerEmail?: string | null;
}): TriggerEmailDoc[] {
  const docs: TriggerEmailDoc[] = [];
  const safeTitle = sanitizeText(params.order.listingTitle || 'Campus item', 80);
  const escapedTitle = escapeHtml(safeTitle);
  const priceText = formatPesewasAsGhs(params.order.amountPesewas);
  const sellerNetText = formatPesewasAsGhs(
    params.order.sellerAmountPesewas ?? params.order.amountPesewas
  );

  if (params.buyerEmail && params.buyerEmail.includes('@')) {
    docs.push({
      id: `${params.order.id}_paid_buyer_mail`,
      to: [params.buyerEmail],
      message: {
        subject: `Campus Market: Payment confirmed for ${safeTitle}`,
        text: `Your payment of ${priceText} for "${safeTitle}" (Order ${params.order.id}) is confirmed. We will notify you when the seller marks it shipped.`,
        html: `<p>Your payment of <strong>${escapeHtml(priceText)}</strong> for <strong>${escapedTitle}</strong> (Order <code>${escapeHtml(params.order.id)}</code>) is confirmed.</p><p>We will notify you once the seller marks the item shipped.</p>`,
      },
    });
  }

  if (params.sellerEmail && params.sellerEmail.includes('@')) {
    docs.push({
      id: `${params.order.id}_paid_seller_mail`,
      to: [params.sellerEmail],
      message: {
        subject: `Campus Market: New paid order for ${safeTitle}`,
        text: `Good news! A student paid ${priceText} for "${safeTitle}" (Order ${params.order.id}). Net earnings after commission: ${sellerNetText}. Open Campus Market to coordinate delivery and mark the order shipped.`,
        html: `<p>Good news! A student paid <strong>${escapeHtml(priceText)}</strong> for <strong>${escapedTitle}</strong> (Order <code>${escapeHtml(params.order.id)}</code>).</p><p>Net earnings after commission: <strong>${escapeHtml(sellerNetText)}</strong>.</p><p>Open Campus Market to coordinate meetup/delivery and mark the order shipped.</p>`,
      },
    });
  }

  return docs;
}
