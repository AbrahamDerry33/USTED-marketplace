# Campus Market — Security Specification (Phase 0 TDD)

## 1. Data Invariants (Step 3: Users & Listings)
1. **Deny by Default**: Any path not explicitly matched under `/databases/{database}/documents` is rejected.
2. **Verified School Email Gate**: No user may read or write marketplace data (`users`, `listings`, Storage images) unless `request.auth != null` and `request.auth.token.email_verified == true`.
3. **PII Isolation**: User email addresses reside exclusively in `/users/{userId}/private/info`, readable only by the owner (`request.auth.uid == userId`) or an admin. Public `/users/{userId}` documents contain no email or private PII.
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
