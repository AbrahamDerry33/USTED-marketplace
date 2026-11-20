import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser } from '../db/repository.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: {
    id: number;
    uid: string;
    email: string;
  };
}

export async function verifyVerifiedStudentToken(token: string) {
  const decodedToken = await adminAuth.verifyIdToken(token);
  if (!decodedToken.email_verified) {
    throw new Error('Verified email is required.');
  }
  const dbUser = await getOrCreateUser(decodedToken.uid, decodedToken.email || '');
  return { decodedToken, dbUser };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Empty authentication token.' });
    return;
  }

  try {
    const { decodedToken, dbUser } = await verifyVerifiedStudentToken(token);
    req.user = decodedToken;
    req.dbUser = dbUser;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    if (message === 'Verified email is required.') {
      res.status(403).json({ error: message });
      return;
    }
    if (message.startsWith('Unable to load user profile')) {
      res.status(500).json({ error: message });
      return;
    }
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
};
