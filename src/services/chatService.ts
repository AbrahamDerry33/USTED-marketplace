import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  sanitizeParticipantName,
  validateChatMessageInput,
} from '../lib/chat';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { isValidFirestoreId } from '../lib/listingValidation';
import type {
  ListingChatMessage,
  ListingChatMessageType,
  ListingChatSenderRole,
  ListingChatThread,
} from '../types/marketplace';

function mapThreadData(
  data: DocumentData,
  fallbackListingId: string,
  fallbackBuyerId: string
): ListingChatThread {
  return {
    listingId: String(data.listingId || fallbackListingId),
    buyerId: String(data.buyerId || fallbackBuyerId),
    sellerId: String(data.sellerId || ''),
    buyerName: String(data.buyerName || 'Campus Buyer'),
    sellerName: String(data.sellerName || 'Campus Seller'),
    lastMessageText: String(data.lastMessageText || ''),
    lastMessageSenderId: String(data.lastMessageSenderId || ''),
    lastOfferPesewas:
      typeof data.lastOfferPesewas === 'number' && Number.isInteger(data.lastOfferPesewas)
        ? data.lastOfferPesewas
        : undefined,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null,
  };
}

function mapThreadSnap(
  snapshot: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>,
  fallbackListingId: string
): ListingChatThread | null {
  const data = snapshot.data();
  if (!data) return null;
  return mapThreadData(data, fallbackListingId, snapshot.id);
}

function mapMessageDoc(snapshot: QueryDocumentSnapshot<DocumentData>): ListingChatMessage {
  const data = snapshot.data();
  return {
    id: String(data.id || snapshot.id),
    listingId: String(data.listingId || ''),
    buyerId: String(data.buyerId || ''),
    sellerId: String(data.sellerId || ''),
    senderId: String(data.senderId || ''),
    senderName: String(data.senderName || 'Campus Student'),
    senderRole: data.senderRole === 'seller' ? 'seller' : 'buyer',
    type: data.type === 'offer' ? 'offer' : 'text',
    body: String(data.body || ''),
    offerPesewas:
      typeof data.offerPesewas === 'number' && Number.isInteger(data.offerPesewas)
        ? data.offerPesewas
        : undefined,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
  };
}

export function subscribeBuyerListingThread(
  listingId: string,
  buyerId: string,
  onData: (thread: ListingChatThread | null) => void,
  onError: (err: Error) => void
): () => void {
  const path = `listings/${listingId}/threads/${buyerId}`;
  if (!isValidFirestoreId(listingId) || !isValidFirestoreId(buyerId)) {
    onData(null);
    return () => {};
  }

  const threadRef = doc(db, 'listings', listingId, 'threads', buyerId);

  return onSnapshot(
    threadRef,
    (snapshot) => {
      onData(snapshot.exists() ? mapThreadSnap(snapshot, listingId) : null);
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

export function subscribeSellerListingThreads(
  listingId: string,
  sellerId: string,
  onData: (threads: ListingChatThread[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = `listings/${listingId}/threads`;
  if (!isValidFirestoreId(listingId) || !isValidFirestoreId(sellerId)) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, path), where('sellerId', '==', sellerId));

  return onSnapshot(
    q,
    (snapshot) => {
      const threads: ListingChatThread[] = [];
      for (const docSnap of snapshot.docs) {
        const mapped = mapThreadSnap(docSnap, listingId);
        if (mapped) threads.push(mapped);
      }
      onData(threads);
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

export function subscribeListingChatMessages(
  listingId: string,
  buyerId: string,
  viewerId: string,
  viewerRole: ListingChatSenderRole,
  onData: (messages: ListingChatMessage[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = `listings/${listingId}/threads/${buyerId}/messages`;
  if (
    !isValidFirestoreId(listingId) ||
    !isValidFirestoreId(buyerId) ||
    !isValidFirestoreId(viewerId)
  ) {
    onData([]);
    return () => {};
  }

  // Single equality filter satisfies allow list statically with zero composite index
  const filterField = viewerRole === 'buyer' ? 'buyerId' : 'sellerId';
  const q = query(collection(db, path), where(filterField, '==', viewerId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => mapMessageDoc(d));
      onData(items);
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

export async function sendListingChatMessage(params: {
  listingId: string;
  buyerId: string;
  sellerId: string;
  buyerName: string;
  sellerName: string;
  senderId: string;
  senderName: string;
  senderRole: ListingChatSenderRole;
  type: ListingChatMessageType;
  body: string;
  offerGhs?: string;
}): Promise<void> {
  if (
    !isValidFirestoreId(params.listingId) ||
    !isValidFirestoreId(params.buyerId) ||
    !isValidFirestoreId(params.sellerId) ||
    !isValidFirestoreId(params.senderId)
  ) {
    throw new Error('Invalid conversation identifier.');
  }

  if (params.buyerId === params.sellerId) {
    throw new Error('You cannot start a chat on your own listing.');
  }

  const validation = validateChatMessageInput({
    type: params.type,
    body: params.body,
    offerGhs: params.offerGhs,
    senderName: params.senderName,
    senderRole: params.senderRole,
  });

  if (!validation.valid || !validation.payload) {
    const firstError =
      Object.values(validation.errors)[0] || 'Check your message or offer before sending.';
    throw new Error(firstError);
  }

  const threadPath = `listings/${params.listingId}/threads/${params.buyerId}`;
  const threadRef = doc(db, 'listings', params.listingId, 'threads', params.buyerId);
  const messagesColRef = collection(
    db,
    'listings',
    params.listingId,
    'threads',
    params.buyerId,
    'messages'
  );
  const messageRef = doc(messagesColRef);
  const messagePath = `${threadPath}/messages/${messageRef.id}`;

  let threadExists = false;
  try {
    const snap = await getDoc(threadRef);
    threadExists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, threadPath);
  }

  if (!threadExists && params.senderRole !== 'buyer') {
    throw new Error('This buyer conversation does not exist yet.');
  }

  const batch = writeBatch(db);

  if (!threadExists) {
    const threadCreatePayload: Record<string, unknown> = {
      listingId: params.listingId,
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      buyerName: sanitizeParticipantName(params.buyerName, 'Campus Buyer'),
      sellerName: sanitizeParticipantName(params.sellerName, 'Campus Seller'),
      lastMessageText: validation.payload.previewText,
      lastMessageSenderId: params.senderId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (validation.payload.offerPesewas !== undefined) {
      threadCreatePayload.lastOfferPesewas = validation.payload.offerPesewas;
    }
    batch.set(threadRef, threadCreatePayload);
  } else {
    const threadUpdatePayload: Record<string, unknown> = {
      lastMessageText: validation.payload.previewText,
      lastMessageSenderId: params.senderId,
      updatedAt: serverTimestamp(),
    };
    if (validation.payload.offerPesewas !== undefined) {
      threadUpdatePayload.lastOfferPesewas = validation.payload.offerPesewas;
    }
    batch.update(threadRef, threadUpdatePayload);
  }

  const messagePayload: Record<string, unknown> = {
    id: messageRef.id,
    listingId: params.listingId,
    buyerId: params.buyerId,
    sellerId: params.sellerId,
    senderId: params.senderId,
    senderName: validation.payload.senderName,
    senderRole: params.senderRole,
    type: validation.payload.type,
    body: validation.payload.body,
    createdAt: serverTimestamp(),
  };

  if (validation.payload.type === 'offer' && validation.payload.offerPesewas !== undefined) {
    messagePayload.offerPesewas = validation.payload.offerPesewas;
  }

  batch.set(messageRef, messagePayload);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, messagePath);
  }
}
