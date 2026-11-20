# Campus Market — Security Specification (Phase 0 TDD)

## 1. Data Invariants (Step 3: Users & Listings)
1. **Deny by Default**: Any path not explicitly matched under `/databases/{database}/documents` is rejected.
2. **Verified Email Gate (Open Email Registration)**: No user may read or write marketplace data (`users`, `listings`, Storage images) unless `request.auth != null`, `request.auth.token.email_verified == true`, and a valid email claim is present (`isVerifiedUser()`). Any standard valid email domain (`@gmail.com`, `@yahoo.com`, `@outlook.com`, `.edu.gh`, `.edu`, etc.) is accepted.
3. **Non-Forgeable Optional Verified Student Badge**: Users with verified academic emails matching `^[^@\\s]+@([a-z0-9-]+\\.)+(edu|edu\\.gh)$` may set `verifiedStudent: true` on `/users/{userId}` and `sellerVerifiedStudent: true` on `/listings/{listingId}`. Standard verified email users attempting to write `verifiedStudent: true` or `sellerVerifiedStudent: true` are rejected with `PERMISSION_DENIED`.
4. **PII Isolation**: User email addresses reside exclusively in `/users/{userId}/private/info`, readable only by the owner (`request.auth.uid == userId`) or an admin. Public `/users/{userId}` documents contain no email or private PII.
4. **Role & Ban Integrity**: Users creating `/users/{userId}` must set `role == 'student'` and `banned == false`. Users cannot modify `uid`, `role`, `banned`, or `createdAt` on update.
5. **Listing Ownership & Immutability**: A listing's `id`, `sellerId`, and `createdAt` are immutable after creation. Only the listing owner (when not banned) or an admin may update a listing. Hard deletes (`allow delete`) are blocked; listings transition to `status: 'removed'`.
6. **Whole-Pesewa Price Integrity**: `pricePesewas` must be an integer between `100` (GHS 1.00) and `100000000` (GHS 1,000,000.00).
7. **Media Bounds**: `images` must contain 1 to 5 non-empty URL strings; Storage accepts only JPEG, PNG, or WebP up to 5 MB under the uploader's own `uid`.
8. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Listing Read**: An unauthenticated client attempts `get` or `list` on `/listings`.
2. **Unverified Email Create**: A signed-in user with `email_verified: false` attempts to create a listing in `/listings/{id}`.
3. **PII Cross-User Read**: Verified user A attempts `get` on `/users/{userB}/private/info`.
4. **Privilege Escalation on Signup**: Verified user attempts to create `/users/{uid}` with `role: 'admin'` or `banned: false` omitted.
5. **Self-Unban / Role Tamper**: User attempts to update `/users/{uid}` changing `role` or `banned`.
6. **Seller Spoofing**: Verified user A attempts to create a listing with `sellerId: userB`.
7. **Shadow Field Injection**: Verified user attempts to create or update a listing with an unallowed ghost field (`isVerified: true` or `featured: true`).
8. **Float / Negative Price Poisoning**: Verified user attempts to create a listing with `pricePesewas: -500` or `pricePesewas: 12.5`.
9. **Empty or Oversized Images Array**: Verified user attempts to create a listing with `images: []` or `images` containing 6 URLs.
10. **Non-Owner Listing Edit**: Verified user B attempts to update a listing owned by user A.
11. **Terminal State Bypass**: Owner attempts to edit a listing after its `status` has reached `'removed'`.
12. **Client Timestamp Forgery & ID Poisoning**: User attempts to create a listing with a backdated `createdAt` (`Timestamp.fromMillis(1000)`) or an invalid listing ID containing spaces/path characters (`../bad`).

