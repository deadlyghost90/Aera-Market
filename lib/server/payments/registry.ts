import { safepay } from './safepay';
import type { PaymentGateway } from './types';
import type { GatewayId } from '../../shared/enums';
import { AppError } from '../utils/errors';

const REGISTRY: Partial<Record<GatewayId, PaymentGateway>> = {
  safepay
};

export function getGateway(id: GatewayId = 'safepay'): PaymentGateway {
  const gateway = REGISTRY[id];
  if (!gateway) {
    throw new AppError('BAD_REQUEST', `Payment gateway "${id}" is not available`);
  }
  return gateway;
}

/** Used by the checkout page to render active vs "coming soon" options. */
export function gatewayCatalogue(): Array<{
  id: string;
  label: string;
  status: 'ACTIVE' | 'COMING_SOON';
}> {
  return [
    { id: 'safepay', label: 'Safepay (Card / Wallet)', status: 'ACTIVE' },
    { id: 'jazzcash', label: 'JazzCash', status: 'COMING_SOON' },
    { id: 'easypaisa', label: 'Easypaisa', status: 'COMING_SOON' },
    { id: 'stripe', label: 'Stripe', status: 'COMING_SOON' }
  ];
}
