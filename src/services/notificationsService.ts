import {
  collection,
  doc,
  limit,
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
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { AppNotification, NotificationEventType } from '../types/marketplace';

function mapNotificationDoc(
  snapshot: QueryDocumentSnapshot<DocumentData>
): AppNotification {
  const data = snapshot.data();
  return {
    id: String(data.id || snapshot.id),
    userId: String(data.userId || ''),
    orderId: String(data.orderId || ''),
    listingId: String(data.listingId || ''),
    eventType: data.eventType as NotificationEventType,
    recipientRole: data.recipientRole === 'seller' ? 'seller' : 'buyer',
    title: String(data.title || ''),
    body: String(data.body || ''),
    read: Boolean(data.read),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    readAt: data.readAt?.toDate ? data.readAt.toDate() : null,
  };
}

export function subscribeUserNotifications(
  userId: string,
  onData: (notifications: AppNotification[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'notifications';
  const q = query(
    collection(db, path),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(25)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map(mapNotificationDoc));
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

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
      readAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsAsRead(
  notifications: AppNotification[]
): Promise<void> {
  const unread = notifications.filter((item) => !item.read);
  if (unread.length === 0) return;

  const batch = writeBatch(db);
  for (const item of unread) {
    batch.update(doc(db, 'notifications', item.id), {
      read: true,
      readAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'notifications');
  }
}
