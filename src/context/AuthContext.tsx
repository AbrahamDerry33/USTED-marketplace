import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getConfiguredSchoolDomains } from '../config/marketplace';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  isAcademicStudentEmail,
  isValidEmailAddress,
  stripHtmlTags,
} from '../lib/listingValidation';
import type { UserPublicProfile } from '../types/marketplace';

interface AuthContextValue {
  user: User | null;
  profile: UserPublicProfile | null;
  loading: boolean;
  isVerified: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (params: {
    displayName: string;
    campus: string;
    email: string;
    password: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshUser: () => Promise<boolean>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastResendAt, setLastResendAt] = useState(0);

  const ensureUserProfileDocs = useCallback(async (firebaseUser: User) => {
    if (!firebaseUser.emailVerified) {
      setProfile(null);
      return;
    }

    const userPath = `users/${firebaseUser.uid}`;
    const privatePath = `users/${firebaseUser.uid}/private/info`;
    const verifiedStudent = Boolean(
      firebaseUser.emailVerified &&
        isAcademicStudentEmail(firebaseUser.email, getConfiguredSchoolDomains())
    );

    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        const cleanName = stripHtmlTags(firebaseUser.displayName || 'Campus Member').slice(0, 60);
        const safeName = cleanName.length >= 2 ? cleanName : 'Campus Member';
        await setDoc(userRef, {
          uid: firebaseUser.uid,
          displayName: safeName,
          verifiedStudent,
          role: 'student',
          banned: false,
          createdAt: serverTimestamp(),
        });

        const privateRef = doc(db, 'users', firebaseUser.uid, 'private', 'info');
        const privateSnap = await getDoc(privateRef);
        if (!privateSnap.exists() && firebaseUser.email) {
          await setDoc(privateRef, {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            createdAt: serverTimestamp(),
          });
        }

        setProfile({
          uid: firebaseUser.uid,
          displayName: safeName,
          verifiedStudent,
          role: 'student',
          banned: false,
          createdAt: new Date(),
        });
      } else {
        const data = snap.data();
        if (Boolean(data.verifiedStudent) !== verifiedStudent) {
          await updateDoc(userRef, { verifiedStudent }).catch(() => undefined);
        }
        const momoNetwork =
          data.momoNetwork === 'mtn' ||
          data.momoNetwork === 'telecel' ||
          data.momoNetwork === 'at'
            ? data.momoNetwork
            : undefined;
        setProfile({
          uid: String(data.uid || firebaseUser.uid),
          displayName: String(data.displayName || firebaseUser.displayName || 'Campus Member'),
          campus: typeof data.campus === 'string' ? data.campus : undefined,
          momoNetwork,
          momoNumber:
            typeof data.momoNumber === 'string' && data.momoNumber.trim()
              ? data.momoNumber.trim()
              : undefined,
          momoAccountName:
            typeof data.momoAccountName === 'string' && data.momoAccountName.trim()
              ? data.momoAccountName.trim()
              : undefined,
          verifiedStudent,
          role: data.role === 'admin' ? 'admin' : 'student',
          banned: Boolean(data.banned),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${userPath} / ${privatePath}`);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      const verified = Boolean(currentUser?.emailVerified);
      setIsVerified(verified);

      if (currentUser && verified) {
        try {
          await ensureUserProfileDocs(currentUser);
        } catch {
          // Error is logged cleanly via handleFirestoreError
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [ensureUserProfileDocs]);

  const signIn = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      throw new Error('Enter your email and password.');
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      setUser(cred.user);
      const verified = Boolean(cred.user.emailVerified);
      setIsVerified(verified);
      if (verified) {
        await cred.user.getIdToken(true);
        await ensureUserProfileDocs(cred.user);
      }
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/too-many-requests') {
        throw new Error('Too many sign-in attempts. Wait a minute and try again.');
      }
      if (code === 'auth/operation-not-allowed') {
        throw new Error(
          'Email/Password sign-in is disabled in Firebase Console. Enable it under Authentication -> Sign-in method, or use Google Sign-In below.'
        );
      }
      // Generic message: never reveal whether the email exists
      throw new Error('Invalid email or password.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const cred = await signInWithPopup(auth, provider);
      setUser(cred.user);
      const verified = Boolean(cred.user.emailVerified);
      setIsVerified(verified);
      if (verified) {
        await cred.user.getIdToken(true);
        await ensureUserProfileDocs(cred.user);
      }
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        throw new Error('Google sign-in popup was closed before completing.');
      }
      if (code === 'auth/popup-blocked') {
        throw new Error('Sign-in popup was blocked by your browser. Allow popups and try again.');
      }
      if (code === 'auth/unauthorized-domain') {
        throw new Error(
          'This domain is not authorized for Google sign-in yet in Firebase Authentication.'
        );
      }
      if (error instanceof Error && !code) {
        throw error;
      }
      throw new Error('Unable to sign in with Google right now. Please try again.');
    }
  };

  const signUp = async ({
    displayName,
    campus,
    email,
    password,
  }: {
    displayName: string;
    campus: string;
    email: string;
    password: string;
  }) => {
    const cleanName = stripHtmlTags(displayName);
    const cleanCampus = stripHtmlTags(campus);
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 60) {
      throw new Error('Full name must be between 2 and 60 characters.');
    }

    if (!isValidEmailAddress(cleanEmail)) {
      throw new Error('Enter a valid email address.');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, {
        displayName: cleanCampus ? `${cleanName} (${cleanCampus})`.slice(0, 60) : cleanName,
      });
      await sendEmailVerification(cred.user);
      setUser(cred.user);
      setIsVerified(Boolean(cred.user.emailVerified));
      setLastResendAt(Date.now());
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/too-many-requests') {
        throw new Error('Too many attempts. Please wait a minute and try again.');
      }
      if (code === 'auth/operation-not-allowed') {
        throw new Error(
          'Email/Password sign-in is disabled in Firebase Console. Enable it under Authentication -> Sign-in method, or use Google Sign-In below.'
        );
      }
      if (code === 'auth/weak-password') {
        throw new Error('Choose a stronger password (at least 8 characters).');
      }
      // Generic message to prevent account enumeration
      throw new Error('Unable to complete sign-up with those details. Check your email or try signing in.');
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setIsVerified(false);
    setProfile(null);
  };

  const resendVerification = async () => {
    if (!auth.currentUser) {
      throw new Error('Sign in first to resend a verification email.');
    }
    const now = Date.now();
    if (now - lastResendAt < 60_000) {
      const waitSeconds = Math.ceil((60_000 - (now - lastResendAt)) / 1000);
      throw new Error(`Please wait ${waitSeconds}s before requesting another email.`);
    }
    await sendEmailVerification(auth.currentUser);
    setLastResendAt(now);
  };

  const refreshUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const refreshed = auth.currentUser;
    const verified = Boolean(refreshed.emailVerified);
    setUser(refreshed);
    setIsVerified(verified);
    if (verified) {
      // Force-refresh the ID token so Firestore rules see email_verified == true immediately
      await refreshed.getIdToken(true);
      await ensureUserProfileDocs(refreshed);
      return true;
    }
    return false;
  };

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser || !auth.currentUser.emailVerified) return;
    await ensureUserProfileDocs(auth.currentUser);
  }, [ensureUserProfileDocs]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isVerified,
        signIn,
        signInWithGoogle,
        signUp,
        signOut,
        resendVerification,
        refreshUser,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
