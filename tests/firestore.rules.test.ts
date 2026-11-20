import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
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

  it('Orders & Notifications: blocks client order writes and notification creation, allows recipient mark-as-read only', async () => {
    const userADb = testEnv.authenticatedContext('user-a', {
      email: 'kwame@st.ug.edu.gh',
      email_verified: true,
    }).firestore();
    const userBDb = testEnv.authenticatedContext('user-b', {
      email: 'ama@st.ug.edu.gh',
      email_verified: true,
    }).firestore();

    // Client cannot write orders or create notifications directly
    await assertFails(setDoc(doc(userADb, 'orders', 'ord-1'), {
      id: 'ord-1',
      listingId: 'lst-1',
      listingTitle: 'Calculator',
      buyerId: 'user-a',
      sellerId: 'user-b',
      amountPesewas: 5000,
      status: 'paid',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));

    await assertFails(setDoc(doc(userADb, 'notifications', 'notif-fake'), {
      id: 'notif-fake',
      userId: 'user-a',
      orderId: 'ord-1',
      listingId: 'lst-1',
      eventType: 'paid',
      recipientRole: 'buyer',
      title: 'Fake alert',
      body: 'Should fail',
      read: false,
      createdAt: serverTimestamp(),
    }));

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'notifications', 'notif-1'), {
        id: 'notif-1',
        userId: 'user-a',
        orderId: 'ord-1',
        listingId: 'lst-1',
        eventType: 'paid',
        recipientRole: 'buyer',
        title: 'Payment confirmed',
        body: 'Paid GHS 50.00',
        read: false,
        createdAt: Timestamp.now(),
      });
    });

    // User B cannot read or modify User A's notification
    await assertFails(getDoc(doc(userBDb, 'notifications', 'notif-1')));
    await assertFails(updateDoc(doc(userBDb, 'notifications', 'notif-1'), {
      read: true,
      readAt: serverTimestamp(),
    }));

    // User A cannot tamper with title/body or delete notification
    await assertFails(updateDoc(doc(userADb, 'notifications', 'notif-1'), {
      title: 'Edited',
      read: true,
      readAt: serverTimestamp(),
    }));
    await assertFails(deleteDoc(doc(userADb, 'notifications', 'notif-1')));

    // User A can mark own unread notification as read once
    await assertSucceeds(updateDoc(doc(userADb, 'notifications', 'notif-1'), {
      read: true,
      readAt: serverTimestamp(),
    }));
  });

  it('Favorites / Saved Items: enforces owner-only access, listing existence, strict keys, snapshot bounds, and immutable records', async () => {
    const userADb = testEnv.authenticatedContext('user-a', {
      email: 'kwame@st.ug.edu.gh',
      email_verified: true,
    }).firestore();
    const userBDb = testEnv.authenticatedContext('user-b', {
      email: 'ama@st.ug.edu.gh',
      email_verified: true,
    }).firestore();

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'listings', 'lst-fav'), {
        ...validListingPayload('lst-fav', 'user-b'),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await setDoc(doc(ctx.firestore(), 'listings', 'lst-removed'), {
        ...validListingPayload('lst-removed', 'user-b'),
        status: 'removed',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    // Cannot save missing or removed listing
    await assertFails(setDoc(doc(userADb, 'users', 'user-a', 'favorites', 'lst-missing'), {
      userId: 'user-a',
      listingId: 'lst-missing',
      createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(userADb, 'users', 'user-a', 'favorites', 'lst-removed'), {
      userId: 'user-a',
      listingId: 'lst-removed',
      createdAt: serverTimestamp(),
    }));

    // Shadow field, backdated timestamp, oversized title, invalid price, and invalid category rejected
    await assertFails(setDoc(doc(userADb, 'users', 'user-a', 'favorites', 'lst-fav'), {
      userId: 'user-a',
      listingId: 'lst-fav',
      createdAt: serverTimestamp(),
      note: 'shadow',
    }));
    await assertFails(setDoc(doc(userADb, 'users', 'user-a', 'favorites', 'lst-fav'), {
      userId: 'user-a',
      listingId: 'lst-fav',
      createdAt: Timestamp.fromMillis(1000),
    }));
    await assertFails(setDoc(doc(userADb, 'users', 'user-a', 'favorites', 'lst-fav'), {
      userId: 'user-a',
      listingId: 'lst-fav',
      savedTitle: 'x'.repeat(101),
      createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(userADb, 'users', 'user-a', 'favorites', 'lst-fav'), {
      userId: 'user-a',
      listingId: 'lst-fav',
      savedPricePesewas: -500,
      createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(userADb, 'users', 'user-a', 'favorites', 'lst-fav'), {
      userId: 'user-a',
      listingId: 'lst-fav',
      savedCategory: 'not_a_category',
      createdAt: serverTimestamp(),
    }));

    // Owner can save an active listing with optional snapshot metadata
    await assertSucceeds(setDoc(doc(userADb, 'users', 'user-a', 'favorites', 'lst-fav'), {
      userId: 'user-a',
      listingId: 'lst-fav',
      savedTitle: 'Engineering Mathematics Textbook',
      savedPricePesewas: 12000,
      savedCategory: 'textbooks',
      createdAt: serverTimestamp(),
    }));

    // Owner can list own saved items with userId filter
    await assertSucceeds(
      getDocs(query(collection(userADb, 'users', 'user-a', 'favorites'), where('userId', '==', 'user-a')))
    );

    // Other user cannot read, list, create, or delete User A's saved items
    await assertFails(getDoc(doc(userBDb, 'users', 'user-a', 'favorites', 'lst-fav')));
    await assertFails(
      getDocs(query(collection(userBDb, 'users', 'user-a', 'favorites'), where('userId', '==', 'user-a')))
    );
    await assertFails(deleteDoc(doc(userBDb, 'users', 'user-a', 'favorites', 'lst-fav')));

    // Updates are blocked (immutable create/delete)
    await assertFails(updateDoc(doc(userADb, 'users', 'user-a', 'favorites', 'lst-fav'), {
      createdAt: serverTimestamp(),
    }));

    // Owner can remove from saved items
    await assertSucceeds(deleteDoc(doc(userADb, 'users', 'user-a', 'favorites', 'lst-fav')));
  });

  it('Seller Reviews: requires at least one completed order with the seller and blocks spoofing, invalid ratings, shadow fields, and cross-user edits', async () => {
    const userADb = testEnv.authenticatedContext('user-a', {
      email: 'kwame@st.ug.edu.gh',
      email_verified: true,
    }).firestore();
    const userBDb = testEnv.authenticatedContext('user-b', {
      email: 'ama@st.ug.edu.gh',
      email_verified: true,
    }).firestore();
    const userCDb = testEnv.authenticatedContext('user-c', {
      email: 'kofi@st.ug.edu.gh',
      email_verified: true,
    }).firestore();

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'user-b'), {
        uid: 'user-b',
        displayName: 'Ama Owusu',
        role: 'student',
        banned: false,
        createdAt: Timestamp.now(),
      });
      await setDoc(doc(ctx.firestore(), 'users', 'user-d'), {
        uid: 'user-d',
        displayName: 'Yaw Boateng',
        role: 'student',
        banned: false,
        createdAt: Timestamp.now(),
      });
      // Non-completed order between user-a and user-b
      await setDoc(doc(ctx.firestore(), 'orders', 'ord-shipped'), {
        id: 'ord-shipped',
        listingId: 'lst-1',
        listingTitle: 'Textbook',
        buyerId: 'user-a',
        sellerId: 'user-b',
        amountPesewas: 8000,
        status: 'shipped',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      // Completed order between user-c (different buyer) and user-b
      await setDoc(doc(ctx.firestore(), 'orders', 'ord-other-buyer'), {
        id: 'ord-other-buyer',
        listingId: 'lst-1',
        listingTitle: 'Textbook',
        buyerId: 'user-c',
        sellerId: 'user-b',
        amountPesewas: 8000,
        status: 'completed',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      // Completed order between user-a and user-d (different seller)
      await setDoc(doc(ctx.firestore(), 'orders', 'ord-other-seller'), {
        id: 'ord-other-seller',
        listingId: 'lst-2',
        listingTitle: 'Desk Lamp',
        buyerId: 'user-a',
        sellerId: 'user-d',
        amountPesewas: 6000,
        status: 'completed',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const baseReview = {
      sellerId: 'user-b',
      reviewerId: 'user-a',
      orderId: 'ord-completed',
      reviewerName: 'Kwame Mensah',
      rating: 5,
      comment: 'Fast response and met right on time at Balme Library.',
      listingId: 'lst-1',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Missing orderId or nonexistent order blocked
    await assertFails(
      setDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
        sellerId: 'user-b',
        reviewerId: 'user-a',
        reviewerName: 'Kwame Mensah',
        rating: 5,
        comment: 'No order reference provided.',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(setDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), baseReview));

    // Non-completed order (shipped), another buyer's completed order, and another seller's completed order all blocked
    await assertFails(
      setDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
        ...baseReview,
        orderId: 'ord-shipped',
      })
    );
    await assertFails(
      setDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
        ...baseReview,
        orderId: 'ord-other-buyer',
      })
    );
    await assertFails(
      setDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
        ...baseReview,
        orderId: 'ord-other-seller',
      })
    );

    // Seed a valid completed order between user-a (buyer) and user-b (seller)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'ord-completed'), {
        id: 'ord-completed',
        listingId: 'lst-1',
        listingTitle: 'Textbook',
        buyerId: 'user-a',
        sellerId: 'user-b',
        amountPesewas: 8000,
        status: 'completed',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    // Self-review blocked
    await assertFails(setDoc(doc(userBDb, 'users', 'user-b', 'reviews', 'user-b'), {
      ...baseReview,
      reviewerId: 'user-b',
      reviewerName: 'Ama Owusu',
    }));

    // Out-of-range rating, float rating, short comment, and shadow field blocked
    await assertFails(setDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
      ...baseReview,
      rating: 6,
    }));
    await assertFails(setDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
      ...baseReview,
      rating: 4.5,
    }));
    await assertFails(setDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
      ...baseReview,
      comment: 'ok',
    }));
    await assertFails(setDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
      ...baseReview,
      verifiedPurchase: true,
    }));

    // Verified buyer with completed order can create review for that seller
    await assertSucceeds(setDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), baseReview));

    // Verified users can list seller reviews using sellerId filter
    await assertSucceeds(
      getDocs(query(collection(userCDb, 'users', 'user-b', 'reviews'), where('sellerId', '==', 'user-b')))
    );

    // Other users cannot edit or delete User A's review
    await assertFails(updateDoc(doc(userCDb, 'users', 'user-b', 'reviews', 'user-a'), {
      rating: 1,
      comment: 'Tampered review text',
      updatedAt: serverTimestamp(),
    }));
    await assertFails(deleteDoc(doc(userCDb, 'users', 'user-b', 'reviews', 'user-a')));

    // Author cannot mutate createdAt or orderId, but can update rating & comment
    await assertFails(updateDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
      rating: 4,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
      orderId: 'ord-other-seller',
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
      rating: 4,
      comment: 'Good item condition, met at Night Market.',
      updatedAt: serverTimestamp(),
    }));

    // If order is later refunded, review updates are rejected while author can still delete
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'orders', 'ord-completed'), {
        status: 'refunded',
      });
    });
    await assertFails(updateDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a'), {
      rating: 2,
      comment: 'Attempt edit after refund.',
      updatedAt: serverTimestamp(),
    }));

    // Author can delete own review
    await assertSucceeds(deleteDoc(doc(userADb, 'users', 'user-b', 'reviews', 'user-a')));
  });

  it('Listing Chat: enforces 1-on-1 participant privacy, anti-self-chat, atomic batch sync, and immutable messages', async () => {
    const buyerDb = testEnv.authenticatedContext('buyer-1', {
      email: 'kwame@st.ug.edu.gh',
      email_verified: true,
    }).firestore();
    const sellerDb = testEnv.authenticatedContext('seller-1', {
      email: 'ama@st.ug.edu.gh',
      email_verified: true,
    }).firestore();
    const outsiderDb = testEnv.authenticatedContext('buyer-2', {
      email: 'kofi@st.ug.edu.gh',
      email_verified: true,
    }).firestore();

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'listings', 'lst-chat'), {
        ...validListingPayload('lst-chat', 'seller-1'),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    // Seller cannot initiate a self-chat thread
    await assertFails(
      setDoc(doc(sellerDb, 'listings', 'lst-chat', 'threads', 'seller-1'), {
        listingId: 'lst-chat',
        buyerId: 'seller-1',
        sellerId: 'seller-1',
        buyerName: 'Ama Owusu',
        sellerName: 'Ama Owusu',
        lastMessageText: 'Self chat',
        lastMessageSenderId: 'seller-1',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Orphaned message without atomic parent thread write fails
    await assertFails(
      setDoc(doc(buyerDb, 'listings', 'lst-chat', 'threads', 'buyer-1', 'messages', 'msg-orphan'), {
        id: 'msg-orphan',
        listingId: 'lst-chat',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        senderId: 'buyer-1',
        senderName: 'Kwame Mensah',
        senderRole: 'buyer',
        type: 'text',
        body: 'Is this still available?',
        createdAt: serverTimestamp(),
      })
    );

    // Buyer creates thread + first offer message atomically
    const firstBatch = writeBatch(buyerDb);
    firstBatch.set(doc(buyerDb, 'listings', 'lst-chat', 'threads', 'buyer-1'), {
      listingId: 'lst-chat',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      buyerName: 'Kwame Mensah',
      sellerName: 'Ama Owusu',
      lastMessageText: 'Would you take GHS 120.00?',
      lastMessageSenderId: 'buyer-1',
      lastOfferPesewas: 12000,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    firstBatch.set(doc(buyerDb, 'listings', 'lst-chat', 'threads', 'buyer-1', 'messages', 'msg-1'), {
      id: 'msg-1',
      listingId: 'lst-chat',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      senderId: 'buyer-1',
      senderName: 'Kwame Mensah',
      senderRole: 'buyer',
      type: 'offer',
      body: 'Would you take GHS 120.00?',
      offerPesewas: 12000,
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(firstBatch.commit());

    // Outsider cannot read thread or list messages
    await assertFails(getDoc(doc(outsiderDb, 'listings', 'lst-chat', 'threads', 'buyer-1')));
    await assertFails(
      getDocs(
        query(
          collection(outsiderDb, 'listings', 'lst-chat', 'threads', 'buyer-1', 'messages'),
          where('buyerId', '==', 'buyer-1')
        )
      )
    );

    // Seller can list threads for their listing and reply atomically
    await assertSucceeds(
      getDocs(
        query(collection(sellerDb, 'listings', 'lst-chat', 'threads'), where('sellerId', '==', 'seller-1'))
      )
    );
    const replyBatch = writeBatch(sellerDb);
    replyBatch.update(doc(sellerDb, 'listings', 'lst-chat', 'threads', 'buyer-1'), {
      lastMessageText: 'I can do GHS 135.00 at Balme Library.',
      lastMessageSenderId: 'seller-1',
      lastOfferPesewas: 13500,
      updatedAt: serverTimestamp(),
    });
    replyBatch.set(doc(sellerDb, 'listings', 'lst-chat', 'threads', 'buyer-1', 'messages', 'msg-2'), {
      id: 'msg-2',
      listingId: 'lst-chat',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      senderId: 'seller-1',
      senderName: 'Ama Owusu',
      senderRole: 'seller',
      type: 'offer',
      body: 'I can do GHS 135.00 at Balme Library.',
      offerPesewas: 13500,
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(replyBatch.commit());

    // Messages are immutable — neither buyer nor seller can tamper with past messages
    await assertFails(
      updateDoc(doc(buyerDb, 'listings', 'lst-chat', 'threads', 'buyer-1', 'messages', 'msg-1'), {
        body: 'Edited offer',
      })
    );
  });

  it('Local Payments & Campus Handover PIN: isolates handoverPin to buyer before completion, gates MoMo proof by role, and enforces matching PIN on atomic completion', async () => {
    const buyerDb = testEnv.authenticatedContext('buyer-gh', {
      email: 'kwame@st.ug.edu.gh',
      email_verified: true,
    }).firestore();
    const sellerDb = testEnv.authenticatedContext('seller-gh', {
      email: 'ama@st.ug.edu.gh',
      email_verified: true,
    }).firestore();
    const outsiderDb = testEnv.authenticatedContext('outsider-gh', {
      email: 'kofi@st.ug.edu.gh',
      email_verified: true,
    }).firestore();

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'seller-gh'), {
        uid: 'seller-gh',
        displayName: 'Ama Owusu',
        role: 'student',
        banned: false,
        createdAt: Timestamp.now(),
      });
      await setDoc(doc(ctx.firestore(), 'listings', 'lst-momo'), {
        ...validListingPayload('lst-momo', 'seller-gh'),
        pricePesewas: 20000,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await setDoc(doc(ctx.firestore(), 'listings', 'lst-meetup'), {
        ...validListingPayload('lst-meetup', 'seller-gh'),
        pricePesewas: 15000,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    // Seller can save valid Ghana MoMo payout preferences on own profile
    await assertSucceeds(
      updateDoc(doc(sellerDb, 'users', 'seller-gh'), {
        momoNetwork: 'mtn',
        momoNumber: '0241234567',
        momoAccountName: 'Ama Owusu',
      })
    );

    // Invalid phone number rejected
    await assertFails(
      updateDoc(doc(sellerDb, 'users', 'seller-gh'), {
        momoNumber: '12345',
      })
    );

    // Tampered order price rejected
    const badPriceBatch = writeBatch(buyerDb);
    badPriceBatch.set(doc(buyerDb, 'orders', 'ord-bad-price'), {
      id: 'ord-bad-price',
      listingId: 'lst-momo',
      listingTitle: 'Engineering Mathematics Textbook',
      buyerId: 'buyer-gh',
      sellerId: 'seller-gh',
      currency: 'GHS',
      amountPesewas: 100, // tampered!
      commissionBps: 500,
      commissionPesewas: 5,
      sellerAmountPesewas: 95,
      paystackReference: 'CM-LOC-BAD',
      paymentMethod: 'momo_prepayment',
      paymentStatus: 'unpaid',
      receiptStatus: 'none',
      handoverPinSet: true,
      status: 'pending_payment',
      released: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    badPriceBatch.set(doc(buyerDb, 'orders', 'ord-bad-price', 'secrets', 'handover'), {
      orderId: 'ord-bad-price',
      buyerId: 'buyer-gh',
      sellerId: 'seller-gh',
      handoverPin: '4829',
      createdAt: serverTimestamp(),
    });
    await assertFails(badPriceBatch.commit());

    // Valid atomic MoMo Pre-Payment order creation + buyer-only PIN secret
    const momoBatch = writeBatch(buyerDb);
    momoBatch.set(doc(buyerDb, 'orders', 'ord-momo-1'), {
      id: 'ord-momo-1',
      listingId: 'lst-momo',
      listingTitle: 'Engineering Mathematics Textbook',
      buyerId: 'buyer-gh',
      sellerId: 'seller-gh',
      currency: 'GHS',
      amountPesewas: 20000,
      commissionBps: 500,
      commissionPesewas: 1000,
      sellerAmountPesewas: 19000,
      paystackReference: 'CM-LOC-MOMO1',
      paymentMethod: 'momo_prepayment',
      paymentStatus: 'unpaid',
      receiptStatus: 'none',
      sellerMoMoNetwork: 'mtn',
      sellerMoMoNumber: '0241234567',
      sellerMoMoAccountName: 'Ama Owusu',
      handoverPinSet: true,
      status: 'pending_payment',
      released: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    momoBatch.set(doc(buyerDb, 'orders', 'ord-momo-1', 'secrets', 'handover'), {
      orderId: 'ord-momo-1',
      buyerId: 'buyer-gh',
      sellerId: 'seller-gh',
      handoverPin: '4829',
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(momoBatch.commit());

    // Only buyer can read handoverPin before completion; seller and outsider are denied
    await assertSucceeds(getDoc(doc(buyerDb, 'orders', 'ord-momo-1', 'secrets', 'handover')));
    await assertFails(getDoc(doc(sellerDb, 'orders', 'ord-momo-1', 'secrets', 'handover')));
    await assertFails(getDoc(doc(outsiderDb, 'orders', 'ord-momo-1', 'secrets', 'handover')));

    // Seller cannot submit MoMo proof fields as buyer
    await assertFails(
      updateDoc(doc(sellerDb, 'orders', 'ord-momo-1'), {
        transactionId: 'MOMO-FAKE-123',
        manualReference: 'MOMO-FAKE-123',
        paymentStatus: 'proof_submitted',
        receiptStatus: 'submitted',
        status: 'payment_submitted',
        receiptSubmittedAt: serverTimestamp(),
        buyerFlaggedPaidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Buyer submits MoMo proof
    await assertSucceeds(
      updateDoc(doc(buyerDb, 'orders', 'ord-momo-1'), {
        transactionId: 'MTN-240911-8841',
        manualReference: 'MTN-240911-8841',
        paymentStatus: 'proof_submitted',
        receiptStatus: 'submitted',
        status: 'payment_submitted',
        receiptSubmittedAt: serverTimestamp(),
        buyerFlaggedPaidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Buyer cannot self-verify or complete own order
    await assertFails(
      updateDoc(doc(buyerDb, 'orders', 'ord-momo-1'), {
        paymentStatus: 'verified',
        receiptStatus: 'verified',
        status: 'paid',
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Seller confirms MoMo payment receipt and reserves listing atomically
    const verifyBatch = writeBatch(sellerDb);
    verifyBatch.update(doc(sellerDb, 'orders', 'ord-momo-1'), {
      paymentStatus: 'verified',
      receiptStatus: 'verified',
      status: 'paid',
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    verifyBatch.update(doc(sellerDb, 'listings', 'lst-momo'), {
      status: 'reserved',
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(verifyBatch.commit());

    // Wrong 4-digit PIN fails completion
    const wrongPinBatch = writeBatch(sellerDb);
    wrongPinBatch.update(doc(sellerDb, 'orders', 'ord-momo-1'), {
      status: 'completed',
      paymentStatus: 'verified',
      handoverPin: '0000',
      released: true,
      completedAt: serverTimestamp(),
      releasedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    wrongPinBatch.update(doc(sellerDb, 'listings', 'lst-momo'), {
      status: 'sold',
      updatedAt: serverTimestamp(),
    });
    await assertFails(wrongPinBatch.commit());

    // Matching 4-digit PIN completes order and marks listing sold atomically
    const goodPinBatch = writeBatch(sellerDb);
    goodPinBatch.update(doc(sellerDb, 'orders', 'ord-momo-1'), {
      status: 'completed',
      paymentStatus: 'verified',
      handoverPin: '4829',
      released: true,
      completedAt: serverTimestamp(),
      releasedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    goodPinBatch.update(doc(sellerDb, 'listings', 'lst-momo'), {
      status: 'sold',
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(goodPinBatch.commit());

    // Completing unlocks seller review creation for buyer-gh
    await assertSucceeds(
      setDoc(doc(buyerDb, 'users', 'seller-gh', 'reviews', 'buyer-gh'), {
        sellerId: 'seller-gh',
        reviewerId: 'buyer-gh',
        orderId: 'ord-momo-1',
        reviewerName: 'Kwame Mensah',
        rating: 5,
        comment: 'Smooth MoMo payment and instant PIN handover at Balme Library.',
        listingId: 'lst-momo',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Open Email Registration & Verified Student Badge: permits verified non-school emails across marketplace operations and blocks badge spoofing', async () => {
    const gmailUserDb = testEnv.authenticatedContext('gmail-user', {
      email: 'kwame.trader@gmail.com',
      email_verified: true,
    }).firestore();
    const yahooBuyerDb = testEnv.authenticatedContext('yahoo-buyer', {
      email: 'ama.buyer@yahoo.com',
      email_verified: true,
    }).firestore();
    const eduSellerDb = testEnv.authenticatedContext('edu-seller', {
      email: 'kofi@st.ug.edu.gh',
      email_verified: true,
    }).firestore();

    // Gmail user CANNOT spoof verifiedStudent: true
    await assertFails(
      setDoc(doc(gmailUserDb, 'users', 'gmail-user'), {
        uid: 'gmail-user',
        displayName: 'Kwame Trader',
        verifiedStudent: true,
        role: 'student',
        banned: false,
        createdAt: serverTimestamp(),
      })
    );

    // Gmail user CAN create profile with verifiedStudent: false, create listings, and read catalog
    await assertSucceeds(
      setDoc(doc(gmailUserDb, 'users', 'gmail-user'), {
        uid: 'gmail-user',
        displayName: 'Kwame Trader',
        verifiedStudent: false,
        role: 'student',
        banned: false,
        createdAt: serverTimestamp(),
      })
    );

    // Gmail seller CANNOT spoof sellerVerifiedStudent: true on a listing
    await assertFails(
      setDoc(doc(gmailUserDb, 'listings', 'lst-gmail-spoof'), {
        ...validListingPayload('lst-gmail-spoof', 'gmail-user'),
        sellerVerifiedStudent: true,
      })
    );

    // Gmail seller CAN publish listing with sellerVerifiedStudent: false (or omitted)
    await assertSucceeds(
      setDoc(doc(gmailUserDb, 'listings', 'lst-gmail-ok'), {
        ...validListingPayload('lst-gmail-ok', 'gmail-user'),
        sellerVerifiedStudent: false,
      })
    );

    // Yahoo buyer can read listings and save to favorites
    await assertSucceeds(getDoc(doc(yahooBuyerDb, 'listings', 'lst-gmail-ok')));
    await assertSucceeds(
      setDoc(doc(yahooBuyerDb, 'users', 'yahoo-buyer', 'favorites', 'lst-gmail-ok'), {
        userId: 'yahoo-buyer',
        listingId: 'lst-gmail-ok',
        createdAt: serverTimestamp(),
      })
    );

    // Academic (.edu.gh) user CAN set verifiedStudent: true and sellerVerifiedStudent: true
    await assertSucceeds(
      setDoc(doc(eduSellerDb, 'users', 'edu-seller'), {
        uid: 'edu-seller',
        displayName: 'Kofi Student',
        verifiedStudent: true,
        role: 'student',
        banned: false,
        createdAt: serverTimestamp(),
      })
    );
    await assertSucceeds(
      setDoc(doc(eduSellerDb, 'listings', 'lst-edu-ok'), {
        ...validListingPayload('lst-edu-ok', 'edu-seller'),
        sellerVerifiedStudent: true,
      })
    );
  });
});

