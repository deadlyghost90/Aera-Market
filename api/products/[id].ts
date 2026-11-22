import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../lib/server/utils/http';
import { requireUser } from '../../lib/server/firebase/guards';
import { getProduct } from '../../lib/server/database/products.repo';
import { forbidden, notFound } from '../../lib/server/utils/errors';

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) {
    sendJson(res, 400, { error: { code: 'BAD_REQUEST', message: 'Product id is required' } });
    return;
  }

  const product = await getProduct(id);
  if (!product) throw notFound('Product not found');

  if (product.status === 'APPROVED') {
    // Public projection: storage keys never leave the server.
    sendJson(
      res,
      200,
      {
        data: {
          id: product.id,
          title: product.title,
          summary: product.summary,
          description: product.description,
          kind: product.kind,
          license: product.license,
          priceMinor: product.priceMinor,
          currency: product.currency,
          tags: product.tags,
          rating: product.rating,
          salesCount: product.salesCount,
          sellerId: product.sellerId,
          sellerName: product.sellerName,
          categoryId: product.categoryId,
          previewUrl: product.previewUrl ? `/api/previews/${product.id}` : null,
          demoUrl: product.demoUrl,
          documentationUrl: product.documentationUrl,
          files: product.files.map((file) => ({ name: file.name, sizeBytes: file.sizeBytes }))
        }
      },
      'public, s-maxage=120, stale-while-revalidate=600'
    );
    return;
  }

  // Non-public products are visible to their owner and to admins only.
  let viewer: { uid: string; role: string };
  try {
    const auth = await requireUser(req);
    viewer = { uid: auth.uid, role: auth.user.role };
  } catch {
    throw notFound('Product not found');
  }

  if (product.sellerId !== viewer.uid && viewer.role !== 'ADMIN') {
    throw forbidden('This product is not public');
  }

  if (req.method === 'PATCH') {
    const { updateProduct } = await import('../../lib/server/database/products.repo');
    const { requireCategory } = await import('../../lib/server/database/categories.repo');
    const { z } = await import('zod');
    const { parse } = await import('../../lib/server/security/validate');
    const { assertSameOrigin } = await import('../../lib/server/utils/http');
    const { env } = await import('../../lib/server/config/env');
    const { AppError } = await import('../../lib/server/utils/errors');
    const { LICENSE_TYPE, PRODUCT_KIND } = await import('../../lib/shared/enums');

    assertSameOrigin(req, env().APP_ORIGIN);

    if (product.status !== 'DRAFT' && product.status !== 'CHANGES_REQUESTED') {
      throw new AppError('CONFLICT', `A ${product.status} product cannot be edited`);
    }

    const schema = z.object({
      title: z.string().trim().min(8).max(120).optional(),
      summary: z.string().trim().min(40).max(200).optional(),
      description: z.string().trim().min(50).max(8000).optional(),
      categoryId: z.string().trim().max(80).optional(),
      kind: z.enum(PRODUCT_KIND).optional(),
      license: z.enum(LICENSE_TYPE).optional(),
      priceMinor: z.number().int().min(0).max(100_000_000).optional(),
      tags: z.array(z.string().trim().min(2).max(24)).max(10).optional(),
      demoUrl: z.string().trim().url().max(400).nullish(),
      documentationUrl: z.string().trim().url().max(400).nullish()
    });

    const body = parse(schema, req.body);

    if (body.categoryId && body.categoryId !== product.categoryId) {
      const category = await requireCategory(body.categoryId);
      const kind = body.kind ?? product.kind;
      const price = body.priceMinor ?? product.priceMinor;
      if (!category.allowedKinds.includes(kind)) {
        throw new AppError('BAD_REQUEST', `${category.name} does not accept ${kind}`);
      }
      if (price < category.minPriceMinor) {
        throw new AppError('BAD_REQUEST', 'Price is below the category minimum');
      }
    }

    const updated = await updateProduct(product.id, {
      ...(body.title ? { title: body.title } : {}),
      ...(body.summary ? { summary: body.summary } : {}),
      ...(body.description ? { description: body.description } : {}),
      ...(body.categoryId ? { categoryId: body.categoryId } : {}),
      ...(body.kind ? { kind: body.kind } : {}),
      ...(body.license ? { license: body.license } : {}),
      ...(body.priceMinor !== undefined ? { priceMinor: body.priceMinor } : {}),
      ...(body.tags ? { tags: body.tags } : {}),
      ...(body.demoUrl !== undefined ? { demoUrl: body.demoUrl } : {}),
      ...(body.documentationUrl !== undefined ? { documentationUrl: body.documentationUrl } : {})
    });

    sendJson(res, 200, { data: updated });
    return;
  }

  sendJson(res, 200, { data: product });
});
