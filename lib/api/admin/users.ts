import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../server/utils/http';
import { env } from '../../server/config/env';
import { requireAdmin } from '../../server/firebase/guards';
import { listUsers, updateUser } from '../../server/database/users.repo';
import { parse, idSchema } from '../../server/security/validate';
import { writeAudit } from '../../server/security/audit';
import { AppError } from '../../server/utils/errors';
import { ROLES, USER_STATUS } from '../../shared/enums';

const patchSchema = z.object({
  uid: idSchema,
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUS).optional()
});

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAdmin(req);

  if (req.method === 'GET') {
    const users = await listUsers(200);
    sendJson(res, 200, { data: users });
    return;
  }

  if (req.method !== 'PATCH') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);
  const body = parse(patchSchema, req.body);

  if (body.uid === auth.uid && body.role && body.role !== 'ADMIN') {
    throw new AppError('FORBIDDEN', 'You cannot remove your own administrator role');
  }

  const updated = await updateUser(body.uid, {
    ...(body.role ? { role: body.role } : {}),
    ...(body.status ? { status: body.status } : {})
  });

  await writeAudit({
    actorUid: auth.uid,
    action: 'user.updated',
    targetType: 'user',
    targetId: body.uid,
    meta: { role: body.role ?? null, status: body.status ?? null }
  });

  sendJson(res, 200, { data: updated });
});
