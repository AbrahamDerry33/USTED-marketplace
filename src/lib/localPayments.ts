import QRCode from 'qrcode';
import { stripHtmlTags } from './listingValidation';
import type {
  LocalPaymentMethod,
  MoMoNetwork,
  Order,
  OrderPaymentStatus,
  PaymentMethod,
} from '../types/marketplace';

export const DEFAULT_PLATFORM_COMMISSION_BPS = 500; // 5%

export interface MoMoNetworkMeta {
  value: MoMoNetwork;
  label: string;
  shortLabel: string;
  dialHint: string;
}

export const MOMO_NETWORK_OPTIONS: MoMoNetworkMeta[] = [
  { value: 'mtn', label: 'MTN MoMo', shortLabel: 'MTN', dialHint: '*170#' },
  { value: 'telecel', label: 'Telecel Cash', shortLabel: 'Telecel', dialHint: '*110#' },
  { value: 'at', label: 'ATMoney', shortLabel: 'ATMoney', dialHint: '*110#' },
];

export const MOMO_NETWORK_LABEL_MAP: Record<MoMoNetwork, string> = {
  mtn: 'MTN MoMo',
  telecel: 'Telecel Cash',
  at: 'ATMoney',
};

export const LOCAL_PAYMENT_METHOD_OPTIONS: {
  value: LocalPaymentMethod;
  title: string;
  subtitle: string;
  badgeText: string;
}[] = [
  {
    value: 'pay_on_meetup',
    title: 'Pay on Campus Meetup (Cash or MoMo in person)',
    subtitle:
      'Inspect the item together at a safe campus spot, pay the seller directly, and share your 4-digit Handover PIN.',
    badgeText: 'Inspect First',
  },
  {
    value: 'momo_prepayment',
    title: 'Mobile Money Pre-Payment (MTN MoMo, Telecel Cash, or ATMoney)',
    subtitle:
      "Send funds to the seller's MoMo wallet, submit your Transaction ID to hold the item, then unlock with your Handover PIN.",
    badgeText: 'Reserve Item',
  },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pay_on_meetup: 'Pay on Campus Meetup (Cash or MoMo in person)',
  momo_prepayment: 'Mobile Money Pre-Payment (MTN MoMo / Telecel / ATMoney)',
  paystack: 'Paystack Online Checkout',
  manual_transfer: 'Manual Bank / MoMo Transfer',
};

export const ORDER_PAYMENT_STATUS_META: Record<
  OrderPaymentStatus,
  { label: string; shortLabel: string; badgeClass: string; description: string }
> = {
  unpaid: {
    label: 'Unpaid · Awaiting MoMo Transfer',
    shortLabel: 'Unpaid',
    badgeClass: 'bg-stone-100 text-zinc-900 border-stone-400',
    description: 'Send Mobile Money to the seller and submit your Transaction ID below.',
  },
  proof_submitted: {
    label: 'Proof Submitted · Pending Seller Check',
    shortLabel: 'Proof Submitted',
    badgeClass: 'bg-amber-50 text-amber-950 border-amber-600',
    description: 'Buyer submitted a MoMo Transaction ID. Waiting for seller to verify receipt.',
  },
  verified: {
    label: 'Payment Verified',
    shortLabel: 'Verified',
    badgeClass: 'bg-emerald-50 text-emerald-950 border-emerald-700',
    description: 'Payment confirmed. Present or verify the 4-digit Handover PIN at meetup.',
  },
  pay_on_meetup: {
    label: 'Pay on Meetup',
    shortLabel: 'Pay on Meetup',
    badgeClass: 'bg-sky-50 text-sky-950 border-sky-700',
    description:
      'Buyer will pay Cash or MoMo in person at the campus meetup before confirming the Handover PIN.',
  },
};

export interface LocalOrderAmounts {
  amountPesewas: number;
  commissionBps: number;
  commissionPesewas: number;
  sellerAmountPesewas: number;
}

