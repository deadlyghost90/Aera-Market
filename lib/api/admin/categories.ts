import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../server/utils/http';
import { env } from '../../server/config/env';
import { requireAdmin } from '../../server/firebase/guards';
import {
  createCategory,
  listCategories,
  requireCategory,
  updateCategory
} from '../../server/database/categories.repo';
import { writeAudit } from '../../server/security/audit';
import { parse, idSchema } from '../../server/security/validate';
import { PRODUCT_KIND } from '../../shared/enums';

const baseSchema = z.object({
  name: z.string().trim().min(3).max(60),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().trim().min(20).max(300),
  allowedKinds: z.array(z.enum(PRODUCT_KIND)).min(1),
  allowedExtensions: z.array(z.string().trim().min(1).max(10)).min(1),
  maxFileMb: z.number().int().min(1).max(2000),
  minPriceMinor: z.number().int().min(0),
  sort: z.number().int().min(0).max(9999).default(100),
  active: z.boolean().default(true)
});

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAdmin(req);

  if (req.method === 'GET') {
    sendJson(res, 200, { data: await listCategories(false, 200) });
    return;
  }

  const config = env();
  assertSameOrigin(req, config.APP_ORIGIN);

  if (req.method === 'POST') {
    const body = parse(baseSchema, req.body);
    const category = await createCategory({
      ...body,
      sort: body.sort ?? 100,
      active: body.active ?? true
    });
    await writeAudit({
      actorUid: auth.uid,
      action: 'category.created',
      targetType: 'category',
      targetId: category.id,
      meta: { slug: category.slug }
    });
    sendJson(res, 201, { data: category });
    return;
  }

  if (req.method === 'PATCH') {
    const body = parse(baseSchema.partial().extend({ id: idSchema }), req.body);
    await requireCategory(body.id);

    // Only send the fields the caller actually provided: zod defaults would
    // otherwise reset `sort`/`active` on every partial update.
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const allowed = [
      'name',
      'slug',
      'description',
      'allowedKinds',
      'allowedExtensions',
      'maxFileMb',
      'minPriceMinor',
      'sort',
      'active'
    ] as const;

    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (raw[key] !== undefined) patch[key] = body[key];
    }

    const category = await updateCategory(body.id, patch);
    await writeAudit({
      actorUid: auth.uid,
      action: 'category.updated',
      targetType: 'category',
      targetId: body.id,
      meta: { active: category.active, fields: Object.keys(patch).join(',') }
    });
    sendJson(res, 200, { data: category });
    return;
  }

  res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
});
