# Aera Market

Author marketplace for digital products, built for **Aera Intelligence (Pvt) Ltd.**

Anyone can apply as an author. An administrator approves the profile, the author
uploads real files, automated checks compare those files with what the author
claims, and a reviewer decides whether it goes live. Buyers pay through Safepay
and download from a private bucket.

- **Frontend:** static HTML5 + CSS3 + vanilla ES modules (no framework, no bundler)
- **Backend:** TypeScript serverless functions on Vercel (`api/`)
- **Data:** Firebase Auth + Realtime Database, accessed only through the Admin SDK
- **Files:** Backblaze B2, private bucket, presigned uploads and downloads

## What works today

| Area | State |
|---|---|
| Accounts, sessions, roles | Email/password sign-in with HttpOnly session cookies |
| Authors | Apply, admin approve/reject/suspend, per-author commission |
| Catalogue | Categories with allowed types, file types, size and price floors |
| Submissions | Draft â†’ automated checks â†’ review queue â†’ approved/rejected/changes |
| Uploads | Presigned PUT to B2 with size **and** content-type signed; verified via HeadObject |
| Payments | Safepay hosted checkout, verified redirect + webhook, 40% commission by default |
| Refunds | Buyer request, admin approval, manual gateway completion, ledger reversal |
| Delivery | Purchase entitlements, 120-second signed downloads, access revoked on full refund |
| Admin | Products, authors, categories, payments, refunds, review queue |
| UI | 14 pages sharing one design system and shell |

## Quick start

```bash
pnpm install
cp .env.example .env.local     # fill in real values
node scripts/preflight.mjs     # checks every variable before you deploy
pnpm typecheck
pnpm test
pnpm check:pages
```

Deploy: see [`docs/DEPLOY-VERCEL.md`](docs/DEPLOY-VERCEL.md).

## Scripts

| Command | Purpose |
|---|---|
| `pnpm typecheck` | Strict TypeScript over `api/` and `lib/` |
| `pnpm test` | Six suites, 33 tests (state machine, commission, signatures, refunds, review rules, presigned uploads) |
| `pnpm check:pages` | Every page asset, element id and nav target resolves |
| `node scripts/preflight.mjs` | Validate environment variables and formats |
| `pnpm seed` | Categories + admin + demo author (development only) |
| `pnpm make-admin <email>` | Grant the ADMIN role |

## Layout

```
*.html              pages (root, as required)
css/                one design system
js/                 browser modules: core/ (shell, api, catalog) and pages/
api/                single catch-all function (Hobby plan allows 12)
lib/api/            route handlers, dispatched by the router
lib/server/         firebase, database, payments, products, storage, security, utils
lib/shared/         types and enums shared by API and tests
firebase/           database rules and indexes
scripts/            seed, preflight, page wiring check
tests/              unit tests
docs/               PAYMENTS.md, MARKETPLACE.md, DEPLOY-VERCEL.md
```

## Documentation

- [`docs/MARKETPLACE.md`](docs/MARKETPLACE.md) â€” author flow, the fourteen review checks and their limits, upload binding, delivery.
- [`docs/PAYMENTS.md`](docs/PAYMENTS.md) â€” Safepay integration, ledger, refunds, environment.
- [`docs/DEPLOY-VERCEL.md`](docs/DEPLOY-VERCEL.md) â€” step-by-step deployment.

## Security notes

- Secrets live only in environment variables; nothing sensitive is committed.
- The browser never sees a service account, gateway key or bucket credential.
- Every financial endpoint re-validates session, role and resource ownership.
- A payment becomes `PAID` only after gateway verification; a download is issued
  only after a purchase row proves ownership.