export function calculateLocalOrderAmounts(
  pricePesewas: number,
  commissionBps = DEFAULT_PLATFORM_COMMISSION_BPS
): LocalOrderAmounts {
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

export function normalizeGhanaPhone(raw: string): string {
  const cleaned = raw.replace(/[\s()-]+/g, '').trim();
  if (!/^(\+233|0)[0-9]{9}$/.test(cleaned)) {
    return '';
  }
  return cleaned;
}

export function formatGhanaPhoneDisplay(phone?: string): string {
  if (!phone) return '';
  const digits = phone.trim();
  if (/^0[0-9]{9}$/.test(digits)) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (/^\+233[0-9]{9}$/.test(digits)) {
    return `+233 ${digits.slice(4, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return digits;
}

export interface ValidatedMoMoProfileInput {
  momoNetwork: MoMoNetwork;
  momoNumber: string;
  momoAccountName: string;
}

export function validateMoMoProfileInput(input: {
  momoNetwork: string;
  momoNumber: string;
  momoAccountName: string;
}): { valid: boolean; errors: Record<string, string>; payload?: ValidatedMoMoProfileInput } {
  const errors: Record<string, string> = {};

  const network = input.momoNetwork;
  if (network !== 'mtn' && network !== 'telecel' && network !== 'at') {
    errors.momoNetwork = 'Select MTN MoMo, Telecel Cash, or ATMoney.';
  }

  const normalizedNumber = normalizeGhanaPhone(input.momoNumber);
  if (!normalizedNumber) {
    errors.momoNumber = 'Enter a valid Ghana MoMo number (e.g. 0241234567 or +233241234567).';
  }

  const cleanAccountName = stripHtmlTags(input.momoAccountName).slice(0, 80);
  if (cleanAccountName.length < 2 || cleanAccountName.length > 80) {
    errors.momoAccountName = 'Enter the registered MoMo account name (2–80 characters).';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    payload: {
      momoNetwork: network as MoMoNetwork,
      momoNumber: normalizedNumber,
      momoAccountName: cleanAccountName,
    },
  };
}

/**
 * Generates a cryptographically uniform 4-digit numeric handover PIN ("0000"–"9999").
 * Uses rejection sampling over Uint16 values to prevent modulo bias.
 */
export function generateHandoverPin(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint16Array(1);
    const maxUnbiased = 60_000; // Largest multiple of 10,000 <= 65,536
    let value = 0;
    do {
      cryptoObj.getRandomValues(buf);
      value = buf[0];
    } while (value >= maxUnbiased);

    return String(value % 10_000).padStart(4, '0');
  }

  return String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
}

export function isValidHandoverPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^[0-9]{4}$/.test(pin);
}

export function matchesHandoverPin(expectedPin: unknown, providedPin: unknown): boolean {
  if (!isValidHandoverPin(expectedPin) || !isValidHandoverPin(providedPin)) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < 4; i += 1) {
    diff |= expectedPin.charCodeAt(i) ^ providedPin.charCodeAt(i);
  }
  return diff === 0;
}

export function buildHandoverQrPayload(orderId: string, pin: string): string {
  if (!orderId || !isValidHandoverPin(pin)) {
    throw new Error('Valid orderId and 4-digit PIN are required to build a handover QR payload.');
  }
  return `campusmarket://handover?orderId=${encodeURIComponent(orderId)}&pin=${encodeURIComponent(pin)}`;
}

export interface ParsedHandoverInput {
  valid: boolean;
  pin?: string;
  orderId?: string;
  error?: string;
}

export function parseHandoverQrOrPin(
  rawInput: string,
  expectedOrderId?: string
): ParsedHandoverInput {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: false, error: 'Enter the 4-digit PIN or scan the buyer handover QR code.' };
  }

  // 1. Direct 4-digit numeric PIN
  if (/^[0-9]{4}$/.test(trimmed)) {
    return { valid: true, pin: trimmed };
  }

  // 2. JSON payload: {"orderId":"...","pin":"4829"}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { orderId?: unknown; pin?: unknown };
      const parsedPin = typeof parsed.pin === 'string' ? parsed.pin.trim() : '';
      const parsedOrderId = typeof parsed.orderId === 'string' ? parsed.orderId.trim() : undefined;
      if (!isValidHandoverPin(parsedPin)) {
        return { valid: false, error: 'QR code does not contain a valid 4-digit handover PIN.' };
      }
      if (expectedOrderId && parsedOrderId && parsedOrderId !== expectedOrderId) {
        return { valid: false, error: 'This handover QR code belongs to a different order.' };
      }
      return { valid: true, pin: parsedPin, orderId: parsedOrderId };
    } catch {
      return { valid: false, error: 'Could not read that handover QR payload.' };
    }
  }

  // 3. URI / query string payload: campusmarket://handover?orderId=...&pin=...
  try {
    const urlLike = trimmed.includes('://')
      ? new URL(trimmed)
      : new URL(`campusmarket://handover?${trimmed.replace(/^\?/, '')}`);
    const pinParam = (urlLike.searchParams.get('pin') || '').trim();
    const orderParam = (urlLike.searchParams.get('orderId') || '').trim() || undefined;
    if (!isValidHandoverPin(pinParam)) {
      return { valid: false, error: 'Enter a valid 4-digit numeric PIN (e.g. 4829).' };
    }
    if (expectedOrderId && orderParam && orderParam !== expectedOrderId) {
      return { valid: false, error: 'This handover QR code belongs to a different order.' };
    }
    return { valid: true, pin: pinParam, orderId: orderParam };
  } catch {
    return { valid: false, error: 'Enter a valid 4-digit numeric PIN (e.g. 4829).' };
  }
}

