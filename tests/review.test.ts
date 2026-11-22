import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  plausibleKinds,
  hasOnlyArchives,
  runAutomatedChecks,
  blockingFailures,
  canTransition
} from '../lib/server/products/review';
import type { Category, Product } from '../lib/shared/types';

const category: Category = {
  id: 'cat_mc',
  name: 'Minecraft Resources',
  slug: 'minecraft',
  description: 'test',
  allowedKinds: ['MINECRAFT_RESOURCE', 'PLUGIN_EXTENSION'],
  allowedExtensions: ['zip', 'jar', 'png'],
  maxFileMb: 100,
  minPriceMinor: 10000,
  sort: 1,
  active: true
};

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sellerId: 'u1',
    sellerName: 'Author',
    title: 'Paper plugin starter',
    slug: 'paper-plugin-starter',
    summary: 'A starter plugin with commands, config and documentation for Paper servers.',
    description: 'x'.repeat(320),
    categoryId: category.id,
    kind: 'PLUGIN_EXTENSION',
    license: 'STANDARD',
    tags: ['minecraft'],
    priceMinor: 50000,
    currency: 'PKR',
    status: 'DRAFT',
    files: [
      { id: 'f1', key: 'products/u1/p1/f1-plugin.jar', name: 'plugin.jar', sizeBytes: 1024, contentType: 'application/java-archive', uploadedAt: 0, verified: true }
    ],
    previewUrl: 'previews/u1/p1/f.png',
    demoUrl: null,
    documentationUrl: null,
    review: null,
    rejectionNote: null,
    salesCount: 0,
    rating: 0,
    createdAt: 0,
    updatedAt: 0,
    approvedAt: null,
    ...overrides
  };
}

describe('product review engine', () => {
  it('accepts a product whose files match the claim', () => {
    const checks = runAutomatedChecks(product(), category);
    assert.equal(blockingFailures(checks).length, 0);
  });

  it('rejects a claim that the delivered files cannot support', () => {
    const photoshopOnly = product({
      kind: 'MINECRAFT_RESOURCE',
      files: [
        { id: 'f1', key: 'k', name: 'design.psd', sizeBytes: 1024, contentType: 'image/vnd.adobe.photoshop', uploadedAt: 0, verified: true }
      ]
    });
    const checks = runAutomatedChecks(photoshopOnly, category);
    const blocking = blockingFailures(checks).map((check) => check.id);
    assert.ok(blocking.includes('FILE_TYPES_ALLOWED'));
  });

  it('blocks a product with no deliverable', () => {
    const checks = runAutomatedChecks(product({ files: [] }), category);
    assert.ok(blockingFailures(checks).some((check) => check.id === 'FILES_PRESENT'));
  });

  it('blocks a product with no preview', () => {
    const checks = runAutomatedChecks(product({ previewUrl: null }), category);
    assert.ok(blockingFailures(checks).some((check) => check.id === 'PREVIEW_PRESENT'));
  });

  it('flags archive-only deliveries as a warning, not a block', () => {
    const archive = product({
      files: [
        { id: 'f1', key: 'k', name: 'pack.zip', sizeBytes: 1024, contentType: 'application/zip', uploadedAt: 0, verified: true }
      ]
    });
    const checks = runAutomatedChecks(archive, category);
    assert.equal(blockingFailures(checks).length, 0);
    assert.equal(checks.find((check) => check.id === 'ARCHIVE_ONLY')?.passed, false);
  });

  it('can read the product kind from file extensions', () => {
    assert.ok(plausibleKinds(['plugin.jar']).has('PLUGIN_EXTENSION'));
    assert.ok(hasOnlyArchives(['a.zip', 'b.rar']));
  });

  it('enforces the review lifecycle', () => {
    assert.equal(canTransition('DRAFT', 'PENDING_REVIEW'), true);
    assert.equal(canTransition('PENDING_REVIEW', 'APPROVED'), true);
    assert.equal(canTransition('DRAFT', 'APPROVED'), false);
    assert.equal(canTransition('REJECTED', 'APPROVED'), false);
  });
});
