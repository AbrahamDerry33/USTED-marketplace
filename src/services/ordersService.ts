import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, functions, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import { isValidFirestoreId, stripHtmlTags } from '../lib/listingValidation';
import {
  calculateLocalOrderAmounts,
  generateHandoverPin,
  isValidHandoverPin,
  resolveInitialPaymentStatus,
  resolveNormalizedPaymentStatus,
  validateMoMoProofInput,
} from '../lib/localPayments';
import { findCompletedOrderForSeller } from '../lib/reviews';
import { getUserPublicProfile } from './usersService';
import type {
  Listing,
  LocalPaymentMethod,
  MoMoNetwork,
  Order,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  ReceiptStatus,
} from '../types/marketplace';

const ALLOWED_RECEIPT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export interface CreateOrderResult {
  orderId: string;
  reference: string;
  authorizationUrl: string;
  accessCode: string;
  amountPesewas: number;
  commissionPesewas: number;
  sellerAmountPesewas: number;
}

export interface CreateLocalOrderResult {
  orderId: string;
  reference: string;
  handoverPin: string;
  paymentMethod: LocalPaymentMethod;
  paymentStatus: OrderPaymentStatus;
}

function parsePaymentMethod(raw: unknown): PaymentMethod {
  if (
    raw === 'pay_on_meetup' ||
    raw === 'momo_prepayment' ||
    raw === 'manual_transfer' ||
    raw === 'paystack'
  ) {
    return raw;
  }
  return 'paystack';
}

function parseMoMoNetwork(raw: unknown): MoMoNetwork | undefined {
  return raw === 'mtn' || raw === 'telecel' || raw === 'at' ? raw : undefined;
}

function mapOrderDoc(
  snapshot: QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData }
): Order {
  const data = snapshot.data();
  const paymentMethod = parsePaymentMethod(data.paymentMethod);
  const receiptStatus: ReceiptStatus =
    data.receiptStatus === 'submitted' ||
    data.receiptStatus === 'verified' ||
    data.receiptStatus === 'rejected'
      ? data.receiptStatus
      : 'none';
  const status = data.status as OrderStatus;
  const paymentStatus = resolveNormalizedPaymentStatus({
    paymentMethod,
    paymentStatus: data.paymentStatus,
    status,
    receiptStatus,
  });

  const transactionId =
    typeof data.transactionId === 'string' && data.transactionId.trim()
      ? data.transactionId.trim()
      : typeof data.manualReference === 'string' && data.manualReference.trim()
        ? data.manualReference.trim()
        : undefined;

  const receiptUrl =
    typeof data.receiptUrl === 'string' && data.receiptUrl.trim()
      ? data.receiptUrl.trim()
      : typeof data.receiptImageUrl === 'string' && data.receiptImageUrl.trim()
        ? data.receiptImageUrl.trim()
        : undefined;

  return {
    id: String(data.id || snapshot.id),
    listingId: String(data.listingId || ''),
    listingTitle: String(data.listingTitle || 'Campus Item'),
    buyerId: String(data.buyerId || ''),
    sellerId: String(data.sellerId || ''),
    currency: 'GHS',
    amountPesewas: Number(data.amountPesewas || 0),
    commissionBps: Number(data.commissionBps || 0),
    commissionPesewas: Number(data.commissionPesewas || 0),
    sellerAmountPesewas: Number(data.sellerAmountPesewas || 0),
    paystackReference: String(data.paystackReference || ''),
    paymentMethod,
    paymentStatus,
    receiptStatus,
    transactionId,
    manualReference:
      typeof data.manualReference === 'string' && data.manualReference.trim()
        ? data.manualReference.trim()
        : transactionId,
    receiptUrl,
    receiptImageUrl:
      typeof data.receiptImageUrl === 'string' && data.receiptImageUrl.trim()
        ? data.receiptImageUrl.trim()
        : receiptUrl,
    receiptNote:
      typeof data.receiptNote === 'string' && data.receiptNote.trim()
        ? data.receiptNote.trim()
        : undefined,
    sellerMoMoNetwork: parseMoMoNetwork(data.sellerMoMoNetwork),
    sellerMoMoNumber:
      typeof data.sellerMoMoNumber === 'string' && data.sellerMoMoNumber.trim()
        ? data.sellerMoMoNumber.trim()
        : undefined,
    sellerMoMoAccountName:
      typeof data.sellerMoMoAccountName === 'string' && data.sellerMoMoAccountName.trim()
        ? data.sellerMoMoAccountName.trim()
        : undefined,
    handoverPinSet: Boolean(data.handoverPinSet),
    handoverPin:
      typeof data.handoverPin === 'string' && data.handoverPin.trim()
        ? data.handoverPin.trim()
        : undefined,
    receiptSubmittedAt: data.receiptSubmittedAt?.toDate ? data.receiptSubmittedAt.toDate() : null,
    buyerFlaggedPaidAt: data.buyerFlaggedPaidAt?.toDate ? data.buyerFlaggedPaidAt.toDate() : null,
    status,
    released: Boolean(data.released),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null,
    paidAt: data.paidAt?.toDate ? data.paidAt.toDate() : null,
    shippedAt: data.shippedAt?.toDate ? data.shippedAt.toDate() : null,
    completedAt: data.completedAt?.toDate ? data.completedAt.toDate() : null,
    releasedAt: data.releasedAt?.toDate ? data.releasedAt.toDate() : null,
    cancelledAt: data.cancelledAt?.toDate ? data.cancelledAt.toDate() : null,
  };
}