export async function generateHandoverQrDataUrl(orderId: string, pin: string): Promise<string> {
  const payload = buildHandoverQrPayload(orderId, pin);
  return QRCode.toDataURL(payload, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#022c22',
      light: '#ffffff',
    },
  });
}

export async function generateHandoverQrSvg(orderId: string, pin: string): Promise<string> {
  const payload = buildHandoverQrPayload(orderId, pin);
  return QRCode.toString(payload, {
    type: 'svg',
    width: 220,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#022c22',
      light: '#ffffff',
    },
  });
}

export function resolveInitialPaymentStatus(paymentMethod: PaymentMethod): OrderPaymentStatus {
  return paymentMethod === 'pay_on_meetup' ? 'pay_on_meetup' : 'unpaid';
}

export function resolveNormalizedPaymentStatus(
  order: Pick<Order, 'paymentMethod' | 'paymentStatus' | 'status' | 'receiptStatus'>
): OrderPaymentStatus {
  if (
    order.paymentStatus === 'unpaid' ||
    order.paymentStatus === 'proof_submitted' ||
    order.paymentStatus === 'verified' ||
    order.paymentStatus === 'pay_on_meetup'
  ) {
    return order.paymentStatus;
  }

  if (order.paymentMethod === 'pay_on_meetup') {
    return order.status === 'completed' ? 'verified' : 'pay_on_meetup';
  }
  if (
    order.status === 'paid' ||
    order.status === 'shipped' ||
    order.status === 'completed' ||
    order.receiptStatus === 'verified'
  ) {
    return 'verified';
  }
  if (order.status === 'payment_submitted' || order.receiptStatus === 'submitted') {
    return 'proof_submitted';
  }
  return 'unpaid';
}

export interface ValidatedMoMoProofInput {
  transactionId: string;
  receiptUrl?: string;
  receiptNote?: string;
}

export function validateMoMoProofInput(input: {
  transactionId?: unknown;
  receiptUrl?: unknown;
  receiptNote?: unknown;
}): { valid: boolean; error?: string; data?: ValidatedMoMoProofInput } {
  const transactionId =
    typeof input.transactionId === 'string' ? stripHtmlTags(input.transactionId).slice(0, 80) : '';
  const receiptNote =
    typeof input.receiptNote === 'string' ? stripHtmlTags(input.receiptNote).slice(0, 300) : '';

  if (transactionId.length < 3) {
    return {
      valid: false,
      error: 'Enter your Mobile Money Transaction ID (at least 3 characters).',
    };
  }

  let receiptUrl: string | undefined;
  if (typeof input.receiptUrl === 'string' && input.receiptUrl.trim()) {
    const trimmed = input.receiptUrl.trim();
    if (trimmed.length > 1000 || !trimmed.startsWith('https://')) {
      return { valid: false, error: 'Receipt screenshot URL must be a valid HTTPS link.' };
    }
    receiptUrl = trimmed;
  }

  return {
    valid: true,
    data: {
      transactionId,
      ...(receiptUrl ? { receiptUrl } : {}),
      ...(receiptNote ? { receiptNote } : {}),
    },
  };
}

export function canBuyerSubmitMoMoProof(params: {
  order: Pick<Order, 'buyerId' | 'paymentMethod' | 'paymentStatus' | 'status' | 'receiptStatus'>;
  actorUid: string;
}): { allowed: boolean; reason?: string } {
  const { order, actorUid } = params;
  if (actorUid !== order.buyerId) {
    return { allowed: false, reason: 'Only the buyer can submit Mobile Money payment proof.' };
  }
  if (order.paymentMethod !== 'momo_prepayment' && order.paymentMethod !== 'manual_transfer') {
    return {
      allowed: false,
      reason: 'Payment proof is only required for Mobile Money Pre-Payment orders.',
    };
  }
  const paymentStatus = resolveNormalizedPaymentStatus(order);
  if (order.status !== 'pending_payment' || paymentStatus !== 'unpaid') {
    return {
      allowed: false,
      reason: 'Payment proof can only be submitted while payment status is unpaid.',
    };
  }
  return { allowed: true };
}

export function canSellerReviewMoMoProof(params: {
  order: Pick<Order, 'sellerId' | 'paymentStatus' | 'status' | 'receiptStatus' | 'paymentMethod'>;
  actorUid: string;
}): { allowed: boolean; reason?: string } {
  const { order, actorUid } = params;
  if (actorUid !== order.sellerId) {
    return { allowed: false, reason: 'Only the seller can verify or reject MoMo payment proof.' };
  }
  const paymentStatus = resolveNormalizedPaymentStatus(order);
  if (order.status !== 'payment_submitted' || paymentStatus !== 'proof_submitted') {
    return {
      allowed: false,
      reason: 'Seller can only review proof when payment status is proof_submitted.',
    };
  }
  return { allowed: true };
}

