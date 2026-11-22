import type { Category, Product, ReviewCheck } from '../../shared/types';
import type { ProductKind, ProductStatus, ReviewDecision } from '../../shared/enums';
import { AppError } from '../utils/errors';

/**
 * Envato-style submission gate.
 *
 * The platform cannot open every archive on upload, but it *can* refuse the
 * obvious mismatches: a "Minecraft plugin" that ships only Photoshop files, a
 * template with no preview, a product with no deliverable at all. Everything
 * that cannot be proven automatically is marked as a warning and handed to a
 * human reviewer, who must decide before the product becomes public.
 */

const EXTENSION_KINDS: Record<string, ProductKind[]> = {
  js: ['SOURCE_CODE', 'PLUGIN_EXTENSION', 'SCRIPT_AUTOMATION', 'API_TOOL', 'WEBSITE_TEMPLATE'],
  mjs: ['SOURCE_CODE', 'API_TOOL', 'SCRIPT_AUTOMATION'],
  ts: ['SOURCE_CODE', 'API_TOOL', 'PLUGIN_EXTENSION'],
  jsx: ['SOURCE_CODE', 'WEBSITE_TEMPLATE', 'UI_KIT'],
  tsx: ['SOURCE_CODE', 'WEBSITE_TEMPLATE', 'UI_KIT'],
  php: ['SOURCE_CODE', 'PLUGIN_EXTENSION', 'WEBSITE_TEMPLATE'],
  py: ['SOURCE_CODE', 'SCRIPT_AUTOMATION', 'API_TOOL'],
  rb: ['SCRIPT_AUTOMATION', 'API_TOOL'],
  java: ['SOURCE_CODE', 'PLUGIN_EXTENSION'],
  cs: ['SOURCE_CODE', 'SOFTWARE_APP', 'GAME_ASSET'],
  go: ['SOURCE_CODE', 'API_TOOL'],
  html: ['WEBSITE_TEMPLATE', 'UI_KIT'],
  css: ['WEBSITE_TEMPLATE', 'UI_KIT'],
  scss: ['WEBSITE_TEMPLATE', 'UI_KIT'],
  json: ['API_TOOL', 'SOURCE_CODE', 'PLUGIN_EXTENSION'],
  yml: ['API_TOOL', 'SOURCE_CODE'],
  yaml: ['API_TOOL', 'SOURCE_CODE'],
  jar: ['PLUGIN_EXTENSION', 'MINECRAFT_RESOURCE'],
  mcpack: ['MINECRAFT_RESOURCE'],
  mcaddon: ['MINECRAFT_RESOURCE'],
  schematic: ['MINECRAFT_RESOURCE'],
  schem: ['MINECRAFT_RESOURCE'],
  unitypackage: ['GAME_ASSET'],
  blend: ['GAME_ASSET'],
  fbx: ['GAME_ASSET'],
  obj: ['GAME_ASSET'],
  gltf: ['GAME_ASSET'],
  glb: ['GAME_ASSET'],
  psd: ['GRAPHICS', 'UI_KIT'],
  ai: ['GRAPHICS', 'UI_KIT'],
  sketch: ['UI_KIT', 'GRAPHICS'],
  fig: ['UI_KIT', 'GRAPHICS'],
  xd: ['UI_KIT', 'GRAPHICS'],
  svg: ['GRAPHICS', 'UI_KIT'],
  png: ['GRAPHICS', 'UI_KIT', 'GAME_ASSET'],
  jpg: ['GRAPHICS', 'UI_KIT', 'GAME_ASSET'],
  webp: ['GRAPHICS', 'UI_KIT'],
  exe: ['SOFTWARE_APP'],
  dmg: ['SOFTWARE_APP'],
  appimage: ['SOFTWARE_APP']
};

/** Archives carry no signal about content, so they never prove a claim. */
const NEUTRAL_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz']);

export function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  if (index === -1 || index === fileName.length - 1) return '';
  return fileName.slice(index + 1).toLowerCase();
}

/** Product kinds that the delivered file types can plausibly support. */
export function plausibleKinds(fileNames: string[]): Set<ProductKind> {
  const kinds = new Set<ProductKind>();
  for (const name of fileNames) {
    const extension = extensionOf(name);
    if (!extension || NEUTRAL_EXTENSIONS.has(extension)) continue;
    for (const kind of EXTENSION_KINDS[extension] ?? []) kinds.add(kind);
  }
  return kinds;
}

export function hasOnlyArchives(fileNames: string[]): boolean {
  if (fileNames.length === 0) return false;
  return fileNames.every((name) => NEUTRAL_EXTENSIONS.has(extensionOf(name)));
}

export interface CheckOptions {
  /** Another approved/queued product already uses this title. */
  duplicateTitle?: boolean;
}

