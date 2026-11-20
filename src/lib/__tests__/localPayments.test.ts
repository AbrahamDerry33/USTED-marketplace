import { describe, expect, it } from 'vitest';
import { getSellerActionQueue, summarizeSellerDashboard } from '../dashboardSummary';
import {
  applyHandoverPinConfirmation,
  applyMoMoProofSubmission,
  applySellerMoMoVerification,
  buildHandoverQrPayload,
  calculateLocalOrderAmounts,
  canBuyerSubmitMoMoProof,
  canSellerConfirmHandoverWithPin,
  canSellerReviewMoMoProof,
  generateHandoverPin,
  generateHandoverQrDataUrl,
  isValidHandoverPin,
  matchesHandoverPin,
  ORDER_PAYMENT_STATUS_META,
  parseHandoverQrOrPin,
  resolveInitialPaymentStatus,
  resolveNormalizedPaymentStatus,
  validateMoMoProfileInput,
  validateMoMoProofInput,
} from '../localPayments';
import { resolveBuyerReviewEligibility } from '../reviews';
import type { Listing, Order } from '../../types/marketplace';

function makeLocalOrder(overrides: Partial<Order> = {}): Order {
  const createdAt = overrides.createdAt ?? new Date('2026-11-20T09:00:00.000Z');
  const amountPesewas = overrides.amountPesewas ?? 25000;
  const split = calculateLocalOrderAmounts(amountPesewas);

  return {
    id: 'ord-loc-1',
    listingId: 'lst-loc-1',
    listingTitle: 'TI-84 Plus Graphing Calculator',
    buyerId: 'buyer-ug-1',
    sellerId: 'seller-ug-1',
    currency: 'GHS',
    amountPesewas: split.amountPesewas,
    commissionBps: split.commissionBps,
    commissionPesewas: split.commissionPesewas,
    sellerAmountPesewas: split.sellerAmountPesewas,
    paystackReference: 'CM-LOC-ORDLOC1',
    paymentMethod: 'momo_prepayment',
    paymentStatus: 'unpaid',
    receiptStatus: 'none',
    handoverPinSet: true,
    receiptSubmittedAt: null,
    buyerFlaggedPaidAt: null,
    status: 'pending_payment',
    released: false,
    createdAt,
    updatedAt: createdAt,
    paidAt: null,
    shippedAt: null,
    completedAt: null,
    releasedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function makeListing(overrides: Partial<Listing> = {}): Listing {
  const now = new Date('2026-11-20T08:00:00.000Z');
  return {
    id: 'lst-loc-1',
    sellerId: 'seller-ug-1',
    sellerName: 'Ama Owusu',
    title: 'TI-84 Plus Graphing Calculator',
    description: 'Clean calculator for Engineering math courses.',
    pricePesewas: 25000,
    category: 'electronics',
    condition: 'like_new',
    images: ['https://firebasestorage.googleapis.com/v0/b/demo/o/calc.jpg'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Ghana Local Payment & Campus Handover Verification', () => {
  describe('Seller MoMo profile validation & local order amount split', () => {
    it('validates MTN MoMo, Telecel Cash, and ATMoney wallet details and strips HTML', () => {
      const mtnValid = validateMoMoProfileInput({
        momoNetwork: 'mtn',
        momoNumber: '024 123 4567',
        momoAccountName: '<b>Ama Owusu</b>',
      });
      expect(mtnValid.valid).toBe(true);
      expect(mtnValid.payload).toEqual({
        momoNetwork: 'mtn',
        momoNumber: '0241234567',
        momoAccountName: 'Ama Owusu',
      });

      const intlValid = validateMoMoProfileInput({
        momoNetwork: 'telecel',
        momoNumber: '+233201234567',
        momoAccountName: 'Kwame Mensah',
      });
      expect(intlValid.valid).toBe(true);
      expect(intlValid.payload?.momoNumber).toBe('+233201234567');

      const invalidPhone = validateMoMoProfileInput({
        momoNetwork: 'at',
        momoNumber: '12345',
        momoAccountName: 'Kofi Boateng',
      });
      expect(invalidPhone.valid).toBe(false);
      expect(invalidPhone.errors.momoNumber).toBeDefined();
    });

    it('computes integer pesewa commission splits without rounding drift', () => {
      const split = calculateLocalOrderAmounts(12550, 500); // GHS 125.50 @ 5%
      expect(split.commissionPesewas).toBe(628);
      expect(split.sellerAmountPesewas).toBe(11922);
      expect(split.commissionPesewas + split.sellerAmountPesewas).toBe(split.amountPesewas);
      expect(() => calculateLocalOrderAmounts(50)).toThrow();
    });
  });

  describe('Payment status resolution & Mobile Money transitions', () => {
    it('assigns initial paymentStatus cleanly for Pay on Meetup vs MoMo Pre-Payment', () => {
      expect(resolveInitialPaymentStatus('pay_on_meetup')).toBe('pay_on_meetup');
      expect(resolveInitialPaymentStatus('momo_prepayment')).toBe('unpaid');
      expect(Object.keys(ORDER_PAYMENT_STATUS_META)).toEqual([
        'unpaid',
        'proof_submitted',
        'verified',
        'pay_on_meetup',
      ]);
    });

    it('normalizes legacy or partial order records deterministically', () => {
      expect(
        resolveNormalizedPaymentStatus({
          paymentMethod: 'pay_on_meetup',
          paymentStatus: undefined,
          status: 'pending_payment',
          receiptStatus: 'none',
        })
      ).toBe('pay_on_meetup');

      expect(
        resolveNormalizedPaymentStatus({
          paymentMethod: 'momo_prepayment',
          paymentStatus: undefined,
          status: 'payment_submitted',
          receiptStatus: 'submitted',
        })
      ).toBe('proof_submitted');

      expect(
        resolveNormalizedPaymentStatus({
          paymentMethod: 'pay_on_meetup',
          paymentStatus: undefined,
          status: 'completed',
          receiptStatus: 'none',
        })
      ).toBe('verified');
    });

    it('enforces buyer MoMo proof submission -> seller verification -> verified status', () => {
      const initial = makeLocalOrder({
        paymentMethod: 'momo_prepayment',
        paymentStatus: 'unpaid',
        status: 'pending_payment',
      });

      // Seller cannot pose as buyer to submit proof
      expect(canBuyerSubmitMoMoProof({ order: initial, actorUid: initial.sellerId }).allowed).toBe(
        false
      );

      // Malformed proof or non-HTTPS URL rejected
      expect(validateMoMoProofInput({ transactionId: '12' }).valid).toBe(false);
      expect(
        validateMoMoProofInput({
          transactionId: 'MTN-9938102',
          receiptUrl: 'http://insecure.example/receipt.jpg',
        }).valid
      ).toBe(false);

      const submittedAt = new Date('2026-11-20T09:15:00.000Z');
      const afterProof = applyMoMoProofSubmission(
        initial,
        {
          transactionId: '<b>MP261120.1422</b>',
          receiptUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/receipt.png',
          receiptNote: 'Sent <b>GHS 250.00</b> from MTN 024***4421',
        },
        submittedAt
      );

      expect(afterProof.paymentStatus).toBe('proof_submitted');
      expect(afterProof.status).toBe('payment_submitted');
      expect(afterProof.receiptStatus).toBe('submitted');
      expect(afterProof.transactionId).toBe('MP261120.1422');
      expect(afterProof.receiptNote).toBe('Sent GHS 250.00 from MTN 024***4421');

      // Buyer cannot verify their own proof
      expect(canSellerReviewMoMoProof({ order: afterProof, actorUid: afterProof.buyerId }).allowed).toBe(
        false
      );

      const verifiedAt = new Date('2026-11-20T09:20:00.000Z');
      const afterVerify = applySellerMoMoVerification(afterProof, 'verify', undefined, verifiedAt);
      expect(afterVerify.paymentStatus).toBe('verified');
      expect(afterVerify.status).toBe('paid');
      expect(afterVerify.receiptStatus).toBe('verified');
      expect(afterVerify.paidAt).toEqual(verifiedAt);
    });

    it('allows seller to flag invalid MoMo proof back to unpaid so buyer can re-submit', () => {
      const proofSubmitted = makeLocalOrder({
        paymentMethod: 'momo_prepayment',
        paymentStatus: 'proof_submitted',
        status: 'payment_submitted',
        receiptStatus: 'submitted',
        transactionId: 'BAD-REF-11',
      });

      const rejected = applySellerMoMoVerification(
        proofSubmitted,
        'reject',
        'SMS alert has not arrived yet'
      );

      expect(rejected.paymentStatus).toBe('unpaid');
      expect(rejected.status).toBe('pending_payment');
      expect(rejected.receiptStatus).toBe('rejected');
      expect(rejected.receiptNote).toBe('SMS alert has not arrived yet');

      // Buyer can now re-submit a corrected Transaction ID
      const resubmitted = applyMoMoProofSubmission(rejected, {
        transactionId: 'MTN-88120934',
      });
      expect(resubmitted.paymentStatus).toBe('proof_submitted');
      expect(resubmitted.transactionId).toBe('MTN-88120934');
    });
  });

  describe('4-digit Handover PIN generation, QR parsing & confirmation', () => {
    it('generates valid 4-digit numeric PINs and validates matches cleanly', () => {
      for (let i = 0; i < 25; i += 1) {
        const pin = generateHandoverPin();
        expect(pin).toMatch(/^[0-9]{4}$/);
        expect(isValidHandoverPin(pin)).toBe(true);
      }

      expect(isValidHandoverPin('0429')).toBe(true);
      expect(isValidHandoverPin('429')).toBe(false);
      expect(isValidHandoverPin('429a')).toBe(false);
      expect(matchesHandoverPin('0429', '0429')).toBe(true);
      expect(matchesHandoverPin('0429', '0428')).toBe(false);
    });

    it('builds and parses handover QR URI, JSON, and raw PIN payloads while rejecting mismatched orders', async () => {
      const payload = buildHandoverQrPayload('ord-loc-1', '0834');
      expect(payload).toBe('campusmarket://handover?orderId=ord-loc-1&pin=0834');

      expect(parseHandoverQrOrPin('0834', 'ord-loc-1')).toEqual({ valid: true, pin: '0834' });
      expect(parseHandoverQrOrPin(payload, 'ord-loc-1')).toEqual({
        valid: true,
        pin: '0834',
        orderId: 'ord-loc-1',
      });
      expect(
        parseHandoverQrOrPin(JSON.stringify({ orderId: 'ord-loc-1', pin: '0834' }), 'ord-loc-1')
      ).toEqual({
        valid: true,
        pin: '0834',
        orderId: 'ord-loc-1',
      });

      const mismatched = parseHandoverQrOrPin(payload, 'ord-other-99');
      expect(mismatched.valid).toBe(false);
      expect(mismatched.error).toMatch(/different order/i);

      const qrUrl = await generateHandoverQrDataUrl('ord-loc-1', '0834');
      expect(qrUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('blocks PIN confirmation on wrong actor, wrong PIN, or unverified MoMo pre-payment', () => {
      const unverifiedMoMo = makeLocalOrder({
        paymentMethod: 'momo_prepayment',
        paymentStatus: 'proof_submitted',
        status: 'payment_submitted',
      });

      expect(
        canSellerConfirmHandoverWithPin({
          order: unverifiedMoMo,
          actorUid: unverifiedMoMo.sellerId,
          enteredPin: '4912',
          expectedPin: '4912',
        }).allowed
      ).toBe(false);

      const meetupOrder = makeLocalOrder({
        paymentMethod: 'pay_on_meetup',
        paymentStatus: 'pay_on_meetup',
        status: 'pending_payment',
      });

      // Buyer cannot confirm handover themselves
      expect(
        canSellerConfirmHandoverWithPin({
          order: meetupOrder,
          actorUid: meetupOrder.buyerId,
          enteredPin: '4912',
          expectedPin: '4912',
        }).allowed
      ).toBe(false);

      // Wrong 4-digit PIN fails
      expect(() =>
        applyHandoverPinConfirmation(meetupOrder, meetupOrder.sellerId, '1111', '4912')
      ).toThrow(/does not match/i);
    });

    it('completes Pay-on-Meetup & Verified MoMo orders on matching PIN and immediately unlocks buyer reviews', () => {
      const pin = generateHandoverPin();
      const meetupOrder = makeLocalOrder({
        id: 'ord-meetup-1',
        listingId: 'lst-calc-99',
        paymentMethod: 'pay_on_meetup',
        paymentStatus: 'pay_on_meetup',
        status: 'pending_payment',
      });

      // Before handover PIN confirmation: review is locked ("in_progress")
      const beforeEligibility = resolveBuyerReviewEligibility({
        orders: [meetupOrder],
        buyerId: meetupOrder.buyerId,
        sellerId: meetupOrder.sellerId,
        listingId: meetupOrder.listingId,
      });
      expect(beforeEligibility.canSubmit).toBe(false);
      expect(beforeEligibility.status).toBe('in_progress');
      expect(beforeEligibility.completedOrder).toBeNull();

      // Seller enters matching 4-digit PIN at campus meetup
      const completedAt = new Date('2026-11-20T15:30:00.000Z');
      const completedOrder = applyHandoverPinConfirmation(
        meetupOrder,
        meetupOrder.sellerId,
        pin,
        pin,
        completedAt
      );

      expect(completedOrder.status).toBe('completed');
      expect(completedOrder.paymentStatus).toBe('verified');
      expect(completedOrder.handoverPin).toBe(pin);
      expect(completedOrder.released).toBe(true);
      expect(completedOrder.completedAt).toEqual(completedAt);
      expect(completedOrder.releasedAt).toEqual(completedAt);

      // Immediately after handover PIN confirmation: ListingReviewsCard eligibility unlocks!
      const afterEligibility = resolveBuyerReviewEligibility({
        orders: [completedOrder],
        buyerId: meetupOrder.buyerId,
        sellerId: meetupOrder.sellerId,
        listingId: meetupOrder.listingId,
      });
      expect(afterEligibility.canSubmit).toBe(true);
      expect(afterEligibility.status).toBe('completed_for_listing');
      expect(afterEligibility.completedForCurrentListing).toBe(true);
      expect(afterEligibility.completedOrder?.id).toBe('ord-meetup-1');
    });

    it('includes MoMo proofs and Pay-on-Meetup orders cleanly in Seller Dashboard action queue & summary', () => {
      const momoProofOrder = makeLocalOrder({
        id: 'ord-q-1',
        paymentMethod: 'momo_prepayment',
        paymentStatus: 'proof_submitted',
        status: 'payment_submitted',
        receiptStatus: 'submitted',
        createdAt: new Date('2026-11-20T09:00:00.000Z'),
      });
      const meetupOrder = makeLocalOrder({
        id: 'ord-q-2',
        paymentMethod: 'pay_on_meetup',
        paymentStatus: 'pay_on_meetup',
        status: 'pending_payment',
        createdAt: new Date('2026-11-20T10:00:00.000Z'),
      });
      const completedMeetup = makeLocalOrder({
        id: 'ord-q-3',
        paymentMethod: 'pay_on_meetup',
        paymentStatus: 'verified',
        status: 'completed',
        released: true,
        amountPesewas: 10000,
        commissionPesewas: 500,
        sellerAmountPesewas: 9500,
        completedAt: new Date('2026-11-20T11:00:00.000Z'),
      });

      const queue = getSellerActionQueue([meetupOrder, completedMeetup, momoProofOrder]);
      expect(queue.map((o) => o.id)).toEqual(['ord-q-1', 'ord-q-2']);

      const summary = summarizeSellerDashboard(
        [meetupOrder, completedMeetup, momoProofOrder],
        [makeListing()]
      );
      expect(summary.receiptsToVerifyCount).toBe(1);
      expect(summary.meetupHandoversPendingCount).toBe(1);
      expect(summary.actionNeededCount).toBe(2);
      expect(summary.netEarningsReleasedPesewas).toBe(9500);
    });
  });
});
