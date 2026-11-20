import { getApp, getApps, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// CRITICAL: Pass firestoreDatabaseId explicitly for AI Studio Enterprise Firestore.
// Force long-polling in browser runtimes so buffering proxies, campus firewalls,
// antivirus SSL inspection, or iframe middleboxes do not stall WebChannel streams
// into a 10-second offline timeout.
function createFirestoreInstance(): Firestore {
  if (typeof window === 'undefined') {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }

  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        experimentalLongPollingOptions: { timeoutSeconds: 20 },
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Initialize App Check when a reCAPTCHA site key is configured
const recaptchaKey =
  (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) ||
  firebaseConfig.recaptchaSiteKey;

if (typeof window !== 'undefined' && recaptchaKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaKey),
    isTokenAutoRefreshEnabled: true,
  });
}

// Optional local Firebase Emulators wiring
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function isOfflineError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('the client is offline');
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (!isOfflineError(error)) {
      return;
    }

    // Retry once after explicitly re-enabling network in case the initial handshake blipped
    try {
      await enableNetwork(db);
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (retryError) {
      if (isOfflineError(retryError)) {
        console.error('Please check your Firebase configuration.');
      }
    }
  }
}

if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false) {
  window.addEventListener(
    'online',
    () => {
      void testConnection();
    },
    { once: true }
  );
} else {
  void testConnection();
}
