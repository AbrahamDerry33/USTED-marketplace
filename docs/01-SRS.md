# Campus Market — Software Requirements Specification (01-SRS)

## 1. Purpose & Scope
Campus Market is a verified student-to-student marketplace built for university students in Ghana, denominated strictly in **Ghana cedis (GHS)** with all monetary values stored internally as whole **pesewas** (`1 GHS = 100 pesewas`).

## 2. Core Requirements Traceability

### Auth & Verification (Step 2)
- **REQ-AUTH-01**: Students sign up using Firebase Email/Password authentication with a valid school email address.
- **REQ-AUTH-02**: Email verification (`emailVerified == true`) is mandatory in both the client UI and Firestore/Storage security rules before accessing marketplace data.
- **REQ-AUTH-03**: Authentication errors must use generic messaging that never leaks whether an account exists.

### Feature 1: Listings (Step 3)
- **REQ-LST-01**: Verified students can create a listing with title (3–100 chars), description (10–2000 chars), price in GHS (stored as integer pesewas >= 100), category, condition (`new`, `like_new`, `good`, `fair`), and 1 to 5 images (JPEG/PNG/WebP, max 5 MB each).
- **REQ-LST-02**: Verified students can browse active listings ordered newest first (`createdAt` descending).
- **REQ-LST-03**: Verified students can search active listings by keyword and filter by category and min/max GHS price.
- **REQ-LST-04**: Verified students can view full listing details including image gallery, condition, category, seller name, and price.
- **REQ-LST-05**: Sellers can view "My Listings" filtered by status (`active`, `reserved`, `sold`, `removed`).
- **REQ-LST-06**: Sellers can edit their own non-removed listings and update status (`active`, `reserved`, `sold`).
- **REQ-LST-07**: Sellers can soft-remove their own listings (`status: 'removed'`); hard deletes are denied by Firestore rules.

### Feature 2: Chat (Step 4 — Planned)
- **REQ-CHT-01**: Buyers can start a conversation from a listing; real-time messages via Firestore listeners; max 1000 chars with HTML tags stripped.

### Feature 3: Payments (Step 5 — Planned)
- **REQ-PAY-01**: Server-side `createOrder`, Paystack initialize/webhook (`HMAC SHA512`), `verifyPayment` backup, `updateOrderStatus` (`pending_payment`, `paid`, `shipped`, `completed`, `cancelled`, `disputed`, `refunded`).

### Feature 4: Notices (Step 6 — Planned)
- **REQ-NOT-01**: Notification documents for both buyer and seller on key order events + bell unread counter + Firebase Trigger Email extension.

### Feature 5: Dashboards (Step 7 — Planned)
- **REQ-DSH-01**: Buyer dashboard and Seller dashboard.

### Security & Non-Functional Requirements
- **REQ-SEC-01**: Deny-by-default Firestore and Storage security rules validated with ESLint and emulator rules tests.
- **REQ-SEC-02**: PII (`email`) isolated in `/users/{userId}/private/info`; users cannot modify `role`, `banned`, `email`, or `uid`.
- **REQ-SEC-03**: Client and server input sanitization (HTML tag stripping) and strict schema validation.
- **REQ-SEC-04**: Hosting CSP and security headers configured in `firebase.json`.
- **REQ-UI-01**: Mobile-first layout supporting 360 px viewports with WCAG AA contrast, labelled inputs, and loading/empty/error states.

## 3. Open School Decisions (Pending Confirmation)
| ID | Topic | Status | Notes |
| --- | --- | --- | --- |
| DEC-01 | Official school email domain(s) | Pending | Configurable via `VITE_SCHOOL_EMAIL_DOMAINS`; rules domain regex ready to lock once confirmed. |
| DEC-02 | Platform commission percentage | Pending | Needed prior to Step 5 (`createOrder` Cloud Function). |
| DEC-03 | Payout & dispute process | Pending | Needed prior to Step 5 (`orders` settlement metadata). |
