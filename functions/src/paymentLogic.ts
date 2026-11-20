import crypto from 'node:crypto';

export type OrderStatus =
  | 'pending_payment'
  | 'payment_submitted'
  | 'paid'
  | 'shipped'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | 'refunded';

export type PaymentMethod = 'paystack' | 'manual_transfer';

export type ReceiptStatus = 'none' | 'submitted' | 'verified' | 'rejected';

export interface OrderPriceSplit {
  amountPesewas: number;
  commissionBps: number;
  commissionPesewas: number;
  sellerAmountPesewas: number;
}

export function isValidFirestoreId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(id)
  );
}

/**
 * Computes gross price, platform commission, and net seller payout in whole pesewas.
 * Enforces integer arithmetic so commissionPesewas + sellerAmountPesewas === amountPesewas.
 */
export function calculateOrderSplit(
  pricePesewas: number,
  commissionBps = 500
): OrderPriceSplit {
  if (!Number.isInteger(pricePesewas) || pricePesewas < 100 || pricePesewas > 100_000_000) {
    throw new Error('Listing price must be an integer between 100 and 100,000,000 pesewas.');
  }
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 3000) {
    throw new Error('Commission basis points must be an integer between 0 and 3000.');
  }

  const commissionPesewas = Math.round((pricePesewas * commissionBps) / 10_000);
  const sellerAmountPesewas = pricePesewas - commissionPesewas;

  return {
    amountPesewas: pricePesewas,
    commissionBps,
    commissionPesewas,
    sellerAmountPesewas,
  };
}

export function isSafeCallbackUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === 'https:') return true;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function verifyPaystackSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secretKey: string
): boolean {
  if (!signatureHeader || !secretKey) return false;
  const expected = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
  const expBuf = Buffer.from(expected.toLowerCase(), 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export interface PaystackVerifyPayload {
  status?: string;
  amount?: number;
  currency?: string;
  reference?: string;
}

export function isPaystackPaymentVerified(
  paystackData: PaystackVerifyPayload | undefined,
  expectedAmountPesewas: number,
  expectedReference: string
): boolean {
  if (!paystackData) return false;
  return (
    paystackData.status === 'success' &&
    paystackData.currency === 'GHS' &&
    paystackData.amount === expectedAmountPesewas &&
    paystackData.reference === expectedReference
  );
}

export function canTransitionOrderStatus(params: {
  currentStatus: OrderStatus;
  nextStatus: OrderStatus;
  actorUid: string;
  buyerId: string;
  sellerId: string;
}): boolean {
  const { currentStatus, nextStatus, actorUid, buyerId, sellerId } = params;

  if (actorUid === sellerId) {
    if (currentStatus === 'paid' && nextStatus === 'shipped') return true;
    if (
      (currentStatus === 'pending_payment' || currentStatus === 'payment_submitted') &&
      nextStatus === 'cancelled'
    ) {
      return true;
    }
    return false;
  }

  if (actorUid === buyerId) {
    if (currentStatus === 'shipped' && nextStatus === 'completed') return true;
    if (
      (currentStatus === 'pending_payment' || currentStatus === 'payment_submitted') &&
      nextStatus === 'cancelled'
    ) {
      return true;
    }
    return false;
  }

  return false;
}

export function sanitizeReceiptText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export interface ValidatedReceiptInput {
  manualReference: string;
  receiptImageUrl?: string;
  receiptNote?: string;
}

export function validateReceiptSubmission(input: {
  manualReference?: unknown;
  receiptImageUrl?: unknown;
  receiptNote?: unknown;
}): { valid: boolean; error?: string; data?: ValidatedReceiptInput } {
  const manualReference = sanitizeReceiptText(input.manualReference, 80);
  const receiptNote = sanitizeReceiptText(input.receiptNote, 300);

  let receiptImageUrl: string | undefined;
  if (typeof input.receiptImageUrl === 'string' && input.receiptImageUrl.trim()) {
    const trimmed = input.receiptImageUrl.trim();
    if (trimmed.length > 1000 || !trimmed.startsWith('https://')) {
      return { valid: false, error: 'Receipt image URL must be a valid HTTPS link.' };
    }
    receiptImageUrl = trimmed;
  }

  if (!manualReference && !receiptImageUrl) {
    return {
      valid: false,
      error: 'Provide a transfer reference number or upload a proof-of-payment image.',
    };
  }

  if (manualReference && manualReference.length < 3) {
    return {
      valid: false,
      error: 'Transfer reference number must be at least 3 characters.',
    };
  }

  return {
    valid: true,
    data: {
      manualReference: manualReference || 'UPLOADED_PROOF',
      ...(receiptImageUrl ? { receiptImageUrl } : {}),
      ...(receiptNote ? { receiptNote } : {}),
    },
  };
}

export function canSubmitManualReceipt(
  currentStatus: OrderStatus,
  actorUid: string,
  buyerId: string
): boolean {
  return actorUid === buyerId && currentStatus === 'pending_payment';
}

export function canReviewManualReceipt(
  currentStatus: OrderStatus,
  actorUid: string,
  sellerId: string
): boolean {
  return actorUid === sellerId && currentStatus === 'payment_submitted';
}
