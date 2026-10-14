import type { Router } from 'express';
import { clientIp, route, type RouteOptions } from '../../lib/http.ts';
import { RateLimiter } from '../../lib/rateLimit.ts';
import type { TaxService } from './taxService.ts';

/**
 * Vietnam tax endpoints of batch T2 (settings + profile). The reports (taxSummary, taxWithholdings, taxExport and the
 * admin summary/list/CSV) are batch T3. route() enforces auth, staff role + 2FA session + permission.
 */
export function registerTaxRoutes(router: Router, opts: RouteOptions, tax: TaxService, rateLimitScale = 1): void {
  const writeLimit = new RateLimiter(30 * rateLimitScale, 60_000);

  route(router, opts, 'taxProfile', async ({ auth }) => tax.profile(auth.user.id));
  route(router, opts, 'taxUpdateProfile', async ({ auth, body }) => {
    writeLimit.consume(`tax-profile:${auth.user.id}`);
    return tax.updateProfile(auth.user.id, body.category);
  });

  route(router, opts, 'adminTaxSettings', async () => tax.settings());
  route(router, opts, 'adminUpdateTaxSettings', async ({ auth, req, body }) => {
    writeLimit.consume(`admin:${auth.user.id}`);
    return tax.updateSettings({ user: auth.user, ip: clientIp(req) }, body);
  });
}
