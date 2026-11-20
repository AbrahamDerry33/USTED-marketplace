import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { isValidFirestoreId } from '../lib/listingValidation';
import { validateMoMoProfileInput } from '../lib/localPayments';
import type { MoMoNetwork, UserPublicProfile } from '../types/marketplace';

function parseMoMoNetwork(value: unknown): MoMoNetwork | undefined {
  return value === 'mtn' || value === 'telecel' || value === 'at' ? value : undefined;
}

export async function getUserPublicProfile(userId: string): Promise<UserPublicProfile | null> {
  if (!isValidFirestoreId(userId)) {
    return null;
  }

  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      uid: String(data.uid || snap.id),
      displayName: String(data.displayName || 'Student Seller'),
      campus: typeof data.campus === 'string' && data.campus.trim() ? data.campus.trim() : undefined,
      momoNetwork: parseMoMoNetwork(data.momoNetwork),
      momoNumber:
        typeof data.momoNumber === 'string' && data.momoNumber.trim()
          ? data.momoNumber.trim()
          : undefined,
      momoAccountName:
        typeof data.momoAccountName === 'string' && data.momoAccountName.trim()
          ? data.momoAccountName.trim()
          : undefined,
      verifiedStudent: Boolean(data.verifiedStudent),
      role: data.role === 'admin' ? 'admin' : 'student',
      banned: Boolean(data.banned),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function updateUserMoMoProfile(
  userId: string,
  input: {
    momoNetwork: string;
    momoNumber: string;
    momoAccountName: string;
  }
): Promise<{ momoNetwork: MoMoNetwork; momoNumber: string; momoAccountName: string }> {
  if (!isValidFirestoreId(userId)) {
    throw new Error('Invalid user profile identifier.');
  }

  const validation = validateMoMoProfileInput(input);
  if (!validation.valid || !validation.payload) {
    const firstErr = Object.values(validation.errors)[0] || 'Check your Mobile Money details.';
    throw new Error(firstErr);
  }

  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      momoNetwork: validation.payload.momoNetwork,
      momoNumber: validation.payload.momoNumber,
      momoAccountName: validation.payload.momoAccountName,
    });
    return validation.payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

