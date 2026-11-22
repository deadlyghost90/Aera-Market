import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../lib/server/utils/http';
import { listCategories } from '../../lib/server/database/categories.repo';

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const includeInactive = req.query.all === '1';
  const categories = await listCategories(!includeInactive);

  sendJson(
    res,
    200,
    {
      data: categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        allowedKinds: category.allowedKinds,
        maxFileMb: category.maxFileMb,
        minPriceMinor: category.minPriceMinor
      }))
    },
    'public, s-maxage=300, stale-while-revalidate=600'
  );
});
