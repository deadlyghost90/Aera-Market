# Payment System â€” Implementation Notes

This document describes what was built, what was verified against the live
gateway, and what remains manual. It is the reference for deployment and for the
next development phase.

---

## 1. Verified gateway contract

The merchant account is provisioned with **Safepay** (`getsafepay.com`), not
`fast-pay.cash`. The credentials in `Env.txt` (`sec_â€¦` public key + 64-hex secret)
match Safepay's format, and the integration was confirmed against the sandbox on
2026-11-22.

| Call | Result |
|---|---|
| `POST https://sandbox.api.getsafepay.com/order/v1/init` with `{environment, amount, currency, client}` | **HTTP 200**, returned `data.token = track_â€¦` |
| `GET https://sandbox.api.getsafepay.com/order/v1/{tracker}` | **HTTP 200**, tracker JSON including `state` |
| Checkout URL | `https://sandbox.api.getsafepay.com/components?env=sandbox&beacon=<tracker>&source=â€¦&order_id=â€¦&redirect_url=â€¦&cancel_url=â€¦` |
| Redirect signature | `hex(HMAC-SHA256(tracker, secretKey))` posted back as `sig` |
| Refund API | **No public endpoint** (`/refund`, `/order/v1/{t}/refund` â†’ 404). Refunds are executed in the Safepay dashboard. |

Production base URL: `https://api.getsafepay.com`; production checkout:
`https://www.getsafepay.com/components`. Both are environment-driven, so no code
change is required to switch.

---

## 2. Gateway abstraction

`lib/server/payments/types.ts` defines `PaymentGateway`:

```
initiatePayment(input)          -> { tracker, checkoutUrl }
fetchTracker(tracker)           -> normalised state (paid / failed / cancelled)
verifyRedirectSignature(t, sig) -> boolean
verifyWebhookSignature(...)     -> boolean
normaliseWebhook(rawBody)       -> { eventId, tracker, isPaid, â€¦ }
```

`lib/server/payments/registry.ts` maps `safepay` to the adapter and exposes a
catalogue where every other provider is `COMING_SOON`. Adding a provider means
implementing this interface and registering it â€” payment history, orders,
commissions and refunds stay untouched.

---

## 3. End-to-end flow

1. `POST /api/orders` â€” server re-prices every product from the database,
   snapshots title and price, creates the order as `PENDING_PAYMENT`.
2. `POST /api/payments/initiate` â€” verifies ownership and order state, computes
   the commission split, creates the payment record, calls the gateway, stores
   the tracker and the hosted checkout URL, returns the URL.
3. Customer pays on the hosted page.
4. Gateway redirects the browser (form POST) to `/api/payments/return`:
   signature verified â†’ **gateway queried** â†’ only then settled.
5. Gateway webhook `POST /api/payments/webhook` â€” signature verified, event id
   deduplicated, tracker resolved, gateway re-queried, then settled.
6. Settlement writes, atomically: payment status, payment event, order status,
   ledger entries. Seller balance is credited idempotently afterwards.
7. `GET /api/payments/{id}/status` lets the browser poll; it never trusts the
   browser and can itself trigger the gateway check.

A payment becomes `PAID` only through step 4 or 5. There is no endpoint that
accepts a status from the client.

---

## 4. Data model

Realtime Database nodes, with the SQL concept each one replaces:

| Node | Purpose | Key constraints |
|---|---|---|
| `payments/{paymentId}` | Permanent financial record | `idempotencyKey` unique via `idempotency/`; `gatewayTrackerId` unique via `gatewayTrackers/` |
| `paymentsByUser/{uid}/{paymentId}` | Customer history index | append-only |
| `paymentsByOrder/{orderId}/{paymentId}` | Order â†” payment link | one open payment per order |
| `paymentEvents/{paymentId}/{eventId}` | Immutable status history | append-only, never updated |
| `gatewayTrackers/{tracker}` | `tracker â†’ paymentId` uniqueness index | transactional claim, never overwritten |
| `idempotency/{key}` | Retry protection | transactional claim |
| `webhookEvents/{provider}/{eventId}` | Replay protection | transactional claim, released on processing failure |
| `refunds/{refundId}` | Refund requests and decisions | one open refund per payment |
| `refundsByUser/{uid}/{refundId}` | Customer refund index | â€” |
| `ledger/{entryId}` | Append-only double-sided journal | never updated or deleted |
| `sellerBalances/{sellerId}` | Materialised seller balance | `applied` map makes credits idempotent |
| `orders/{orderId}` | Order + immutable item snapshot | status machine enforced server-side |
| `auditLogs/{logId}` | Audit trail | append-only |
| `users/{uid}` | Profile + role + status | role only writable by admins |

### Payment record fields

Internal id, order id, user id, product id, product-name snapshot, original
price, currency, gateway, environment, tracker id, gateway transaction id,
gateway reference, gateway response reference, payment method (when supplied),
status, refunded amount, refund status, commission percent, commission amount,
seller payable, failure reason, idempotency key, created/updated/completed
timestamps.

Money is stored exclusively as **integer minor units** (paisa). No floating point
is ever used for storage or arithmetic.

