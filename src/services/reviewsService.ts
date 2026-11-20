import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { isValidFirestoreId } from '../lib/listingValidation';
import { validateSellerReviewInput } from '../lib/reviews';
import type { SellerReview } from '../types/marketplace';

function mapReviewDoc(snapshot: QueryDocumentSnapshot<DocumentData>): SellerReview {
  const data = snapshot.data();
  return {
    sellerId: String(data.sellerId || ''),
    reviewerId: String(data.reviewerId || snapshot.id),
    orderId: typeof data.orderId === 'string' ? data.orderId : undefined,
    reviewerName: String(data.reviewerName || 'Campus Student'),
    rating: Number(data.rating || 0),
    comment: String(data.comment || ''),
    listingId: typeof data.listingId === 'string' ? data.listingId : undefined,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null,
  };
}

export function subscribeSellerReviews(
  sellerId: string,
  onData: (reviews: SellerReview[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = `users/${sellerId}/reviews`;
  if (!isValidFirestoreId(sellerId)) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, path), where('sellerId', '==', sellerId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => mapReviewDoc(d));
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

export async function submitSellerReview(params: {
  sellerId: string;
  reviewerId: string;
  orderId?: string;
  reviewerName: string;
  rating: number;
  comment: string;
  listingId?: string;
  isUpdate: boolean;
}): Promise<void> {
  if (!isValidFirestoreId(params.sellerId) || !isValidFirestoreId(params.reviewerId)) {
    throw new Error('Invalid seller or reviewer identifier.');
  }
  if (params.sellerId === params.reviewerId) {
    throw new Error('You cannot review your own seller profile.');
  }

  const validation = validateSellerReviewInput({
    rating: params.rating,
    comment: params.comment,
    reviewerName: params.reviewerName,
  });

  if (!validation.valid || !validation.payload) {
    const firstError = Object.values(validation.errors)[0] || 'Check your rating and review comment.';
    throw new Error(firstError);
  }

  const path = `users/${params.sellerId}/reviews/${params.reviewerId}`;
  const reviewRef = doc(db, 'users', params.sellerId, 'reviews', params.reviewerId);

  if (params.isUpdate) {
    try {
      await updateDoc(reviewRef, {
        rating: validation.payload.rating,
        comment: validation.payload.comment,
        reviewerName: validation.payload.reviewerName,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return;
  }

  if (!params.orderId || !isValidFirestoreId(params.orderId)) {
    throw new Error('You need at least one completed order with this seller to leave a review.');
  }

  const payload: Record<string, unknown> = {
    sellerId: params.sellerId,
    reviewerId: params.reviewerId,
    orderId: params.orderId,
    reviewerName: validation.payload.reviewerName,
    rating: validation.payload.rating,
    comment: validation.payload.comment,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.listingId && isValidFirestoreId(params.listingId)) {
    payload.listingId = params.listingId;
  }

  try {
    await setDoc(reviewRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteSellerReview(sellerId: string, reviewerId: string): Promise<void> {
  if (!isValidFirestoreId(sellerId) || !isValidFirestoreId(reviewerId)) {
    throw new Error('Invalid seller or reviewer identifier.');
  }

  const path = `users/${sellerId}/reviews/${reviewerId}`;
  try {
    await deleteDoc(doc(db, 'users', sellerId, 'reviews', reviewerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
