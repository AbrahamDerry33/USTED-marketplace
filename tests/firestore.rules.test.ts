import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const describeWithEmulator = EMULATOR_HOST ? describe : describe.skip;

describeWithEmulator('Campus Market Firestore Security Rules (Step 3: Listings & Users)', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const [host, portStr] = EMULATOR_HOST!.split(':');
    testEnv = await initializeTestEnvironment({
      projectId: 'campus-market-rules-test',
      firestore: {
        rules,
        host,
        port: Number(portStr),
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  const validListingPayload = (id: string, sellerId: string) => ({
    id,
    sellerId,
    sellerName: 'Kwame Mensah',
    title: 'Engineering Mathematics Textbook',
    description: 'Clean 7th edition textbook with no torn pages.',
    pricePesewas: 12000,
    category: 'textbooks',
    condition: 'like_new',
    images: ['https://firebasestorage.googleapis.com/v0/b/demo/o/book.jpg'],
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  it('Dirty Dozen #1: rejects unauthenticated listing reads', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'listings', 'lst-1'), {
        ...validListingPayload('lst-1', 'user-a'),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'listings', 'lst-1')));
    await assertFails(getDocs(query(collection(anonDb, 'listings'), where('status', '==', 'active'))));
  });

  it('Dirty Dozen #2: rejects listing creation when email_verified is false', async () => {
    const unverifiedDb = testEnv.authenticatedContext('user-a', {
      email: 'kwame@st.ug.edu.gh',
      email_verified: false,
    }).firestore();
    await assertFails(setDoc(doc(unverifiedDb, 'listings', 'lst-1'), validListingPayload('lst-1', 'user-a')));
  });

  it('Dirty Dozen #3: isolates PII private subcollection from other verified users', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'user-b', 'private', 'info'), {
        uid: 'user-b',
        email: 'ama@st.ug.edu.gh',
        createdAt: Timestamp.now(),
      });
    });
    const userADb = testEnv.authenticatedContext('user-a', {
      email: 'kwame@st.ug.edu.gh',
      email_verified: true,
    }).firestore();
    await assertFails(getDoc(doc(userADb, 'users', 'user-b', 'private', 'info')));
  });

  it('Dirty Dozen #4 & #5: blocks privilege escalation on user create and role/banned update', async () => {
    const userADb = testEnv.authenticatedContext('user-a', {
      email: 'kwame@st.ug.edu.gh',
      email_verified: true,
    }).firestore();

    await assertFails(setDoc(doc(userADb, 'users', 'user-a'), {
      uid: 'user-a',
      displayName: 'Kwame',
      role: 'admin',
      banned: false,
      createdAt: serverTimestamp(),
    }));

    await assertSucceeds(setDoc(doc(userADb, 'users', 'user-a'), {
      uid: 'user-a',
      displayName: 'Kwame',
      role: 'student',
      banned: false,
      createdAt: serverTimestamp(),
    }));

    await assertFails(updateDoc(doc(userADb, 'users', 'user-a'), {
      role: 'admin',
    }));
    await assertFails(updateDoc(doc(userADb, 'users', 'user-a'), {
      banned: true,
    }));
  });

  it('Dirty Dozen #6, #7, #8, #9: blocks seller spoofing, shadow fields, float/negative price, and bad image counts', async () => {
    const userADb = testEnv.authenticatedContext('user-a', {
      email: 'kwame@st.ug.edu.gh',
      email_verified: true,
    }).firestore();

    // #6 Seller spoofing
    await assertFails(setDoc(doc(userADb, 'listings', 'lst-spoof'), validListingPayload('lst-spoof', 'user-b')));

    // #7 Shadow field
    await assertFails(setDoc(doc(userADb, 'listings', 'lst-shadow'), {
      ...validListingPayload('lst-shadow', 'user-a'),
      isFeatured: true,
    }));

    // #8 Negative & float price
    await assertFails(setDoc(doc(userADb, 'listings', 'lst-neg'), {
      ...validListingPayload('lst-neg', 'user-a'),
      pricePesewas: -100,
    }));
    await assertFails(setDoc(doc(userADb, 'listings', 'lst-float'), {
      ...validListingPayload('lst-float', 'user-a'),
      pricePesewas: 120.5,
    }));

    // #9 Empty and >5 images
    await assertFails(setDoc(doc(userADb, 'listings', 'lst-noimg'), {
      ...validListingPayload('lst-noimg', 'user-a'),
      images: [],
    }));
    await assertFails(setDoc(doc(userADb, 'listings', 'lst-6img'), {
      ...validListingPayload('lst-6img', 'user-a'),
      images: Array(6).fill('https://firebasestorage.googleapis.com/v0/b/demo/o/book.jpg'),
    }));
  });

  it('Dirty Dozen #10, #11, #12: blocks non-owner update, terminal removed state edit, backdated timestamp, and hard delete', async () => {
    const userADb = testEnv.authenticatedContext('user-a', {
      email: 'kwame@st.ug.edu.gh',
      email_verified: true,
    }).firestore();
    const userBDb = testEnv.authenticatedContext('user-b', {
      email: 'ama@st.ug.edu.gh',
      email_verified: true,
    }).firestore();

    await assertSucceeds(setDoc(doc(userADb, 'listings', 'lst-ok'), validListingPayload('lst-ok', 'user-a')));

    // #10 Non-owner update
    await assertFails(updateDoc(doc(userBDb, 'listings', 'lst-ok'), {
      title: 'Hacked Title',
      updatedAt: serverTimestamp(),
    }));

    // Hard delete blocked
    await assertFails(deleteDoc(doc(userADb, 'listings', 'lst-ok')));

    // Owner can soft-delete to removed
    await assertSucceeds(updateDoc(doc(userADb, 'listings', 'lst-ok'), {
      status: 'removed',
      updatedAt: serverTimestamp(),
    }));

    // #11 Terminal state locked
    await assertFails(updateDoc(doc(userADb, 'listings', 'lst-ok'), {
      status: 'active',
      updatedAt: serverTimestamp(),
    }));

    // #12 Backdated timestamp
    await assertFails(setDoc(doc(userADb, 'listings', 'lst-backdate'), {
      ...validListingPayload('lst-backdate', 'user-a'),
      createdAt: Timestamp.fromMillis(1000),
    }));
  });
});
