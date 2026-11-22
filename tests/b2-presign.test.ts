import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Proves the upload contract without touching the network: the presigned URL is
 * signed locally, so we can assert that the size and content type are part of
 * the signed headers. That is what stops a browser from uploading something
 * bigger or different from what the API approved.
 */

before(() => {
  process.env.FIREBASE_PROJECT_ID = 'aera-s-store';
  process.env.FIREBASE_DATABASE_URL = 'https://aera-s-store-default-rtdb.europe-west1.firebasedatabase.app';
  process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
  process.env.FIREBASE_PRIVATE_KEY = 'test';
  process.env.FIREBASE_API_KEY = 'test';
  process.env.FASTPAY_PUBLIC_KEY = 'sec_test';
  process.env.FASTPAY_SECRET_KEY = 'secret_test';
  process.env.FASTPAY_ENVIRONMENT = 'sandbox';
  process.env.FASTPAY_BASE_URL = 'https://sandbox.api.getsafepay.com';
  process.env.FASTPAY_CHECKOUT_URL = 'https://sandbox.api.getsafepay.com/components';
  process.env.APP_ORIGIN = 'https://example.com';
  process.env.B2_ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com';
  process.env.B2_REGION = 'eu-central-003';
  process.env.B2_BUCKET_NAME = 'AeraStorage';
  process.env.B2_KEY_ID = 'key-id';
  process.env.B2_APPLICATION_KEY = 'application-key';
});

describe('B2 presigned uploads', () => {
  it('binds size and content type into the signed URL', async () => {
    const { presignUpload } = await import('../lib/server/storage/b2');

    const url = await presignUpload({
      key: 'products/u1/p1/file1-plugin.jar',
      contentType: 'application/java-archive',
      sizeBytes: 4096,
      expiresInSeconds: 600
    });

    const parsed = new URL(url);
    assert.equal(parsed.host, 's3.eu-central-003.backblazeb2.com');
    assert.ok(parsed.pathname.includes('/AeraStorage/products/u1/p1/file1-plugin.jar'));
    assert.ok(parsed.searchParams.get('X-Amz-Signature'), 'signature missing');
    assert.equal(parsed.searchParams.get('X-Amz-Expires'), '600');

    const signedHeaders = decodeURIComponent(parsed.searchParams.get('X-Amz-SignedHeaders') ?? '');
    assert.ok(signedHeaders.includes('content-length'), `content-length not signed: ${signedHeaders}`);
    assert.ok(signedHeaders.includes('content-type'), `content-type not signed: ${signedHeaders}`);
  });

  it('keeps delivery keys scoped to the author', async () => {
    const { keyBelongsToSeller, safeFileName } = await import('../lib/server/storage/keys');

    assert.equal(keyBelongsToSeller('products/u1/p1/a.zip', 'u1'), true);
    assert.equal(keyBelongsToSeller('products/u2/p1/a.zip', 'u1'), false);
    // Path traversal is stripped completely: only the final component survives.
    assert.equal(safeFileName('../../etc/passwd'), 'passwd');
    assert.equal(safeFileName('..\\..\\windows\\system32\\cmd.exe'), 'cmd.exe');
    assert.equal(safeFileName('my plugin.jar'), 'my-plugin.jar');
  });
});
