# Marketplace — authors, review and delivery

How Aera Market decides what may be sold, and what happens to a product from
submission to download.

---

## 1. Who can sell

Any signed-in account may apply (`POST /api/sellers/apply`). The application
stores a bio, a display name and a country, and starts in `PENDING`.

An administrator approves, rejects or suspends the profile
(`PATCH /api/admin/sellers`). Approval also grants the `SELLER` role. Until then
the account can buy but cannot publish.

Suspending an author suspends every one of their approved products in the same
action, so nothing stays purchasable behind a blocked account.

## 2. Categories

Eight categories ship in `lib/server/database/categories.repo.ts` and are created
by `scripts/seed.mjs`. Each one declares:

| Field | Meaning |
|---|---|
| `allowedKinds` | which product types may be sold there |
| `allowedExtensions` | which file types may be delivered |
| `maxFileMb` | per-file size ceiling |
| `minPriceMinor` | price floor |

Admins can create and edit categories through `POST/PATCH /api/admin/categories`
(the API exists; there is no admin screen for it yet).

## 3. Submission pipeline

```
DRAFT ──submit──▶ PENDING_REVIEW ──approve──▶ APPROVED
  ▲                    │  ▲                    │
  │                 reject│request changes     │suspend
  │                    ▼  │                    ▼
  └──── edit ───── REJECTED  CHANGES_REQUESTED  SUSPENDED
```

A draft is only editable in `DRAFT` and `CHANGES_REQUESTED`.

## 4. The "does the file match the claim" check

`lib/server/products/review.ts` produces fourteen checks. Blocking failures
reject the submission with the exact reason; warnings are shown to the reviewer.

| Check | Blocking | What it proves |
|---|---|---|
| `FILES_PRESENT` | yes | at least one verified deliverable |
| `KIND_MATCHES_CATEGORY` | yes | the claimed type is sold in that category |
| `FILE_TYPES_ALLOWED` | yes | extensions are accepted by the category |
| `FILES_MATCH_CLAIM` | yes | the extensions can plausibly support the claimed type |
| `FILE_SIZE` | yes | per-file and count limits |
| `PREVIEW_PRESENT` | yes | buyers see what they get |
| `PRICE_RANGE` | yes | above the category floor |
| `SUMMARY_QUALITY` | yes | 40–200 characters |
| `DUPLICATE_TITLE` | yes | no duplicate of the author's own listed products |
| `DESCRIPTION_DEPTH` | no | 300+ characters recommended |
| `TAGS` | no | 1–10 tags |
| `DOCUMENTATION` | no | install notes or a docs link |
| `ARCHIVE_ONLY` | no | warns that a reviewer must open the archive |

**Honest limit:** the platform cannot execute a plugin or open a Photoshop file
during upload. It blocks demonstrable mismatches (a "Minecraft plugin" shipped as
`.psd`), and everything unprovable is flagged for the human reviewer. That is the
same trade-off Envato makes.

## 5. Files and storage

Uploads never pass through the function (Vercel caps bodies at 4.5 MB):

1. `POST /api/uploads/presign` validates ownership, status, extension and size,
   then signs a `PUT` URL with **content-length and content-type bound**.
2. The browser uploads straight to Backblaze B2.
3. `POST /api/uploads/complete` calls `HeadObject` and refuses the file unless the
   stored size matches exactly.

The bucket is private. Previews are served through `/api/previews/{id}` which
redirects to a signed URL; downloads go through `/api/downloads/authorize` and
expire in 120 seconds.

## 6. Selling and delivery

On settlement (`settlePayment`), in one pass:

- the payment becomes `PAID` and the order `FULFILLED`
- ledger rows are written (sale, commission, platform revenue)
- the author's balance is credited idempotently
- **a purchase row is granted per item** — this is what the library reads

Commission comes from the author's own rate for single-seller orders, otherwise
the platform default (40%).

A full refund removes the purchase row, so download access ends with the money.

## 7. Verification commands

```bash
pnpm typecheck      # API + shared modules
pnpm test           # 33 unit tests
pnpm check:pages    # every page asset, id and nav target resolves
```
