# Deploying Aera Market to Vercel

Everything in the repository is ready for a zero-config Vercel deployment:
static HTML at the root, TypeScript functions in `api/`, shared server code in
`lib/`, `vercel.json` for headers and function limits, and a pnpm lockfile
(lockfile version 9, compatible with Vercel's pnpm).

---

## 1. Push the repository

The commit is already created locally (`feat: payment system with Safepay…`).
Only authentication is missing.

```powershell
cd D:\aeramarket
git -c http.sslBackend=openssl push -u origin main
```

A GitHub sign-in window appears the first time. After it completes, the push
runs and the code is on `github.com/deadlyghost90/Aera-Market`.

Verify:

```powershell
git status -sb        # should show: ## main...origin/main
```

---

## 2. Import into Vercel

1. <https://vercel.com/new> → **Import Git Repository** → `deadlyghost90/Aera-Market`.
2. Framework preset: **Other**.
3. Build command: leave **empty**.
4. Output directory: leave **empty**.
5. Root directory: `./`.
6. Install command: leave default (Vercel detects `pnpm-lock.yaml`).

Do **not** add a build command — there is nothing to build. Vercel compiles
`api/*.ts` automatically and serves the HTML/CSS/JS as static assets.

---

## 3. Environment variables

Add these in **Project → Settings → Environment Variables** for *Production* and
*Preview*. Values come from your local `.env.local`; they are never committed.

| Variable | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | `aera-s-store` |
| `FIREBASE_DATABASE_URL` | `https://aera-s-store-default-rtdb.europe-west1.firebasedatabase.app` |
| `FIREBASE_CLIENT_EMAIL` | service account email |
| `FIREBASE_PRIVATE_KEY` | service account key (paste with `\n` escapes) |
| `FIREBASE_API_KEY` | web API key |
| `FASTPAY_PUBLIC_KEY` | Safepay public key |
| `FASTPAY_SECRET_KEY` | Safepay secret key |
| `FASTPAY_WEBHOOK_SECRET` | webhook signing secret (optional) |
| `FASTPAY_ENVIRONMENT` | `sandbox` first, then `production` |
| `FASTPAY_BASE_URL` | `https://sandbox.api.getsafepay.com` |
| `FASTPAY_CHECKOUT_URL` | `https://sandbox.api.getsafepay.com/components` |
| `APP_ORIGIN` | exact deployed origin, e.g. `https://aera-market.vercel.app` |
| `PLATFORM_COMMISSION_PERCENT` | `40` |
| `PAYMENTS_ENABLED` | `true` |

`APP_ORIGIN` must match the real origin exactly, including `https://` and with no
trailing slash — it is used for the payment return URL and the CSRF origin check.

`FIREBASE_PRIVATE_KEY` alternative: base64-encode the whole service-account JSON
and put it in `FIREBASE_SERVICE_ACCOUNT_B64` instead.

---

## 4. Deploy

Click **Deploy**. Then verify:

- `https://<domain>/api/health` → `{"status":"ok","database":{"ok":true}}`
- `https://<domain>/` → product list loads
- `https://<domain>/api/config/public` → gateways, commission, `paymentsEnabled`

If `health` returns 503, the database URL or service account is wrong.

---

## 5. Database rules

Deploy the rules and indexes once (they deny all client access; the Admin SDK is
unaffected):

```powershell
npx firebase-tools login
npx firebase-tools deploy --only database --project aera-s-store
```

---

## 6. First accounts

```powershell
node scripts/seed.mjs seller@example.com "StrongPassword123"   # demo seller + product
node scripts/make-admin.mjs you@example.com                    # grant ADMIN
```

Run these with the same Firebase environment variables (`.env.local`).

---

## 7. Payment webhook

In the Safepay dashboard set the webhook URL to:

```
https://<domain>/api/payments/webhook
```

The gateway secret must match `FASTPAY_SECRET_KEY` (or `FASTPAY_WEBHOOK_SECRET`).

---

## 8. Preview deployments

Vercel previews are public by default. Enable **Deployment Protection → Vercel
Authentication** for previews so unpublished builds cannot reach the API.

---

## Notes and limits

- **4.5 MB request body limit** — no file uploads flow through functions; digital
  products will upload directly to Backblaze B2 with presigned URLs.
- **Function duration** — capped at 30 s in `vercel.json`; no long-running work.
- **`__Host-` session cookie** requires HTTPS; it is only set with the `Secure`
  flag when `APP_ORIGIN` starts with `https://`.
- **Node version** is pinned to `22.x` via `engines`.
- Rolling back: Vercel keeps every deployment; promote the previous one.
