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

/**
 * Selling requires an *approved seller profile*, not just the SELLER role.
 * Any buyer may apply; only an admin unlocks publishing.
 */
export async function requireApprovedSeller(req: VercelRequest): Promise<AuthContext> {
  const context = await requireUser(req);
  const { getSeller } = await import('../database/sellers.repo');
  const seller = await getSeller(context.uid);

  if (!seller) {
    throw forbidden('Apply as an author before publishing products');
  }
  if (seller.status !== 'APPROVED') {
    throw forbidden('Your author account is awaiting approval');
  }
  return context;
}
