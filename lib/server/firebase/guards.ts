import type { VercelRequest } from '@vercel/node';
import { getAuthContext, type AuthContext } from './session';
import { forbidden } from '../utils/errors';
import type { Role } from '../../shared/enums';

/**
 * Role checks always read the database record, never a client-supplied value.
 */
export async function requireUser(req: VercelRequest): Promise<AuthContext> {
  return getAuthContext(req);
}

export async function requireRole(
  req: VercelRequest,
  roles: readonly Role[]
): Promise<AuthContext> {
  const context = await getAuthContext(req);
  if (!roles.includes(context.user.role)) {
    throw forbidden('Your role does not permit this action');
  }
  return context;
}

export async function requireAdmin(req: VercelRequest): Promise<AuthContext> {
  return requireRole(req, ['ADMIN']);
}

export async function requireSeller(req: VercelRequest): Promise<AuthContext> {
  return requireRole(req, ['SELLER', 'ADMIN']);
}
