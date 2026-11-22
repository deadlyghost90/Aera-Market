import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FakeDatabase } from './support/fake-db';

/**
 * End-to-end domain flow against an in-memory database:
 * author applies -> admin approves -> product drafted -> reviewed -> approved ->
 * order paid -> ledger + balance + purchase -> download authorised -> refunded.
 *
 * The repository/service code under test is the real code; only the database
 * transport is replaced, so this catches wiring mistakes that unit tests miss.
 */

const requireCjs = createRequire(__filename);
const database = new FakeDatabase();

function inject(id: string, exports: unknown): void {
  const resolved = requireCjs.resolve(id);
  (requireCjs.cache as Record<string, unknown>)[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
    children: [],
    paths: []
  };
}

before(() => {
  Object.assign(process.env, {
    FIREBASE_PROJECT_ID: 'aera-s-store',
    FIREBASE_DATABASE_URL: 'https://aera-s-store-default-rtdb.europe-west1.firebasedatabase.app',
    FIREBASE_API_KEY: 'test',
    FIREBASE_CLIENT_EMAIL: 'svc@example.com',
    FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
    FASTPAY_PUBLIC_KEY: 'sec_test',
    FASTPAY_SECRET_KEY: 'secret',
    FASTPAY_ENVIRONMENT: 'sandbox',
    FASTPAY_BASE_URL: 'https://sandbox.api.getsafepay.com',
    FASTPAY_CHECKOUT_URL: 'https://sandbox.api.getsafepay.com/components',
    APP_ORIGIN: 'https://example.com',
    PLATFORM_COMMISSION_PERCENT: '40',
    B2_ENDPOINT: 'https://s3.eu-central-003.backblazeb2.com',
    B2_REGION: 'eu-central-003',
    B2_BUCKET_NAME: 'AeraStorage',
    B2_KEY_ID: 'key',
    B2_APPLICATION_KEY: 'app'
  });

  inject('firebase-admin/app', {
    initializeApp: () => ({}),
    getApps: () => [{}],
    cert: () => ({})
  });
  inject('firebase-admin/auth', { getAuth: () => ({}) });
  inject('firebase-admin/database', { getDatabase: () => database });
});

