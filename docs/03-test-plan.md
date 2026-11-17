# Campus Market — Test Plan & Execution Log (03-test-plan)

## Test Policy
Only results observed from actual test execution are recorded as Passed. Tests requiring local Firebase Emulators (`FIRESTORE_EMULATOR_HOST`) are recorded as Skipped until run inside `firebase emulators:exec`.

## Step 3 — Listings & Security Rules Results

| ID | Suite / Check | Requirement IDs | Status | Notes |
| --- | --- | --- | --- | --- |
| TC-LST-01 | `src/lib/__tests__/money.test.ts` (3 tests: GHS to pesewas, invalid money rejection, GHS formatting) | REQ-LST-01, REQ-SEC-03 | Passed | Executed via `npm test` (`vitest run`). |
| TC-LST-02 | `src/lib/__tests__/listingValidation.test.ts` (5 tests: HTML tag stripping, school email domain check, form bounds, seller status transitions, keyword/category/price filtering) | REQ-LST-01, REQ-LST-02, REQ-LST-03, REQ-LST-06, REQ-LST-07, REQ-SEC-03 | Passed | Executed via `npm test` (`vitest run`). |
| TC-SEC-01 | `npm run lint:rules` (`eslint firestore.rules` with `@firebase/eslint-plugin-security-rules`) | REQ-SEC-01, REQ-SEC-02 | Passed | Exited with code 0, zero warnings/errors. |
| TC-SEC-02 | `tests/firestore.rules.test.ts` (6 suites covering Dirty Dozen #1–#12) | REQ-AUTH-02, REQ-SEC-01, REQ-SEC-02 | Skipped | Skipped in sandbox (`FIRESTORE_EMULATOR_HOST` not set). Run with `firebase emulators:exec --only firestore "npm test"`. |
