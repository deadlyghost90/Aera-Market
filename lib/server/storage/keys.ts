/** Deterministic, injection-safe object keys for the private bucket. */

const UNSAFE = /[^A-Za-z0-9._-]/g;

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base.replace(UNSAFE, '-').replace(/-{2,}/g, '-').replace(/^[-.]+/, '');
  const trimmed = cleaned.slice(0, 120);
  return trimmed.length > 0 ? trimmed : 'file.bin';
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1).toLowerCase();
}

/** products/{sellerId}/{productId}/{fileId}-{name} */
export function productFileKey(
  sellerId: string,
  productId: string,
  fileId: string,
  fileName: string
): string {
  return `products/${sellerId}/${productId}/${fileId}-${safeFileName(fileName)}`;
}

/** previews/{sellerId}/{productId}/{fileId}.{ext} */
export function previewKey(sellerId: string, productId: string, fileId: string, fileName: string): string {
  const extension = extensionOf(fileName) || 'png';
  return `previews/${sellerId}/${productId}/${fileId}.${extension}`;
}

/** Only the owner of the prefix may touch it. */
export function keyBelongsToSeller(key: string, sellerId: string): boolean {
  return key.startsWith(`products/${sellerId}/`) || key.startsWith(`previews/${sellerId}/`);
}
