import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import {
  isValidFirestoreId,
  validateImageFiles,
  validateListingForm,
} from '../lib/listingValidation';
import type {
  Listing,
  ListingCategory,
  ListingFormValues,
  ListingStatus,
} from '../types/marketplace';

function mapListingDoc(snapshot: QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData }): Listing {
  const data = snapshot.data();
  return {
    id: String(data.id || snapshot.id),
    sellerId: String(data.sellerId || ''),
    sellerName: String(data.sellerName || 'Seller'),
    sellerVerifiedStudent: Boolean(data.sellerVerifiedStudent),
    title: String(data.title || ''),
    description: String(data.description || ''),
    pricePesewas: Number(data.pricePesewas || 0),
    category: data.category,
    condition: data.condition,
    images: Array.isArray(data.images) ? data.images.map(String) : [],
    status: data.status,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null,
  };
}

export function subscribeActiveListings(
  onData: (listings: Listing[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'listings';
  const q = query(
    collection(db, path),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => mapListingDoc(d));
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

export function subscribeMyListings(
  sellerId: string,
  onData: (listings: Listing[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'listings';
  const q = query(
    collection(db, path),
    where('sellerId', '==', sellerId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => mapListingDoc(d));
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

export async function getListingById(listingId: string): Promise<Listing | null> {
  const path = `listings/${listingId}`;
  try {
    const snap = await getDoc(doc(db, 'listings', listingId));
    if (!snap.exists()) return null;
    return mapListingDoc({ id: snap.id, data: () => snap.data() });
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getCategoryListingsLast30Days(
  category: ListingCategory,
  days = 30
): Promise<Listing[]> {
  const path = 'listings';
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const q = query(
    collection(db, path),
    where('status', '==', 'active'),
    where('category', '==', category),
    where('createdAt', '>=', Timestamp.fromDate(cutoff)),
    orderBy('createdAt', 'desc'),
    limit(250)
  );

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => mapListingDoc(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getActiveListingsBySeller(
  sellerId: string,
  maxItems = 50
): Promise<Listing[]> {
  if (!isValidFirestoreId(sellerId)) {
    return [];
  }

  const path = 'listings';
  // Two equality filters without orderBy use automatic single-field index merging
  // and satisfy Firestore allow-list rules (status == 'active') for any verified buyer.
  const q = query(
    collection(db, path),
    where('status', '==', 'active'),
    where('sellerId', '==', sellerId),
    limit(maxItems)
  );

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((d) => mapListingDoc(d))
      .sort((a, b) => {
        const timeA = a.createdAt ? a.createdAt.getTime() : 0;
        const timeB = b.createdAt ? b.createdAt.getTime() : 0;
        return timeB - timeA;
      });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

async function uploadListingImages(
  uid: string,
  listingId: string,
  files: File[],
  onProgress?: (percent: number) => void
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const storagePath = `listings/${uid}/${listingId}/${Date.now()}_${i}_${safeName}`;
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
    });

    const url = await new Promise<string>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => {
          if (onProgress && snap.totalBytes > 0) {
            const fileProgress = snap.bytesTransferred / snap.totalBytes;
            const totalProgress = Math.round(((i + fileProgress) / files.length) * 100);
            onProgress(totalProgress);
          }
        },
        (err) => reject(err),
        async () => {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          resolve(downloadUrl);
        }
      );
    });

    urls.push(url);
  }
  return urls;
}

export async function createListing(params: {
  uid: string;
  sellerName: string;
  sellerVerifiedStudent?: boolean;
  values: ListingFormValues;
  files: File[];
  onProgress?: (percent: number) => void;
}): Promise<string> {
  const fileError = validateImageFiles(params.files, 0);
  if (fileError) {
    throw new Error(fileError);
  }

  const validation = validateListingForm(params.values, params.files.length);
  if (!validation.valid || !validation.payload) {
    const firstErr = Object.values(validation.errors)[0] || 'Check the listing details.';
    throw new Error(firstErr);
  }

  const listingRef = doc(collection(db, 'listings'));
  const listingId = listingRef.id;
  const imageUrls = await uploadListingImages(
    params.uid,
    listingId,
    params.files,
    params.onProgress
  );

  const path = `listings/${listingId}`;
  try {
    await setDoc(listingRef, {
      id: listingId,
      sellerId: params.uid,
      sellerName: params.sellerName.trim().slice(0, 60) || 'Campus Seller',
      ...(params.sellerVerifiedStudent ? { sellerVerifiedStudent: true } : {}),
      title: validation.payload.title,
      description: validation.payload.description,
      pricePesewas: validation.payload.pricePesewas,
      category: validation.payload.category,
      condition: validation.payload.condition,
      images: imageUrls,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return listingId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateListing(params: {
  uid: string;
  sellerName: string;
  sellerVerifiedStudent?: boolean;
  listingId: string;
  values: ListingFormValues;
  existingImages: string[];
  newFiles: File[];
  status: ListingStatus;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  if (params.newFiles.length > 0) {
    const fileError = validateImageFiles(params.newFiles, params.existingImages.length);
    if (fileError) {
      throw new Error(fileError);
    }
  }

  const totalImages = params.existingImages.length + params.newFiles.length;
  const validation = validateListingForm(params.values, totalImages);
  if (!validation.valid || !validation.payload) {
    const firstErr = Object.values(validation.errors)[0] || 'Check the listing details.';
    throw new Error(firstErr);
  }

  const uploadedUrls =
    params.newFiles.length > 0
      ? await uploadListingImages(params.uid, params.listingId, params.newFiles, params.onProgress)
      : [];

  const finalImages = [...params.existingImages, ...uploadedUrls].slice(0, 5);
  const path = `listings/${params.listingId}`;
  try {
    await updateDoc(doc(db, 'listings', params.listingId), {
      sellerName: params.sellerName.trim().slice(0, 60) || 'Campus Seller',
      sellerVerifiedStudent: Boolean(params.sellerVerifiedStudent),
      title: validation.payload.title,
      description: validation.payload.description,
      pricePesewas: validation.payload.pricePesewas,
      category: validation.payload.category,
      condition: validation.payload.condition,
      images: finalImages,
      status: params.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateListingStatus(
  listingId: string,
  status: ListingStatus
): Promise<void> {
  const path = `listings/${listingId}`;
  try {
    await updateDoc(doc(db, 'listings', listingId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
