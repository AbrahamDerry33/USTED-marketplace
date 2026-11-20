import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { isValidFirestoreId, isValidListingCategory } from '../lib/listingValidation';
import {
  buildSavedFavoriteWriteFields,
  type SavedItemSnapshotInput,
} from '../lib/savedItems';
import type { FavoriteItem } from '../types/marketplace';

function mapFavoriteDoc(snapshot: QueryDocumentSnapshot<DocumentData>): FavoriteItem {
  const data = snapshot.data();
  const item: FavoriteItem = {
    userId: String(data.userId || ''),
    listingId: String(data.listingId || snapshot.id),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
  };

  if (typeof data.savedTitle === 'string' && data.savedTitle.trim().length > 0) {
    item.savedTitle = data.savedTitle;
  }

  if (typeof data.savedPricePesewas === 'number' && Number.isInteger(data.savedPricePesewas)) {
    item.savedPricePesewas = data.savedPricePesewas;
  }

  if (typeof data.savedCategory === 'string' && isValidListingCategory(data.savedCategory)) {
    item.savedCategory = data.savedCategory;
  }

  return item;
}

export function subscribeUserFavorites(
  userId: string,
  onData: (favorites: FavoriteItem[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = `users/${userId}/favorites`;
  if (!isValidFirestoreId(userId)) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, path), where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => mapFavoriteDoc(d))
        .sort((a, b) => {
          const timeA = a.createdAt ? a.createdAt.getTime() : Number.MAX_SAFE_INTEGER;
          const timeB = b.createdAt ? b.createdAt.getTime() : Number.MAX_SAFE_INTEGER;
          return timeB - timeA;
        });
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

export async function addFavorite(
  userId: string,
  listingId: string,
  snapshot?: SavedItemSnapshotInput
): Promise<void> {
  const payloadFields = buildSavedFavoriteWriteFields(userId, listingId, snapshot);

  const path = `users/${userId}/favorites/${listingId}`;
  try {
    await setDoc(doc(db, 'users', userId, 'favorites', listingId), {
      ...payloadFields,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeFavorite(userId: string, listingId: string): Promise<void> {
  if (!isValidFirestoreId(userId) || !isValidFirestoreId(listingId)) {
    throw new Error('Invalid user or listing identifier.');
  }

  const path = `users/${userId}/favorites/${listingId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'favorites', listingId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function removeFavoritesBatch(userId: string, listingIds: string[]): Promise<void> {
  if (!isValidFirestoreId(userId)) {
    throw new Error('Invalid user identifier.');
  }

  const validIds = Array.from(new Set(listingIds.filter((id) => isValidFirestoreId(id))));
  if (validIds.length === 0) return;

  const path = `users/${userId}/favorites`;
  const CHUNK_SIZE = 400;

  try {
    for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
      const chunk = validIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const listingId of chunk) {
        batch.delete(doc(db, 'users', userId, 'favorites', listingId));
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