### Relationships

`user â†’ orders â†’ payments â†’ refunds`, and `payments â†’ ledger â†’ sellerBalances`.
Deleting an order from a customer's history never deletes the payment, ledger or
audit rows.

---

## 5. Status machine

```
CREATED â†’ PENDING â†’ PROCESSING â†’ PAID
   â”‚         â”‚           â”‚
   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â†’ FAILED / CANCELLED   (terminal for browsers)

PAID â†’ REFUND_PENDING â†’ PARTIALLY_REFUNDED â†’ REFUNDED
```

Rules enforced in `lib/server/payments/state.ts`:

- `FAILED` and `CANCELLED` never become `PAID` from an API, redirect or admin
  action.
- The single exception is a **verified gateway webhook**, because the gateway is
  the authority on whether money moved (covers our own timeouts).
- `REFUNDED` is terminal.
- Illegal transitions are rejected with `INVALID_TRANSITION` (HTTP 409) and never
  written.

---

## 6. Commission and ledger

40% platform commission by default (`PLATFORM_COMMISSION_PERCENT`).

For PKR 1,000 (100000 minor units):

| Entry | Party | Amount |
|---|---|---|
| `SALE` | seller | +100000 |
| `COMMISSION` | seller | âˆ’40000 |
| `COMMISSION` | platform | +40000 |

Seller balance = 60000. Platform revenue = 40000.

On refund the seller funds only their net share and the platform reverses its
commission:

Refund of PKR 400 â†’ `REFUND` âˆ’24000 (seller), `COMMISSION_REVERSAL` âˆ’16000
(platform). Seller keeps 36000, which is exactly 60% of the unrefunded PKR 600.

Seller balances are credited through a transaction guarded by an `applied` map, so
webhook replays and retries cannot double-credit.

---

## 7. Refunds

1. Buyer requests a refund (`POST /api/refunds`) with an amount and a reason.
   Only `PAID` / `PARTIALLY_REFUNDED` payments qualify, one open request at a
   time, capped at the refundable balance.
2. Admin approves or rejects (`PATCH /api/admin/refunds/{id}`).
3. Admin transfers the money in the Safepay dashboard, then marks the refund
   **completed** with the gateway refund reference.

The status becomes `PARTIALLY_REFUNDED` or `REFUNDED` only at step 3 â€” never on
request or approval. Full and partial refunds are both supported.

**Why manual:** Safepay exposes no refund API. Claiming automated gateway refunds
would be false. The interface is ready for automation the moment a provider
supports it.

---

## 8. Security controls

- Session: Firebase session cookie, `__Host-` prefix, HttpOnly, Secure,
  SameSite=Lax, revocation checked on every request.
- Roles read from the database, never from the request body or claims alone.
- Ownership checked on orders, payments, refunds and product writes.
- CSRF: `Origin` allowlist plus a custom `X-Requested-With` marker on every
  mutation; webhook and gateway redirect are exempt and signature-verified.
- Webhook: signature verification on the raw body (and tracker fallback),
  replay protection by event id, claim released on processing failure so a
  legitimate retry is not lost.
- Amount verification: the gateway-reported amount must equal the stored amount
  before settlement; mismatches are audited and not settled.
- Input validation: zod schemas, unknown fields rejected, ids constrained to
  `[A-Za-z0-9_-]` so they cannot escape an RTDB path.
- Rate limits: login, registration, payment initiation and refund requests.
- Audit log: every financial transition and admin decision.
- Errors: stable codes and safe messages, request id, no stack traces or secrets.
- No card data ever touches the application: the hosted checkout collects it.

---

## 9. Environment variables

| Variable | Purpose |
|---|---|
| `FIREBASE_PROJECT_ID` | `aera-s-store` |
| `FIREBASE_DATABASE_URL` | RTDB URL (`europe-west1`) |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Service account (or use `FIREBASE_SERVICE_ACCOUNT_B64`) |
| `FIREBASE_API_KEY` | Identity Toolkit sign-in (public identifier, referrer-restricted) |
| `SAFEPAY_PUBLIC_KEY` | Safepay dashboard **Public key** (`sec_â€¦`) |
| `SAFEPAY_SECRET_KEY` | Safepay dashboard **Secret key** (signs redirect payloads) |
| `SAFEPAY_WEBHOOK_SECRET` | Optional separate webhook secret; falls back to the secret key |
| `SAFEPAY_ENVIRONMENT` | `sandbox` or `production` |
| `SAFEPAY_BASE_URL` | `https://sandbox.api.getsafepay.com` or `https://api.getsafepay.com` |
| `SAFEPAY_CHECKOUT_URL` | `â€¦/components` for the matching environment |
| `APP_ORIGIN` | Exact public origin, used for redirect and CSRF checks |
| `PLATFORM_COMMISSION_PERCENT` | `40` |
| `SESSION_COOKIE_NAME` | `__Host-aera_session` |
| `SESSION_TTL_DAYS` | `5` (max 14) |
| `PAYMENTS_ENABLED` | `true` / `false` kill switch |