## 3. Saved Items / Favorites Invariants (`/users/{userId}/favorites/{listingId}`)
1. **Owner-Only Isolation**: Only the verified user matching `{userId}` may `get`, `list`, `create`, or `delete` documents under `/users/{userId}/favorites`. `allow list` enforces `resource.data.userId == request.auth.uid` without `get()`/`exists()` calls, enabling real-time cross-device sync via `onSnapshot`.
2. **Immutable Membership Records**: Saved item entries are created or deleted only (`allow update: if false`), preventing update-gap tampering.
3. **Referential, Volumetric & Temporal Integrity**: On `create`, `userId` must match `{userId}` and `request.auth.uid`, `listingId` must match `{listingId}`, `createdAt == request.time`, required keys are `['userId', 'listingId', 'createdAt']`, allowed keys strictly equal `['userId', 'listingId', 'createdAt', 'savedTitle', 'savedPricePesewas', 'savedCategory']`, the caller must not be banned, and `/listings/{listingId}` must exist with `status != 'removed'`.
4. **Optional Snapshot Bounds**: If provided at bookmark time (for price-drop tracking and graceful display if a listing is later removed), `savedTitle` must be 1–100 chars, `savedPricePesewas` must be an integer in `[100, 100000000]`, and `savedCategory` must match the marketplace category enum. Shadow fields (`note`, `featured`, etc.), oversized titles, float/negative prices, and invalid categories are rejected with `PERMISSION_DENIED`.

## 4. Seller Reviews & Ratings Invariants (`/users/{sellerId}/reviews/{reviewerId}`)
1. **One Review Per Student Per Seller**: Document ID is `{reviewerId}` (`request.auth.uid`), preventing duplicate review stuffing.
2. **Anti-Self-Review Gate**: A user cannot review themselves (`request.auth.uid != userId`).
3. **Verified Completed-Order Gate (Master Gate)**: Creating or updating a review requires a valid `orderId` pointing to an existing server-managed `/orders/{orderId}` document where `buyerId == request.auth.uid`, `sellerId == userId` (`sellerId`), and `status == 'completed'`. Reviews without a completed order, with non-completed orders (`pending_payment`, `payment_submitted`, `paid`, `shipped`, `cancelled`, `disputed`, `refunded`), with another buyer's order, or with a different seller's order are rejected with `PERMISSION_DENIED`.
4. **Strict Rating & Comment Bounds**: `rating` must be an integer `1..5`; `comment` must be 5–500 characters; `reviewerName` must be 2–60 characters; `orderId` must pass `isValidId()`; shadow fields are blocked via `hasOnly()`.
5. **Immutable Ownership, Order Reference & Temporal Integrity**: `sellerId`, `reviewerId`, `orderId`, and `createdAt` are immutable after creation; `updatedAt == request.time` on both create and update; only the review author may update (while the referenced order remains `completed`), and only the author or an admin may delete.
6. **Query Enforcer**: `allow list` validates `isVerifiedUser() && resource.data.sellerId == userId` with zero `get()`/`exists()` lookups.

### Seller Review Adversarial Payloads (Must All Return PERMISSION_DENIED)
- **No-Purchase Review**: Verified buyer with zero orders submits a review with a missing or nonexistent `orderId`.
- **Uncompleted-Order Review**: Verified buyer references an order with the seller in `pending_payment`, `paid`, `shipped`, or `cancelled` status.
- **Cross-Buyer Order Theft**: Verified buyer C submits a review referencing buyer A's completed order with seller B.
- **Cross-Seller Order Reuse**: Verified buyer A submits a review for seller B referencing a completed order with seller D.
- **Order Reference Mutation**: Verified buyer A attempts to change `orderId` during review update, or updates a review after the order transitions out of `completed`.

## 5. Listing Chat Threads & Price Negotiation Messages (`/listings/{listingId}/threads/{buyerId}` & `/messages/{messageId}`)
1. **Strict 1-on-1 Participant Privacy**: A thread keyed by `{buyerId}` and its nested `messages` subcollection are readable only by `{buyerId}`, the listing's authoritative `sellerId`, or an admin. Cross-buyer reads and scrapes are blocked on both `get` and `list`.
2. **Master Gate & Anti-Self-Chat**: A buyer may only initiate a thread on an existing, non-removed `/listings/{listingId}` document where `incoming().sellerId == listing.sellerId` and `buyerId != sellerId`.
3. **Atomic Batch Synchronization (Pillar 7)**: Every message `create` uses `existsAfter`/`getAfter` to verify the parent thread exists after the batch with matching `buyerId`, `sellerId`, `updatedAt == request.time`, and `lastMessageSenderId == request.auth.uid`.
4. **Immutable Negotiation Log**: Chat messages cannot be updated after creation (`allow update: if false`), and thread participant identities (`listingId`, `buyerId`, `sellerId`, `buyerName`, `sellerName`, `createdAt`) are immutable.
5. **Typed Offer Integrity**: `type == 'text'` forbids `offerPesewas`; `type == 'offer'` requires whole-integer `offerPesewas` in `[100, 100000000]`. `body` is bounded to 1–1000 characters and shadow fields are rejected via `hasOnly()`.

