import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineInt, defineSecret } from 'firebase-functions/params';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import {
  buildOrderNotificationPayloads,
  buildPaymentEmailDocuments,
  shouldTriggerOrderAlert,
  type OrderSnapshotData,
} from './notificationLogic.js';
import {
  calculateOrderSplit,
  canReviewManualReceipt,
  canSubmitManualReceipt,
  canTransitionOrderStatus,
  isPaystackPaymentVerified,
  isSafeCallbackUrl,
  isValidFirestoreId,
  sanitizeReceiptText,
  validateReceiptSubmission,
  verifyPaystackSignature,
  type OrderStatus,
  type PaystackVerifyPayload,
} from './paymentLogic.js';

const app = initializeApp();
const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID || 'ai-studio-54afc474-e7eb-4389-9f1f-6358cd1ae8a2';
const db = getFirestore(app, FIRESTORE_DATABASE_ID);

// Paystack secret key stored exclusively in Cloud Functions Secret Manager
const paystackSecretKey = defineSecret('PAYSTACK_SECRET_KEY');
// Default 500 bps (5%) until school confirms exact commission rate (DEC-02)
const platformCommissionBps = defineInt('PLATFORM_COMMISSION_BPS', { default: 500 });

async function getVerifiedUserEmail(uid: string): Promise<string | null> {
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}/private/info`).get();
  if (!snap.exists) return null;
  const email = snap.data()?.email;
  return typeof email === 'string' && email.includes('@') ? email : null;
}

function assertVerifiedCaller(auth: { uid: string; token: Record<string, unknown> } | undefined): {
  uid: string;
  email: string;
} {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  if (auth.token.email_verified !== true) {
    throw new HttpsError(
      'permission-denied',
      'Verified email is required for marketplace orders.'
    );
  }
  const email = typeof auth.token.email === 'string' ? auth.token.email : '';
  if (!email) {
    throw new HttpsError('failed-precondition', 'Verified email address missing on account.');
  }
  return { uid: auth.uid, email };
}

async function fetchPaystackVerify(
  reference: string,
  secret: string
): Promise<PaystackVerifyPayload | undefined> {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    }
  );
  if (!response.ok) {
    return undefined;
  }
  const payload = (await response.json()) as {
    status?: boolean;
    data?: PaystackVerifyPayload;
  };
  if (!payload?.status || !payload.data) {
    return undefined;
  }
  return payload.data;
}

async function settleOrderPaid(orderId: string, reference: string): Promise<'paid' | 'already_paid'> {
  const orderRef = db.collection('orders').doc(orderId);

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Order not found.');
    }

    const orderData = orderSnap.data()!;
    const currentStatus = orderData.status as OrderStatus;

    // Idempotent exit if already settled
    if (
      currentStatus === 'paid' ||
      currentStatus === 'shipped' ||
      currentStatus === 'completed'
    ) {
      return 'already_paid';
    }

    if (currentStatus !== 'pending_payment') {
      throw new HttpsError(
        'failed-precondition',
        `Order cannot be paid from status "${currentStatus}".`
      );
    }

    if (orderData.paystackReference !== reference) {
      throw new HttpsError('failed-precondition', 'Payment reference mismatch.');
    }

    const listingRef = db.collection('listings').doc(String(orderData.listingId));
    const listingSnap = await tx.get(listingRef);

    tx.update(orderRef, {
      status: 'paid',
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (listingSnap.exists && listingSnap.data()?.status === 'active') {
      tx.update(listingRef, {
        status: 'reserved',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return 'paid';
  });
}

/**
 * Step 5 (Payments): Server-authoritative order creation + Paystack transaction initialize.
 * The browser sends ONLY listingId (and optional callbackUrl), never any price.
 */
export const createOrder = onCall(
  {
    secrets: [paystackSecretKey],
    enforceAppCheck: false, // Enable true once App Check reCAPTCHA site key is configured
  },
  async (request) => {
    const { uid: buyerId, email: buyerEmail } = assertVerifiedCaller(
      request.auth as { uid: string; token: Record<string, unknown> } | undefined
    );

    const listingId = request.data?.listingId;
    const callbackUrl = request.data?.callbackUrl;

    if (!isValidFirestoreId(listingId)) {
      throw new HttpsError('invalid-argument', 'A valid listingId is required.');
    }

    if (callbackUrl !== undefined && !isSafeCallbackUrl(callbackUrl)) {
      throw new HttpsError('invalid-argument', 'Invalid callbackUrl.');
    }

    const userSnap = await db.doc(`users/${buyerId}`).get();
    if (userSnap.exists && userSnap.data()?.banned === true) {
      throw new HttpsError('permission-denied', 'Account is suspended from placing orders.');
    }

    const orderRef = db.collection('orders').doc();
    const orderId = orderRef.id;
    const paystackReference = `cm_${orderId}`;
    const commissionBps = platformCommissionBps.value();

    const createdOrder = await db.runTransaction(async (tx) => {
      const listingRef = db.collection('listings').doc(listingId);
      const listingSnap = await tx.get(listingRef);

      if (!listingSnap.exists) {
        throw new HttpsError('not-found', 'Listing not found.');
      }

      const listing = listingSnap.data()!;
      if (listing.status !== 'active') {
        throw new HttpsError('failed-precondition', 'This item is no longer available.');
      }

      if (listing.sellerId === buyerId) {
        throw new HttpsError('failed-precondition', 'You cannot buy your own listing.');
      }

      const split = calculateOrderSplit(Number(listing.pricePesewas), commissionBps);

      tx.set(orderRef, {
        id: orderId,
        listingId,
        listingTitle: String(listing.title || 'Campus Item').slice(0, 100),
        buyerId,
        sellerId: String(listing.sellerId),
        currency: 'GHS',
        amountPesewas: split.amountPesewas,
        commissionBps: split.commissionBps,
        commissionPesewas: split.commissionPesewas,
        sellerAmountPesewas: split.sellerAmountPesewas,
        paystackReference,
        paymentMethod: 'paystack',
        receiptStatus: 'none',
        status: 'pending_payment',
        released: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        orderId,
        listingTitle: String(listing.title || 'Campus Item'),
        sellerId: String(listing.sellerId),
        ...split,
      };
    });

    const secret = paystackSecretKey.value();
    if (!secret) {
      await orderRef.update({
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError('failed-precondition', 'Paystack secret key is not configured.');
    }

    const initBody: Record<string, unknown> = {
      email: buyerEmail,
      amount: createdOrder.amountPesewas,
      currency: 'GHS',
      reference: paystackReference,
      channels: ['card', 'mobile_money'],
      metadata: {
        orderId,
        listingId,
        buyerId,
        sellerId: createdOrder.sellerId,
      },
    };

    if (isSafeCallbackUrl(callbackUrl)) {
      initBody.callback_url = callbackUrl;
    }

    const paystackResp = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(initBody),
    });

    const paystackJson = (await paystackResp.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        authorization_url?: string;
        access_code?: string;
        reference?: string;
      };
    };

    if (!paystackResp.ok || !paystackJson.status || !paystackJson.data?.authorization_url) {
      await orderRef.update({
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError(
        'internal',
        paystackJson.message || 'Unable to initialize Paystack checkout.'
      );
    }

    return {
      orderId,
      reference: paystackReference,
      authorizationUrl: paystackJson.data.authorization_url,
      accessCode: paystackJson.data.access_code || '',
      amountPesewas: createdOrder.amountPesewas,
      commissionPesewas: createdOrder.commissionPesewas,
      sellerAmountPesewas: createdOrder.sellerAmountPesewas,
    };
  }
);

/**
 * Paystack webhook verifying HMAC SHA512 signature + Paystack verify endpoint.
 * Idempotent: safe to run twice.
 */
export const paystackWebhook = onRequest(
  {
    secrets: [paystackSecretKey],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const secret = paystackSecretKey.value();
    const signature = req.get('x-paystack-signature');

    if (!verifyPaystackSignature(req.rawBody, signature, secret)) {
      res.status(401).send('Invalid signature');
      return;
    }

    const event = req.body as {
      event?: string;
      data?: { reference?: string };
    };

    if (event?.event !== 'charge.success') {
      res.status(200).send('Ignored');
      return;
    }

    const reference = event.data?.reference;
    if (!reference) {
      res.status(400).send('Missing reference');
      return;
    }

    const orderQuery = await db
      .collection('orders')
      .where('paystackReference', '==', reference)
      .limit(1)
      .get();

    if (orderQuery.empty) {
      res.status(404).send('Order not found');
      return;
    }

    const orderDoc = orderQuery.docs[0];
    const orderData = orderDoc.data();
    const verified = await fetchPaystackVerify(reference, secret);

    if (!isPaystackPaymentVerified(verified, Number(orderData.amountPesewas), reference)) {
      res.status(400).send('Payment verification failed');
      return;
    }

    await settleOrderPaid(orderDoc.id, reference);
    res.status(200).send('OK');
  }
);

/**
 * Callable backup for local dev when Paystack webhooks cannot reach localhost.
 */
export const verifyPayment = onCall(
  {
    secrets: [paystackSecretKey],
  },
  async (request) => {
    const { uid } = assertVerifiedCaller(
      request.auth as { uid: string; token: Record<string, unknown> } | undefined
    );

    const orderId = request.data?.orderId;
    if (!isValidFirestoreId(orderId)) {
      throw new HttpsError('invalid-argument', 'A valid orderId is required.');
    }

    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Order not found.');
    }

    const orderData = orderSnap.data()!;
    if (orderData.buyerId !== uid && orderData.sellerId !== uid) {
      throw new HttpsError('permission-denied', 'Not authorized to verify this order.');
    }

    if (
      orderData.status === 'paid' ||
      orderData.status === 'shipped' ||
      orderData.status === 'completed'
    ) {
      return { status: orderData.status, alreadyPaid: true };
    }

    const reference = String(orderData.paystackReference || '');
    if (!reference) {
      throw new HttpsError('failed-precondition', 'Order has no payment reference.');
    }

    const verified = await fetchPaystackVerify(reference, paystackSecretKey.value());
    if (!isPaystackPaymentVerified(verified, Number(orderData.amountPesewas), reference)) {
      throw new HttpsError(
        'failed-precondition',
        'Payment has not been confirmed by Paystack yet.'
      );
    }

    const result = await settleOrderPaid(orderId, reference);
    return { status: 'paid', alreadyPaid: result === 'already_paid' };
  }
);

/**
 * Order fulfillment status transitions (seller -> shipped, buyer -> completed, or cancel unpaid).
 */
export const updateOrderStatus = onCall(async (request) => {
  const { uid } = assertVerifiedCaller(
    request.auth as { uid: string; token: Record<string, unknown> } | undefined
  );

  const orderId = request.data?.orderId;
  const nextStatus = request.data?.status as OrderStatus | undefined;

  if (!isValidFirestoreId(orderId) || !nextStatus) {
    throw new HttpsError('invalid-argument', 'Valid orderId and status are required.');
  }

  const orderRef = db.collection('orders').doc(orderId);

  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Order not found.');
    }

    const order = orderSnap.data()!;
    const currentStatus = order.status as OrderStatus;
    const buyerId = String(order.buyerId);
    const sellerId = String(order.sellerId);

    if (
      !canTransitionOrderStatus({
        currentStatus,
        nextStatus,
        actorUid: uid,
        buyerId,
        sellerId,
      })
    ) {
      throw new HttpsError(
        'permission-denied',
        `Transition from "${currentStatus}" to "${nextStatus}" is not permitted.`
      );
    }

    const updates: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (nextStatus === 'shipped') {
      updates.shippedAt = FieldValue.serverTimestamp();
    } else if (nextStatus === 'completed') {
      updates.completedAt = FieldValue.serverTimestamp();
      updates.released = true;
      updates.releasedAt = FieldValue.serverTimestamp();

      const listingRef = db.collection('listings').doc(String(order.listingId));
      const listingSnap = await tx.get(listingRef);
      if (listingSnap.exists && listingSnap.data()?.status === 'reserved') {
        tx.update(listingRef, {
          status: 'sold',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } else if (nextStatus === 'cancelled') {
      updates.cancelledAt = FieldValue.serverTimestamp();
    }

    tx.update(orderRef, updates);
  });

  return { orderId, status: nextStatus };
});

/**
 * Optional manual payment / bank transfer receipt upload step.
 * Allows the verified buyer to flag an unpaid order as paid by supplying a transfer reference and/or receipt image.
 */
export const submitPaymentReceipt = onCall(async (request) => {
  const { uid } = assertVerifiedCaller(
    request.auth as { uid: string; token: Record<string, unknown> } | undefined
  );

  const orderId = request.data?.orderId;
  if (!isValidFirestoreId(orderId)) {
    throw new HttpsError('invalid-argument', 'A valid orderId is required.');
  }

  const validation = validateReceiptSubmission({
    manualReference: request.data?.manualReference,
    receiptImageUrl: request.data?.receiptImageUrl,
    receiptNote: request.data?.receiptNote,
  });

  if (!validation.valid || !validation.data) {
    throw new HttpsError(
      'invalid-argument',
      validation.error || 'Provide a transfer reference number or receipt image.'
    );
  }

  const validated = validation.data;
  const orderRef = db.collection('orders').doc(orderId);

  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Order not found.');
    }

    const order = orderSnap.data()!;
    const currentStatus = order.status as OrderStatus;
    const buyerId = String(order.buyerId || '');

    if (uid !== buyerId) {
      throw new HttpsError(
        'permission-denied',
        'Only the buyer can flag this order as paid or upload a receipt.'
      );
    }

    if (!canSubmitManualReceipt(currentStatus, uid, buyerId)) {
      throw new HttpsError(
        'failed-precondition',
        `Cannot submit a receipt when order status is "${currentStatus}".`
      );
    }

    tx.update(orderRef, {
      status: 'payment_submitted',
      paymentMethod: 'manual_transfer',
      receiptStatus: 'submitted',
      manualReference: validated.manualReference,
      receiptImageUrl: validated.receiptImageUrl ?? FieldValue.delete(),
      receiptNote: validated.receiptNote ?? FieldValue.delete(),
      receiptSubmittedAt: FieldValue.serverTimestamp(),
      buyerFlaggedPaidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return {
    orderId,
    status: 'payment_submitted' as OrderStatus,
    receiptStatus: 'submitted' as const,
  };
});

/**
 * Seller review of a buyer-flagged manual transfer / receipt submission.
 * Verify marks the order paid and reserves the listing; Reject returns the order to pending_payment.
 */
export const reviewPaymentReceipt = onCall(async (request) => {
  const { uid } = assertVerifiedCaller(
    request.auth as { uid: string; token: Record<string, unknown> } | undefined
  );

  const orderId = request.data?.orderId;
  const decision = request.data?.decision;
  const rejectionNote = sanitizeReceiptText(request.data?.note, 300);

  if (!isValidFirestoreId(orderId)) {
    throw new HttpsError('invalid-argument', 'A valid orderId is required.');
  }

  if (decision !== 'verify' && decision !== 'reject') {
    throw new HttpsError('invalid-argument', 'Decision must be "verify" or "reject".');
  }

  const orderRef = db.collection('orders').doc(orderId);

  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Order not found.');
    }

    const order = orderSnap.data()!;
    const currentStatus = order.status as OrderStatus;
    const sellerId = String(order.sellerId || '');

    if (uid !== sellerId) {
      throw new HttpsError(
        'permission-denied',
        'Only the seller can review this payment receipt.'
      );
    }

    if (!canReviewManualReceipt(currentStatus, uid, sellerId)) {
      throw new HttpsError(
        'failed-precondition',
        `Order receipt cannot be reviewed from status "${currentStatus}".`
      );
    }

    if (decision === 'verify') {
      const listingRef = db.collection('listings').doc(String(order.listingId));
      const listingSnap = await tx.get(listingRef);

      tx.update(orderRef, {
        status: 'paid',
        receiptStatus: 'verified',
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (listingSnap.exists && listingSnap.data()?.status === 'active') {
        tx.update(listingRef, {
          status: 'reserved',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      const updates: Record<string, unknown> = {
        status: 'pending_payment',
        receiptStatus: 'rejected',
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (rejectionNote) {
        updates.receiptNote = rejectionNote;
      }
      tx.update(orderRef, updates);
    }
  });

  return {
    orderId,
    status: (decision === 'verify' ? 'paid' : 'pending_payment') as OrderStatus,
    receiptStatus: (decision === 'verify' ? 'verified' : 'rejected') as 'verified' | 'rejected',
  };
});

/**
 * Step 6 (Notices): Writes buyer and seller notification docs & queues Trigger Email on paid.
 */
export const onOrderStatusNotification = onDocumentWritten(
  {
    document: 'orders/{orderId}',
    database: FIRESTORE_DATABASE_ID,
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) {
      return;
    }

    const beforeData = event.data?.before?.data();
    const afterData = afterSnap.data();
    if (!afterData) return;

    const beforeStatus = typeof beforeData?.status === 'string' ? beforeData.status : undefined;
    const afterStatus = typeof afterData.status === 'string' ? afterData.status : undefined;

    if (!shouldTriggerOrderAlert(beforeStatus, afterStatus)) {
      return;
    }

    const order: OrderSnapshotData = {
      id: String(afterData.id || event.params.orderId),
      listingId: String(afterData.listingId || ''),
      listingTitle: String(afterData.listingTitle || 'Campus item'),
      buyerId: String(afterData.buyerId || ''),
      sellerId: String(afterData.sellerId || ''),
      amountPesewas: Number(afterData.amountPesewas || 0),
      sellerAmountPesewas:
        typeof afterData.sellerAmountPesewas === 'number'
          ? afterData.sellerAmountPesewas
          : undefined,
      status: afterStatus,
    };

    if (!order.buyerId || !order.sellerId || !order.listingId) {
      return;
    }

    const { buyer, seller } = buildOrderNotificationPayloads(order, afterStatus);
    const buyerRef = db.collection('notifications').doc(buyer.id);
    const sellerRef = db.collection('notifications').doc(seller.id);

    await db.runTransaction(async (tx) => {
      const [existingBuyer, existingSeller] = await Promise.all([
        tx.get(buyerRef),
        tx.get(sellerRef),
      ]);

      if (!existingBuyer.exists) {
        tx.set(buyerRef, {
          ...buyer,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      if (!existingSeller.exists) {
        tx.set(sellerRef, {
          ...seller,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });

    if (afterStatus === 'paid') {
      const [buyerEmail, sellerEmail] = await Promise.all([
        getVerifiedUserEmail(order.buyerId),
        getVerifiedUserEmail(order.sellerId),
      ]);

      const mailDocs = buildPaymentEmailDocuments({
        order,
        buyerEmail,
        sellerEmail,
      });

      if (mailDocs.length > 0) {
        await db.runTransaction(async (tx) => {
          for (const mailDoc of mailDocs) {
            const mailRef = db.collection('mail').doc(mailDoc.id);
            const existingMail = await tx.get(mailRef);
            if (!existingMail.exists) {
              tx.set(mailRef, {
                to: mailDoc.to,
                message: mailDoc.message,
                createdAt: FieldValue.serverTimestamp(),
              });
            }
          }
        });
      }
    }
  }
);