export function canSellerConfirmHandoverWithPin(params: {
  order: Pick<Order, 'sellerId' | 'paymentMethod' | 'paymentStatus' | 'status' | 'receiptStatus'>;
  actorUid: string;
  enteredPin: string;
  expectedPin?: string;
}): { allowed: boolean; reason?: string } {
  const { order, actorUid, enteredPin, expectedPin } = params;
  if (actorUid !== order.sellerId) {
    return { allowed: false, reason: 'Only the seller can confirm campus handover.' };
  }

  const paymentStatus = resolveNormalizedPaymentStatus(order);
  if (order.status === 'completed') {
    return { allowed: false, reason: 'This order is already completed.' };
  }
  if (order.status === 'cancelled' || order.status === 'refunded' || order.status === 'disputed') {
    return { allowed: false, reason: 'Cancelled or disputed orders cannot be handed over.' };
  }
  if (paymentStatus !== 'pay_on_meetup' && paymentStatus !== 'verified') {
    return {
      allowed: false,
      reason: 'Confirm the buyer MoMo payment receipt before completing handover.',
    };
  }
  if (!isValidHandoverPin(enteredPin)) {
    return { allowed: false, reason: 'Enter the buyer’s 4-digit numeric handover PIN.' };
  }
  if (expectedPin !== undefined && !matchesHandoverPin(expectedPin, enteredPin)) {
    return { allowed: false, reason: 'That 4-digit handover PIN does not match.' };
  }
  return { allowed: true };
}

/**
 * Pure transition helper for MoMo payment proof submission (used by unit tests & UI state checks).
 */
export function applyMoMoProofSubmission(
  order: Order,
  input: { transactionId: string; receiptUrl?: string; receiptNote?: string },
  timestamp = new Date()
): Order {
  const check = canBuyerSubmitMoMoProof({ order, actorUid: order.buyerId });
  if (!check.allowed) {
    throw new Error(check.reason || 'Cannot submit MoMo proof.');
  }
  const validation = validateMoMoProofInput(input);
  if (!validation.valid || !validation.data) {
    throw new Error(validation.error || 'Invalid MoMo proof.');
  }

  return {
    ...order,
    status: 'payment_submitted',
    paymentStatus: 'proof_submitted',
    receiptStatus: 'submitted',
    transactionId: validation.data.transactionId,
    manualReference: validation.data.transactionId,
    receiptUrl: validation.data.receiptUrl,
    receiptImageUrl: validation.data.receiptUrl,
    receiptNote: validation.data.receiptNote,
    receiptSubmittedAt: timestamp,
    buyerFlaggedPaidAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Pure transition helper for seller verifying or flagging invalid MoMo proof.
 */
export function applySellerMoMoVerification(
  order: Order,
  decision: 'verify' | 'reject',
  note?: string,
  timestamp = new Date()
): Order {
  const check = canSellerReviewMoMoProof({ order, actorUid: order.sellerId });
  if (!check.allowed) {
    throw new Error(check.reason || 'Cannot review MoMo proof.');
  }

  if (decision === 'verify') {
    return {
      ...order,
      status: 'paid',
      paymentStatus: 'verified',
      receiptStatus: 'verified',
      paidAt: timestamp,
      updatedAt: timestamp,
    };
  }

  const cleanNote = note ? stripHtmlTags(note).slice(0, 300) : undefined;
  return {
    ...order,
    status: 'pending_payment',
    paymentStatus: 'unpaid',
    receiptStatus: 'rejected',
    ...(cleanNote ? { receiptNote: cleanNote } : {}),
    updatedAt: timestamp,
  };
}

/**
 * Pure transition helper for seller PIN confirmation at campus handover.
 * Atomically settles paymentStatus='verified' (when pay_on_meetup), released=true, status='completed'.
 */
export function applyHandoverPinConfirmation(
  order: Order,
  actorUid: string,
  enteredPin: string,
  expectedPin: string,
  timestamp = new Date()
): Order {
  const check = canSellerConfirmHandoverWithPin({
    order,
    actorUid,
    enteredPin,
    expectedPin,
  });
  if (!check.allowed) {
    throw new Error(check.reason || 'Handover PIN verification failed.');
  }

  return {
    ...order,
    status: 'completed',
    paymentStatus: 'verified',
    handoverPin: enteredPin,
    released: true,
    completedAt: timestamp,
    releasedAt: timestamp,
    updatedAt: timestamp,
  };
}
