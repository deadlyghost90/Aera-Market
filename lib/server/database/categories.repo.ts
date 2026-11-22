import { db } from '../firebase/admin';
import { PATHS, categoryPath } from './paths';
import type { Category } from '../../shared/types';
import type { ProductKind } from '../../shared/enums';
import { notFound } from '../utils/errors';
import { newId } from '../utils/ids';

function toCategory(value: unknown, id: string): Category | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    id,
    name: String(record.name ?? ''),
    slug: String(record.slug ?? id),
    description: String(record.description ?? ''),
    allowedKinds: Array.isArray(record.allowedKinds) ? (record.allowedKinds as ProductKind[]) : [],
    allowedExtensions: Array.isArray(record.allowedExtensions)
      ? (record.allowedExtensions as string[])
      : [],
    maxFileMb: Number(record.maxFileMb ?? 200),
    minPriceMinor: Number(record.minPriceMinor ?? 10000),
    sort: Number(record.sort ?? 100),
    active: record.active !== false
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function getCategory(id: string): Promise<Category | null> {
  const snapshot = await db().ref(categoryPath(id)).get();
  return toCategory(snapshot.val(), id);
}

export async function requireCategory(id: string): Promise<Category> {
  const category = await getCategory(id);
  if (!category) throw notFound('Category not found');
  return category;
}

export async function listCategories(activeOnly = true, limit = 100): Promise<Category[]> {
  const snapshot = await db().ref(PATHS.categories).limitToFirst(limit).get();
  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];

  return Object.entries(value)
    .map(([id, record]) => toCategory(record, id))
    .filter((category): category is Category => category !== null)
    .filter((category) => (activeOnly ? category.active : true))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export async function createCategory(input: Omit<Category, 'id'>): Promise<Category> {
  const id = newId('cat');
  const category: Category = { ...input, id };
  await db()
    .ref()
    .update({
      [categoryPath(id)]: category,
      [`${PATHS.categorySlugs}/${input.slug}`]: id
    });
  return category;
}

export async function updateCategory(
  id: string,
  patch: Partial<Omit<Category, 'id' | 'slug'>>
): Promise<Category> {
  const current = await requireCategory(id);
  const next: Category = { ...current, ...patch };
  await db().ref(categoryPath(id)).set(next);
  return next;
}

export async function deactivateCategory(id: string): Promise<Category> {
  return updateCategory(id, { active: false });
}

/** Default taxonomy seeded once; admins can edit it afterwards. */
export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  {
    name: 'Source Code & Projects',
    slug: 'source-code',
    description: 'Complete applications, starters and GitHub-ready projects.',
    allowedKinds: ['SOURCE_CODE', 'SOFTWARE_APP', 'API_TOOL'],
    allowedExtensions: ['zip', 'rar', '7z', 'js', 'ts', 'py', 'php', 'json', 'md'],
    maxFileMb: 500,
    minPriceMinor: 50000,
    sort: 10,
    active: true
  },
  {
    name: 'Website Templates',
    slug: 'website-templates',
    description: 'HTML, CSS and CMS themes ready to deploy.',
    allowedKinds: ['WEBSITE_TEMPLATE', 'UI_KIT'],
    allowedExtensions: ['zip', 'rar', 'html', 'css', 'scss', 'js', 'json', 'png', 'jpg', 'svg'],
    maxFileMb: 300,
    minPriceMinor: 30000,
    sort: 20,
    active: true
  },
  {
    name: 'Scripts & Automation',
    slug: 'scripts-automation',
    description: 'Bots, scrapers, workflow and DevOps automation.',
    allowedKinds: ['SCRIPT_AUTOMATION', 'SOURCE_CODE'],
    allowedExtensions: ['zip', 'py', 'js', 'ts', 'sh', 'json', 'yml', 'md'],
    maxFileMb: 100,
    minPriceMinor: 20000,
    sort: 30,
    active: true
  },
  {
    name: 'Plugins & Extensions',
    slug: 'plugins-extensions',
    description: 'WordPress, browser and server plugins.',
    allowedKinds: ['PLUGIN_EXTENSION', 'SOURCE_CODE'],
    allowedExtensions: ['zip', 'jar', 'php', 'js', 'json', 'md'],
    maxFileMb: 200,
    minPriceMinor: 20000,
    sort: 40,
    active: true
  },
  {
    name: 'Minecraft Resources',
    slug: 'minecraft',
    description: 'Plugins, maps, builds, datapacks and textures.',
    allowedKinds: ['MINECRAFT_RESOURCE', 'PLUGIN_EXTENSION', 'GAME_ASSET'],
    allowedExtensions: ['zip', 'jar', 'mcpack', 'mcaddon', 'schem', 'schematic', 'png', 'yml'],
    maxFileMb: 500,
    minPriceMinor: 10000,
    sort: 50,
    active: true
  },
  {
    name: 'Game Development Assets',
    slug: 'game-assets',
    description: '3D models, rigs, animations, environments and SFX.',
    allowedKinds: ['GAME_ASSET', 'GRAPHICS'],
    allowedExtensions: ['zip', 'fbx', 'obj', 'gltf', 'glb', 'blend', 'unitypackage', 'png', 'wav', 'mp3'],
    maxFileMb: 1000,
    minPriceMinor: 15000,
    sort: 60,
    active: true
  },
  {
    name: 'UI Kits & Graphics',
    slug: 'ui-kits-graphics',
    description: 'Design systems, icon packs, illustrations and mockups.',
    allowedKinds: ['UI_KIT', 'GRAPHICS'],
    allowedExtensions: ['zip', 'fig', 'sketch', 'xd', 'psd', 'ai', 'svg', 'png', 'jpg', 'webp'],
    maxFileMb: 300,
    minPriceMinor: 10000,
    sort: 70,
    active: true
  },
  {
    name: 'APIs & Developer Tools',
    slug: 'apis-tools',
    description: 'API access, SDKs and developer utilities.',
    allowedKinds: ['API_TOOL', 'SOURCE_CODE'],
    allowedExtensions: ['zip', 'json', 'yaml', 'yml', 'js', 'ts', 'py', 'md'],
    maxFileMb: 100,
    minPriceMinor: 10000,
    sort: 80,
    active: true
  }
];