## 6. Local Payment, MoMo Verification & Campus Handover PIN (`/orders/{orderId}` & `/orders/{orderId}/secrets/handover`)
1. **Buyer-Only Pre-Completion Handover PIN Isolation**: On local order creation (`pay_on_meetup` or `momo_prepayment`), the 4-digit numeric `handoverPin` is stored in `/orders/{orderId}/secrets/handover` (never on `/orders/{orderId}` before completion). Only the `buyerId` (or admin) may `get` `/orders/{orderId}/secrets/handover`; `list`, `update`, and `delete` are denied (`if false`), preventing sellers from reading the PIN before physical handover.
2. **Server-Authoritative Listing Price & Commission Split Integrity**: On client local-order creation, `amountPesewas` must equal the live `/listings/{listingId}.pricePesewas` (while `listing.status == 'active'`), `sellerId` must match `listing.sellerId`, `buyerId != sellerId`, `commissionPesewas + sellerAmountPesewas == amountPesewas`, `released == false`, `status == 'pending_payment'`, and `existsAfter`/`getAfter` verifies atomic creation of `/orders/{orderId}/secrets/handover`.
3. **Role-Locked Payment Proof Submission**: Only `buyerId` may submit MoMo proof fields (`transactionId`, optional `receiptUrl` / `receiptImageUrl`, optional `receiptNote`) on `momo_prepayment` orders from `status == 'pending_payment'` and `paymentStatus == 'unpaid'`, transitioning exclusively to `paymentStatus: 'proof_submitted'`, `receiptStatus: 'submitted'`, `status: 'payment_submitted'`.
4. **Role-Locked Seller MoMo Verification & Proof Rejection**: Only `sellerId` may confirm receipt (`paymentStatus: 'verified'`, `receiptStatus: 'verified'`, `status: 'paid'`, `paidAt == request.time`) or reject invalid proof (`paymentStatus: 'unpaid'`, `receiptStatus: 'rejected'`, `status: 'pending_payment'`).
5. **PIN-Gated Atomic Handover Completion**: Only `sellerId` may transition an order (`paymentStatus in ['pay_on_meetup', 'verified']` and `status in ['pending_payment', 'paid', 'shipped']`) to `status: 'completed'` by supplying a 4-digit `handoverPin` that exactly matches `get(/databases/$(database)/documents/orders/$(orderId)/secrets/handover).data.handoverPin`, recording `paymentStatus: 'verified'`, `released: true`, `completedAt == request.time`, and atomically updating `/listings/{listingId}.status == 'sold'`.

### Local Payment & Handover PIN Adversarial Payloads (Must All Return PERMISSION_DENIED)
- **Seller Pre-Completion PIN Read**: Seller attempts `get` or `list` on `/orders/{orderId}/secrets/handover`.
- **Buyer Self-Completion**: Buyer attempts to update `/orders/{orderId}` to `status: 'completed'` or `paymentStatus: 'verified'`.
- **Seller Proof Tampering**: Seller attempts to write `transactionId` or `paymentStatus: 'proof_submitted'`.
- **Wrong Handover PIN**: Seller attempts to complete `/orders/{orderId}` with a mismatched 4-digit `handoverPin`.
- **Completed Without Sold Listing**: Seller attempts to complete `/orders/{orderId}` without atomically marking `/listings/{listingId}` as `status: 'sold'`.
- **Price / Commission Tamper on Checkout**: Buyer creates an order with `amountPesewas` different from `/listings/{listingId}.pricePesewas` or `released: true`.
