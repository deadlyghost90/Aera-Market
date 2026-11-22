# Aera Market

Multi-vendor digital products marketplace for **Aera Intelligence (Pvt) Ltd.**

- Frontend: static HTML5 + CSS3 + vanilla JavaScript (no framework, no bundler)
- Backend: TypeScript serverless functions on Vercel (`api/`)
- Data: Firebase Authentication + Realtime Database (Admin SDK only)
- Payments: Safepay (hosted checkout), gateway-abstracted

## Status

Working vertical slice: authentication, catalogue, orders, payment initiation,
gateway return + webhook verification, settlement with 40% commission, seller
balances, refunds with admin approval, admin analytics, customer payment
history, and unit tests.

The UI is intentionally unstyled beyond a structural baseline — visual design is
handled separately.

## Quick start

```bash
pnpm install
cp .env.example .env.local     # fill in real values
pnpm typecheck
pnpm test
```

Deploy:

```bash
vercel link
vercel env pull .env.local
vercel deploy --prebuilt=false
```

## Project layout

```
*.html              pages (root, as required)
css/                single structural stylesheet
js/                 browser ES modules (core/, pages/)
api/                Vercel functions - one file per route
lib/server/         server-only modules (firebase, payments, security, database)
lib/shared/         types + enums shared by API and tests
firebase/           database rules + indexes
tests/              node:test unit tests (compiled with tsc)
scripts/            seed + role bootstrap (development only)
docs/               architecture and payment documentation
```

## Documentation

- [`docs/PAYMENTS.md`](docs/PAYMENTS.md) — gateway contract, data model, environment, deployment, testing, limitations.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm typecheck` | Type-check the API and shared modules |
| `pnpm test` | Run unit tests |
| `pnpm seed` | Create a demo seller + product (dev only) |
| `pnpm make-admin <email>` | Grant the ADMIN role |

## Security notes

- Secrets live only in environment variables; nothing sensitive is committed.
- The browser never sees a service account, gateway key, or database credential.
- Every financial endpoint re-validates the session, the role and resource ownership.
- Payment status changes only after gateway verification (redirect + webhook).