export function runAutomatedChecks(
  product: Product,
  category: Category,
  options: CheckOptions = {}
): ReviewCheck[] {
  const checks: ReviewCheck[] = [];
  const fileNames = product.files.map((file) => file.name.toLowerCase());

  checks.push({
    id: 'FILES_PRESENT',
    label: 'Deliverable files attached',
    blocking: true,
    passed: product.files.length > 0 && product.files.every((file) => file.verified),
    detail:
      product.files.length === 0
        ? 'No files were uploaded with this product.'
        : `${product.files.length} file(s) attached and verified.`
  });

  checks.push({
    id: 'KIND_MATCHES_CATEGORY',
    label: 'Product type allowed in this category',
    blocking: true,
    passed: category.allowedKinds.includes(product.kind),
    detail: category.allowedKinds.includes(product.kind)
      ? `${product.kind} is accepted in ${category.name}.`
      : `${category.name} does not accept ${product.kind}.`
  });

  const allowedExtensions = new Set(category.allowedExtensions.map((value) => value.toLowerCase()));
  const disallowed = fileNames.filter((name) => {
    const extension = extensionOf(name);
    return extension.length > 0 && !allowedExtensions.has(extension);
  });

  checks.push({
    id: 'FILE_TYPES_ALLOWED',
    label: 'File types allowed for this category',
    blocking: true,
    passed: disallowed.length === 0,
    detail:
      disallowed.length === 0
        ? 'All delivered file types are accepted.'
        : `Not accepted here: ${disallowed.join(', ')}`
  });

  const plausible = plausibleKinds(fileNames);
  const claimsProven = plausible.size === 0 ? hasOnlyArchives(fileNames) : plausible.has(product.kind);

  checks.push({
    id: 'FILES_MATCH_CLAIM',
    label: 'Delivered files match the claimed product type',
    blocking: true,
    passed: claimsProven,
    detail: claimsProven
      ? plausible.size === 0
        ? 'Archive only - a reviewer will confirm the contents.'
        : `File types support a ${product.kind} product.`
      : `You listed this as ${product.kind}, but the files look like ${[...plausible].join(' / ')}.`
  });

  const tooLarge = product.files.filter((file) => file.sizeBytes > category.maxFileMb * 1024 * 1024);
  checks.push({
    id: 'FILE_SIZE',
    label: `Files within ${category.maxFileMb} MB`,
    blocking: true,
    passed: tooLarge.length === 0 && product.files.length <= 20,
    detail:
      tooLarge.length > 0
        ? `Too large: ${tooLarge.map((file) => file.name).join(', ')}`
        : `${product.files.length} file(s) within the limit.`
  });

  checks.push({
    id: 'PREVIEW_PRESENT',
    label: 'Preview image provided',
    blocking: true,
    passed: Boolean(product.previewUrl && product.previewUrl.length > 0),
    detail: product.previewUrl ? 'Preview attached.' : 'Buyers need a preview image.'
  });

  checks.push({
    id: 'PRICE_RANGE',
    label: 'Price within category range',
    blocking: true,
    passed: product.priceMinor >= category.minPriceMinor && product.priceMinor <= 50_000_000,
    detail: `Price ${product.priceMinor} minor units, minimum ${category.minPriceMinor}.`
  });

  checks.push({
    id: 'SUMMARY_QUALITY',
    label: 'Summary is descriptive',
    blocking: true,
    passed: product.summary.length >= 40 && product.summary.length <= 200,
    detail: `Summary is ${product.summary.length} characters (40-200 required).`
  });

  checks.push({
    id: 'DESCRIPTION_DEPTH',
    label: 'Description explains what is included',
    blocking: false,
    passed: product.description.length >= 300,
    detail: `Description is ${product.description.length} characters (300+ recommended).`
  });

  checks.push({
    id: 'TAGS',
    label: 'Between 1 and 10 tags',
    blocking: false,
    passed: product.tags.length >= 1 && product.tags.length <= 10,
    detail: `${product.tags.length} tag(s).`
  });

  checks.push({
    id: 'DOCUMENTATION',
    label: 'Installation or documentation provided',
    blocking: false,
    passed:
      Boolean(product.documentationUrl) ||
      /install|setup|documentation|readme|how to/i.test(product.description),
    detail: product.documentationUrl
      ? 'Documentation link provided.'
      : 'Mention installation steps or add a documentation link.'
  });

  checks.push({
    id: 'ARCHIVE_ONLY',
    label: 'Contents can be inspected automatically',
    blocking: false,
    passed: !hasOnlyArchives(fileNames),
    detail: hasOnlyArchives(fileNames)
      ? 'Only archives were uploaded, so a reviewer must open and inspect them.'
      : 'At least one file type could be inspected.'
  });

  checks.push({
    id: 'DUPLICATE_TITLE',
    label: 'Title is not already in the catalogue',
    blocking: true,
    passed: !options.duplicateTitle,
    detail: options.duplicateTitle
      ? 'An approved or queued product already uses this title.'
      : 'Title is unique.'
  });

  return checks;
}

export function blockingFailures(checks: ReviewCheck[]): ReviewCheck[] {
  return checks.filter((check) => check.blocking && !check.passed);
}

export function automatedPassed(checks: ReviewCheck[]): boolean {
  return blockingFailures(checks).length === 0;
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                          */
/* ------------------------------------------------------------------ */

const ALLOWED: Record<ProductStatus, readonly ProductStatus[]> = {
  DRAFT: ['PENDING_REVIEW'],
  PENDING_REVIEW: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'],
  CHANGES_REQUESTED: ['PENDING_REVIEW'],
  APPROVED: ['SUSPENDED'],
  REJECTED: ['DRAFT'],
  SUSPENDED: ['APPROVED', 'REJECTED']
};

export function canTransition(from: ProductStatus, to: ProductStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: ProductStatus, to: ProductStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError('INVALID_TRANSITION', `A product cannot move from ${from} to ${to}`);
  }
}

export function statusForDecision(decision: ReviewDecision): ProductStatus {
  if (decision === 'APPROVE') return 'APPROVED';
  if (decision === 'REJECT') return 'REJECTED';
  return 'CHANGES_REQUESTED';
}