Never commit real values. `.env.example` contains placeholders only.

---

## 10. Gateway configuration

1. Safepay dashboard â†’ **Developers / API** â†’ copy the Public key and Secret key
   into Vercel (never into the repo).
2. Set the webhook endpoint to `https://<your-domain>/api/payments/webhook`.
3. Copy the webhook signing secret into `SAFEPAY_WEBHOOK_SECRET` if it differs
   from the account secret key.
4. Set the success/return URL behaviour through the `redirect_url` we send
   (`/api/payments/return`), and a cancel URL (`/order-result?state=cancelled`).
5. Start in sandbox: `SAFEPAY_ENVIRONMENT=sandbox` with the sandbox key pair.
   Production uses a different key pair â€” never reuse sandbox keys in production.

Sandbox test cards are issued by Safepay in the sandbox dashboard.

---

## 11. Deployment

```bash
pnpm install
pnpm typecheck && pnpm test
vercel link
vercel env pull .env.local
```

Vercel project settings: framework preset **Other**, no build command.

Deploy database rules and indexes:

```bash
npx firebase-tools deploy --only database --project aera-s-store
```

Bootstrap:

```bash
node scripts/seed.mjs seller@example.com 'StrongPassword123'   # dev only
node scripts/make-admin.mjs you@example.com
```

Production checklist:

- `APP_ORIGIN` is the exact https origin.
- `PAYMENTS_ENABLED=true` only after sandbox verification.
- Vercel preview deployments are protected (otherwise previews can reach the API).
- The Firebase web API key is restricted to your domains and Identity Toolkit.
- The B2 application key and the gateway secret key are rotated after any exposure.

---

## 12. Testing

```bash
pnpm test        # unit tests: state machine, commission, signatures, refunds
pnpm typecheck   # strict TypeScript over api/ and lib/
```

Covered: successful and failed payment transitions, duplicate webhook handling
(idempotent settlement), invalid signatures (RFC 4231 vector), full and partial
refund maths, commission rounding invariants, unauthorised access rules.

Sandbox verification checklist (must be repeated after any gateway change):

1. Start checkout from the UI and pay with a sandbox card.
2. Confirm `payments/{id}` becomes `PAID`, order `FULFILLED`, ledger rows exist,
   seller balance is credited once.
3. Replay the webhook (`curl` twice) â€” second call must be a duplicate and must
   not change balances.
4. Send a webhook with a wrong signature â€” must return 401 and change nothing.
5. Request a refund, approve it, complete it with a reference â€” confirm
   `PARTIALLY_REFUNDED` / `REFUNDED` and the reversal entries.

**Nothing in this repository claims a live transaction has been completed.** The
sandbox init call was verified; a full paid flow must be run with your merchant
account before launch.

---

## 13. Known limitations

1. **No automated gateway refunds** â€” Safepay has no public refund API; completion
   is an admin step recording the reference.
2. **Webhook payload shape** â€” the documented redirect payload is definitive; the
   webhook body is normalised defensively and both signing schemes are accepted.
   If Safepay publishes a stricter schema, tighten `normaliseWebhook`.
3. **Admin analytics scan a bounded window** (1,000 newest payments) and report
   `scanComplete: false` beyond it. Add a rollup job before volume grows.
4. **Seller payouts are not automated** â€” balances are ledger-derived; transfers
   are manual.
5. **No entitlement/download delivery yet** â€” purchases are recorded in the
   ledger but the buyer library and B2 download authorisation are a separate
   module.
6. **Single currency** (PKR) is enforced at the gateway level.
7. **`applied` maps in seller balances** grow with transaction count; archive them
   once a ledger rollup exists.
8. **UI is structural only** â€” styling and layout are handled separately.

---

## 14. Files added

```
api/
  health.ts                      api/config/public.ts
  auth/session.ts                auth/register.ts
  products/index.ts              products/[id].ts
  orders/index.ts                orders/[id].ts
  payments/index.ts              payments/initiate.ts
  payments/return.ts             payments/webhook.ts
  payments/[id]/status.ts
  refunds/index.ts
  admin/payments.ts              admin/users.ts
  admin/refunds/[id].ts

lib/server/
  config/env.ts
  firebase/admin.ts  firebase/session.ts  firebase/guards.ts
  database/paths.ts  users.repo.ts  products.repo.ts  orders.repo.ts
  database/payments.repo.ts  refunds.repo.ts  ledger.repo.ts
  database/settlement.repo.ts
  payments/types.ts  state.ts  allocation.ts  safepay.ts  registry.ts
  payments/service.ts  refund-service.ts  stats.ts
  security/validate.ts  rate-limit.ts  audit.ts
  utils/http.ts  errors.ts  logger.ts  money.ts  ids.ts

lib/shared/enums.ts  lib/shared/types.ts
firebase.json  firebase/database.rules.json
tests/state.test.ts  commission.test.ts  signature.test.ts  refund.test.ts
scripts/seed.mjs  scripts/make-admin.mjs
*.html (index, checkout, order-result, buyer-payments, admin-payments, login, register)
css/base.css  js/core/*.js  js/pages/*.js
```