/**
 * Creates a Ghana-tailored local marketplace order (`pay_on_meetup` or `momo_prepayment`)
 * and stores the generated 4-digit handover PIN in the buyer-isolated `/secrets/handover` subdoc.
 */
export async function createLocalOrder(params: {
  listing: Listing;
  buyerId: string;
  paymentMethod: LocalPaymentMethod;
}): Promise<CreateLocalOrderResult> {
  const { listing, buyerId, paymentMethod } = params;

  if (!isValidFirestoreId(listing.id) || !isValidFirestoreId(buyerId)) {
    throw new Error('Sign in with a verified account to place an order.');
  }
  if (buyerId === listing.sellerId) {
    throw new Error('You cannot place an order on your own listing.');
  }
  if (listing.status !== 'active') {
    throw new Error('This listing is no longer available for checkout.');
  }

  const split = calculateLocalOrderAmounts(listing.pricePesewas);
  const handoverPin = generateHandoverPin();
  const initialPaymentStatus = resolveInitialPaymentStatus(paymentMethod);
  const orderRef = doc(collection(db, 'orders'));
  const secretRef = doc(db, 'orders', orderRef.id, 'secrets', 'handover');
  const reference = `CM-LOC-${orderRef.id.slice(0, 8).toUpperCase()}`;

  let sellerProfile = null;
  try {
    sellerProfile = await getUserPublicProfile(listing.sellerId);
  } catch {
    sellerProfile = null;
  }

  const path = `orders/${orderRef.id}`;
  try {
    const batch = writeBatch(db);
    batch.set(orderRef, {
      id: orderRef.id,
      listingId: listing.id,
      listingTitle: listing.title.slice(0, 100),
      buyerId,
      sellerId: listing.sellerId,
      currency: 'GHS',
      amountPesewas: split.amountPesewas,
      commissionBps: split.commissionBps,
      commissionPesewas: split.commissionPesewas,
      sellerAmountPesewas: split.sellerAmountPesewas,
      paystackReference: reference,
      paymentMethod,
      paymentStatus: initialPaymentStatus,
      receiptStatus: 'none',
      ...(sellerProfile?.momoNetwork ? { sellerMoMoNetwork: sellerProfile.momoNetwork } : {}),
      ...(sellerProfile?.momoNumber ? { sellerMoMoNumber: sellerProfile.momoNumber } : {}),
      ...(sellerProfile?.momoAccountName
        ? { sellerMoMoAccountName: sellerProfile.momoAccountName }
        : {}),
      handoverPinSet: true,
      status: 'pending_payment',
      released: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(secretRef, {
      orderId: orderRef.id,
      buyerId,
      sellerId: listing.sellerId,
      handoverPin,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return {
      orderId: orderRef.id,
      reference,
      handoverPin,
      paymentMethod,
      paymentStatus: initialPaymentStatus,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Subscribes to the buyer-only handover secret PIN document (`/orders/{orderId}/secrets/handover`).
 * Should only be called when the signed-in user is the order's buyer.
 */
export function subscribeBuyerHandoverPin(
  orderId: string,
  onData: (pin: string | null) => void,
  onError: (err: Error) => void
): () => void {
  if (!isValidFirestoreId(orderId)) {
    onData(null);
    return () => {};
  }

  const path = `orders/${orderId}/secrets/handover`;
  const secretRef = doc(db, 'orders', orderId, 'secrets', 'handover');

  return onSnapshot(
    secretRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      const pin = snapshot.data().handoverPin;
      onData(isValidHandoverPin(pin) ? pin : null);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/**
 * Buyer submits Mobile Money Transaction ID and optional transfer screenshot/receipt.
 * Transitions paymentStatus to 'proof_submitted' and order status to 'payment_submitted'.
 */
export async function submitMoMoPaymentProof(params: {
  orderId: string;
  transactionId: string;
  receiptUrl?: string;
  receiptNote?: string;
}): Promise<void> {
  if (!isValidFirestoreId(params.orderId)) {
    throw new Error('Invalid order ID.');
  }

  const validation = validateMoMoProofInput({
    transactionId: params.transactionId,
    receiptUrl: params.receiptUrl,
    receiptNote: params.receiptNote,
  });

  if (!validation.valid || !validation.data) {
    throw new Error(validation.error || 'Enter a valid MoMo Transaction ID.');
  }

  const path = `orders/${params.orderId}`;
  try {
    await updateDoc(doc(db, 'orders', params.orderId), {
      transactionId: validation.data.transactionId,
      manualReference: validation.data.transactionId,
      ...(validation.data.receiptUrl
        ? {
            receiptUrl: validation.data.receiptUrl,
            receiptImageUrl: validation.data.receiptUrl,
          }
        : {}),
      ...(validation.data.receiptNote ? { receiptNote: validation.data.receiptNote } : {}),
      paymentStatus: 'proof_submitted',
      receiptStatus: 'submitted',
      status: 'payment_submitted',
      receiptSubmittedAt: serverTimestamp(),
      buyerFlaggedPaidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Seller confirms receipt of the MoMo pre-payment ('verified') and atomically reserves the listing.
 */
export async function confirmMoMoPaymentReceived(params: {
  orderId: string;
  listingId: string;
}): Promise<void> {
  if (!isValidFirestoreId(params.orderId) || !isValidFirestoreId(params.listingId)) {
    throw new Error('Invalid order or listing ID.');
  }

  const path = `orders/${params.orderId}`;
  try {
    const orderRef = doc(db, 'orders', params.orderId);
    const listingRef = doc(db, 'listings', params.listingId);
    const listingSnap = await getDoc(listingRef);

    const batch = writeBatch(db);
    batch.update(orderRef, {
      paymentStatus: 'verified',
      receiptStatus: 'verified',
      status: 'paid',
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (listingSnap.exists() && listingSnap.data()?.status === 'active') {
      batch.update(listingRef, {
        status: 'reserved',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Seller flags an invalid or unconfirmed MoMo payment proof, returning paymentStatus to 'unpaid'
 * so the buyer can re-submit a valid Transaction ID or receipt.
 */
export async function rejectMoMoPaymentProof(params: {
  orderId: string;
  note?: string;
}): Promise<void> {
  if (!isValidFirestoreId(params.orderId)) {
    throw new Error('Invalid order ID.');
  }

  const cleanNote = params.note ? stripHtmlTags(params.note).slice(0, 300) : '';
  const path = `orders/${params.orderId}`;
  try {
    await updateDoc(doc(db, 'orders', params.orderId), {
      paymentStatus: 'unpaid',
      receiptStatus: 'rejected',
      status: 'pending_payment',
      ...(cleanNote ? { receiptNote: cleanNote } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Seller marks a verified local order as shipped/en-route to campus meetup.
 */
export async function markLocalOrderShipped(orderId: string): Promise<void> {
  if (!isValidFirestoreId(orderId)) {
    throw new Error('Invalid order ID.');
  }
  const path = `orders/${orderId}`;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      status: 'shipped',
      shippedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Seller cancels a pending local order directly in Firestore.
 */
export async function cancelLocalOrder(orderId: string): Promise<void> {
  if (!isValidFirestoreId(orderId)) {
    throw new Error('Invalid order ID.');
  }
  const path = `orders/${orderId}`;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Seller enters the buyer's 4-digit handover PIN at the physical campus meetup.
 * Atomically updates order to `completed` (and `paymentStatus: 'verified'`, `released: true`),
 * marks the listing as `sold`, and records `completedAt` — enforced by Firestore Security Rules.
 */
export async function confirmCampusHandoverWithPin(params: {
  orderId: string;
  listingId: string;
  enteredPin: string;
}): Promise<void> {
  const { orderId, listingId, enteredPin } = params;
  if (!isValidFirestoreId(orderId) || !isValidFirestoreId(listingId)) {
    throw new Error('Invalid order or listing ID.');
  }
  if (!isValidHandoverPin(enteredPin)) {
    throw new Error('Enter the buyer’s 4-digit numeric handover PIN.');
  }

  const path = `orders/${orderId}`;
  try {
    const orderRef = doc(db, 'orders', orderId);
    const listingRef = doc(db, 'listings', listingId);
    const listingSnap = await getDoc(listingRef);

    const batch = writeBatch(db);
    batch.update(orderRef, {
      status: 'completed',
      paymentStatus: 'verified',
      handoverPin: enteredPin,
      released: true,
      completedAt: serverTimestamp(),
      releasedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (listingSnap.exists() && listingSnap.data()?.status !== 'removed') {
      batch.update(listingRef, {
        status: 'sold',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Initiates checkout strictly via Cloud Function.
 * The browser sends ONLY listingId and callbackUrl; price & commission are computed on the server.
 */
export async function createOrder(
  listingId: string,
  callbackUrl?: string
): Promise<CreateOrderResult> {
  const callable = httpsCallable<
    { listingId: string; callbackUrl?: string },
    CreateOrderResult
  >(functions, 'createOrder');

  const response = await callable(
    callbackUrl ? { listingId, callbackUrl } : { listingId }
  );
  return response.data;
}

export async function verifyOrderPayment(
  orderId: string
): Promise<{ status: OrderStatus; alreadyPaid: boolean }> {
  const callable = httpsCallable<
    { orderId: string },
    { status: OrderStatus; alreadyPaid: boolean }
  >(functions, 'verifyPayment');

  const response = await callable({ orderId });
  return response.data;
}

export async function updateOrderStatus(
  orderId: string,
  status: Extract<OrderStatus, 'shipped' | 'completed' | 'cancelled'>
): Promise<{ orderId: string; status: OrderStatus }> {
  const callable = httpsCallable<
    { orderId: string; status: string },
    { orderId: string; status: OrderStatus }
  >(functions, 'updateOrderStatus');

  const response = await callable({ orderId, status });
  return response.data;
}

export function validateReceiptFile(file: File): string | null {
  if (!ALLOWED_RECEIPT_MIME.has(file.type)) {
    return 'Receipt image must be JPEG, PNG, or WebP.';
  }
  if (file.size <= 0 || file.size > MAX_RECEIPT_BYTES) {
    return 'Receipt image must be under 5 MB.';
  }
  return null;
}

export async function uploadPaymentReceiptImage(
  uid: string,
  orderId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const err = validateReceiptFile(file);
  if (err) {
    throw new Error(err);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const storagePath = `receipts/${uid}/${orderId}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, storagePath);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
  });

  return new Promise<string>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (onProgress && snap.totalBytes > 0) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      (uploadErr) => reject(uploadErr),
      async () => {
        const downloadUrl = await getDownloadURL(task.snapshot.ref);
        resolve(downloadUrl);
      }
    );
  });
}

export async function submitPaymentReceipt(params: {
  orderId: string;
  manualReference?: string;
  receiptImageUrl?: string;
  receiptNote?: string;
}): Promise<{ orderId: string; status: OrderStatus; receiptStatus: ReceiptStatus }> {
  const callable = httpsCallable<
    {
      orderId: string;
      manualReference?: string;
      receiptImageUrl?: string;
      receiptNote?: string;
    },
    { orderId: string; status: OrderStatus; receiptStatus: ReceiptStatus }
  >(functions, 'submitPaymentReceipt');

  const response = await callable(params);
  return response.data;
}

export async function reviewPaymentReceipt(params: {
  orderId: string;
  decision: 'verify' | 'reject';
  note?: string;
}): Promise<{ orderId: string; status: OrderStatus; receiptStatus: ReceiptStatus }> {
  const callable = httpsCallable<
    { orderId: string; decision: 'verify' | 'reject'; note?: string },
    { orderId: string; status: OrderStatus; receiptStatus: ReceiptStatus }
  >(functions, 'reviewPaymentReceipt');

  const response = await callable(params);
  return response.data;
}

export function subscribeOrderById(
  orderId: string,
  onData: (order: Order | null) => void,
  onError: (err: Error) => void
): () => void {
  const path = `orders/${orderId}`;
  const orderRef = doc(db, 'orders', orderId);

  return onSnapshot(
    orderRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(mapOrderDoc({ id: snapshot.id, data: () => snapshot.data() }));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeBuyerOrders(
  buyerId: string,
  onData: (orders: Order[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'orders';
  const q = query(
    collection(db, path),
    where('buyerId', '==', buyerId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map(mapOrderDoc));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeSellerOrders(
  sellerId: string,
  onData: (orders: Order[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'orders';
  const q = query(
    collection(db, path),
    where('sellerId', '==', sellerId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map(mapOrderDoc));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/**
 * Subscribes in real time to the signed-in buyer's orders using the single-field
 * `buyerId` index (no composite index required, compliant with `/orders` `allow list`).
 */
export function subscribeBuyerOrdersForReview(
  buyerId: string,
  onData: (orders: Order[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'orders';
  if (!isValidFirestoreId(buyerId)) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, path), where('buyerId', '==', buyerId));

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map(mapOrderDoc));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/**
 * Queries the signed-in buyer's orders (single-field buyerId index, compliant with
 * `/orders` `allow list` rules) and returns the latest completed order with `sellerId`.
 */
export async function getBuyerCompletedOrderForSeller(
  buyerId: string,
  sellerId: string
): Promise<Order | null> {
  if (!isValidFirestoreId(buyerId) || !isValidFirestoreId(sellerId) || buyerId === sellerId) {
    return null;
  }

  const path = 'orders';
  try {
    const q = query(collection(db, path), where('buyerId', '==', buyerId));
    const snapshot = await getDocs(q);
    const buyerOrders = snapshot.docs.map(mapOrderDoc);
    return findCompletedOrderForSeller(buyerOrders, buyerId, sellerId);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}