describe('marketplace flow', () => {
  it('runs an author, a product and a sale end to end', async () => {
    const categories = requireCjs('../lib/server/database/categories.repo');
    const sellers = requireCjs('../lib/server/database/sellers.repo');
    const products = requireCjs('../lib/server/database/products.repo');
    const reviewRules = requireCjs('../lib/server/products/review');
    const orders = requireCjs('../lib/server/database/orders.repo');
    const payments = requireCjs('../lib/server/database/payments.repo');
    const purchases = requireCjs('../lib/server/database/purchases.repo');
    const ledger = requireCjs('../lib/server/database/ledger.repo');
    const { settlePayment } = requireCjs('../lib/server/payments/service');
    const { presignDownload } = requireCjs('../lib/server/storage/b2');

    // 1. category
    const category = await categories.createCategory({
      name: 'Minecraft Resources',
      slug: 'minecraft',
      description: 'Plugins, maps and configs',
      allowedKinds: ['PLUGIN_EXTENSION'],
      allowedExtensions: ['jar', 'zip', 'png'],
      maxFileMb: 100,
      minPriceMinor: 10000,
      sort: 10,
      active: true
    });
    assert.ok(category.id);

    // 2. author applies, admin approves
    const applied = await sellers.applyAsSeller({
      uid: 'u_author',
      displayName: 'Aera Labs',
      bio: 'We build Paper plugins and ship documentation with every release.',
      country: 'PK',
      commissionPercent: 40
    });
    assert.equal(applied.status, 'PENDING');

    const approvedSeller = await sellers.setSellerStatus('u_author', 'APPROVED');
    assert.equal(approvedSeller.status, 'APPROVED');

    // 3. draft + deliverable
    const draft = await products.createDraft({
      sellerId: 'u_author',
      sellerName: 'Aera Labs',
      title: 'Paper Command Kit',
      summary: 'A small command framework with permissions, config and tab completion.',
      description: 'x'.repeat(320),
      categoryId: category.id,
      kind: 'PLUGIN_EXTENSION',
      license: 'STANDARD',
      tags: ['minecraft', 'paper'],
      priceMinor: 50000,
      previewUrl: 'previews/u_author/p/x.png'
    });

    await products.attachFile(draft.id, {
      id: 'f1',
      key: `products/u_author/${draft.id}/f1-command-kit.jar`,
      name: 'command-kit.jar',
      sizeBytes: 4096,
      contentType: 'application/java-archive',
      uploadedAt: Date.now(),
      verified: true
    });

    // 4. automated checks must pass, then it goes to review
    const withFile = await products.requireProduct(draft.id);
    const checks = reviewRules.runAutomatedChecks(withFile, category);
    assert.equal(reviewRules.blockingFailures(checks).length, 0, JSON.stringify(checks));

    await products.setProductStatus(draft.id, 'PENDING_REVIEW');
    assert.equal((await products.listReviewQueue()).length, 1);

    await products.setProductStatus(draft.id, 'APPROVED', { approvedAt: Date.now() });
    const approved = await products.listApprovedProducts(10);
    assert.equal(approved.length, 1);

    // 5. order + payment + settlement
    const order = await orders.createOrder({
      id: 'ord_1',
      buyerId: 'u_buyer',
      items: [
        {
          productId: draft.id,
          productName: draft.title,
          sellerId: 'u_author',
          unitPriceMinor: 50000,
          quantity: 1
        }
      ],
      subtotalMinor: 50000,
      totalMinor: 50000,
      currency: 'PKR',
      status: 'PENDING_PAYMENT',
      paymentId: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    assert.ok(order.id);

    const now = Date.now();
    await payments.createPayment({
      id: 'pay_1',
      orderId: order.id,
      userId: 'u_buyer',
      productId: draft.id,
      productName: draft.title,
      gateway: 'safepay',
      gatewayEnvironment: 'sandbox',
      gatewayTrackerId: 'track_1',
      gatewayTransactionId: null,
      gatewayReference: null,
      gatewayResponseRef: null,
      checkoutUrl: null,
      paymentMethod: null,
      status: 'PENDING',
      amountMinor: 50000,
      refundedAmountMinor: 0,
      refundStatus: null,
      currency: 'PKR',
      commissionPercent: 40,
      commissionMinor: 20000,
      sellerPayableMinor: 30000,
      failureReason: null,
      idempotencyKey: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      lastStatusAt: now
    });

    const settled = await settlePayment({
      paymentId: 'pay_1',
      source: 'gateway_webhook',
      transactionId: 'txn_1',
      reference: 'ref_1',
      gatewayState: 'TRACKER_COMPLETED'
    });

    assert.equal(settled.settled, true);
    assert.equal(settled.payment.status, 'PAID');

    // 6. money: seller 60% credited, commission 40% recorded
    const balance = await ledger.getSellerBalance('u_author');
    assert.equal(balance?.availableMinor, 30000);

    const entries = await ledger.listLedgerByPayment('pay_1');
    const sellerSale = entries.find((e: { type: string; sellerId: string }) => e.type === 'SALE');
    const commission = entries.find(
      (e: { type: string; sellerId: string }) => e.type === 'COMMISSION' && e.sellerId === 'u_author'
    );
    assert.equal(sellerSale.amountMinor, 50000);
    assert.equal(commission.amountMinor, -20000);

    // 7. delivery: ownership granted, signed URL issued
    const purchase = await purchases.getPurchase('u_buyer', draft.id);
    assert.ok(purchase, 'purchase should be granted on settlement');

    const url = await presignDownload({ key: 'products/u_author/x/f1-command-kit.jar', fileName: 'command-kit.jar' });
    assert.ok(url.includes('X-Amz-Signature='));

    // 8. a full refund removes ownership
    await purchases.revokePurchase('u_buyer', draft.id);
    assert.equal(await purchases.getPurchase('u_buyer', draft.id), null);
  });
});
