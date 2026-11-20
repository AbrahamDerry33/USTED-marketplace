import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  calculateOrderSplit,
  canReviewManualReceipt,
  canSubmitManualReceipt,
  canTransitionOrderStatus,
  isPaystackPaymentVerified,
  isSafeCallbackUrl,
  validateReceiptSubmission,
  verifyPaystackSignature,
} from '../../../functions/src/paymentLogic';

describe('Paystack payment & order server logic', () => {
  it('computes integer pesewa commission and seller amount without rounding drift', () => {
    const split = calculateOrderSplit(12550, 500); // 5% of GHS 125.50
    expect(split.amountPesewas).toBe(12550);
    expect(split.commissionPesewas).toBe(628);
    expect(split.sellerAmountPesewas).toBe(11922);
    expect(split.commissionPesewas + split.sellerAmountPesewas).toBe(12550);

    expect(() => calculateOrderSplit(99, 500)).toThrow();
    expect(() => calculateOrderSplit(120.5, 500)).toThrow();
    expect(() => calculateOrderSplit(1000, 5000)).toThrow();
  });

  it('validates safe callback URLs and rejects javascript/untrusted protocols', () => {
    expect(isSafeCallbackUrl('https://campus-market.web.app/orders')).toBe(true);
    expect(isSafeCallbackUrl('http://localhost:3000/orders')).toBe(true);
    expect(isSafeCallbackUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeCallbackUrl('http://evil.example.com/orders')).toBe(false);
  });

  it('verifies Paystack HMAC SHA512 webhook signature', () => {
    const secret = 'sk_test_example_secret';
    const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'cm_1' } }));
    const validSig = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

    expect(verifyPaystackSignature(rawBody, validSig, secret)).toBe(true);
    expect(verifyPaystackSignature(rawBody, 'deadbeef', secret)).toBe(false);
    expect(verifyPaystackSignature(rawBody, undefined, secret)).toBe(false);
  });

  it('validates Paystack verify endpoint response currency, amount, and reference', () => {
    expect(
      isPaystackPaymentVerified(
        { status: 'success', currency: 'GHS', amount: 15000, reference: 'cm_123' },
        15000,
        'cm_123'
      )
    ).toBe(true);

    expect(
      isPaystackPaymentVerified(
        { status: 'success', currency: 'NGN', amount: 15000, reference: 'cm_123' },
        15000,
        'cm_123'
      )
    ).toBe(false);

    expect(
      isPaystackPaymentVerified(
        { status: 'success', currency: 'GHS', amount: 10000, reference: 'cm_123' },
        15000,
        'cm_123'
      )
    ).toBe(false);
  });

  it('enforces role-specific order status transitions', () => {
    // Seller ships paid order
    expect(
      canTransitionOrderStatus({
        currentStatus: 'paid',
        nextStatus: 'shipped',
        actorUid: 'seller-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      })
    ).toBe(true);

    // Buyer cannot mark order shipped
    expect(
      canTransitionOrderStatus({
        currentStatus: 'paid',
        nextStatus: 'shipped',
        actorUid: 'buyer-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      })
    ).toBe(false);

    // Buyer confirms receipt of shipped order -> completed
    expect(
      canTransitionOrderStatus({
        currentStatus: 'shipped',
        nextStatus: 'completed',
        actorUid: 'buyer-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      })
    ).toBe(true);

    // Seller cannot mark own order completed
    expect(
      canTransitionOrderStatus({
        currentStatus: 'shipped',
        nextStatus: 'completed',
        actorUid: 'seller-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      })
    ).toBe(false);

    // Either participant can cancel an order while receipt is awaiting review
    expect(
      canTransitionOrderStatus({
        currentStatus: 'payment_submitted',
        nextStatus: 'cancelled',
        actorUid: 'buyer-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      })
    ).toBe(true);
  });

  it('validates and sanitizes manual payment receipt submissions', () => {
    const refOnly = validateReceiptSubmission({
      manualReference: '  <b>TXN-2026-991</b>  ',
      receiptNote: '<script>alert(1)</script>Sent via MTN MoMo',
    });
    expect(refOnly.valid).toBe(true);
    expect(refOnly.data?.manualReference).toBe('TXN-2026-991');
    expect(refOnly.data?.receiptNote).toBe('alert(1)Sent via MTN MoMo');

    const imgOnly = validateReceiptSubmission({
      receiptImageUrl: 'https://firebasestorage.googleapis.com/v0/b/test/o/receipt.png',
    });
    expect(imgOnly.valid).toBe(true);
    expect(imgOnly.data?.manualReference).toBe('UPLOADED_PROOF');

    expect(validateReceiptSubmission({}).valid).toBe(false);
    expect(validateReceiptSubmission({ manualReference: 'ab' }).valid).toBe(false);
    expect(
      validateReceiptSubmission({
        manualReference: 'TXN-1234',
        receiptImageUrl: 'http://insecure.example.com/r.png',
      }).valid
    ).toBe(false);
  });

  it('restricts manual receipt submission to buyer on pending_payment and review to seller on payment_submitted', () => {
    expect(canSubmitManualReceipt('pending_payment', 'buyer-1', 'buyer-1')).toBe(true);
    expect(canSubmitManualReceipt('pending_payment', 'seller-1', 'buyer-1')).toBe(false);
    expect(canSubmitManualReceipt('paid', 'buyer-1', 'buyer-1')).toBe(false);

    expect(canReviewManualReceipt('payment_submitted', 'seller-1', 'seller-1')).toBe(true);
    expect(canReviewManualReceipt('payment_submitted', 'buyer-1', 'seller-1')).toBe(false);
    expect(canReviewManualReceipt('pending_payment', 'seller-1', 'seller-1')).toBe(false);
  });
});
