import type { Router } from 'express';
import { route, type RouteOptions } from '../../lib/http.ts';
import type { AdminMetricsService } from './metricsService.ts';
import type { AdminRiskService } from './riskService.ts';

/**
 * Back office risk and numbers (module AD, batch AD2) - read-only, exchange-wide. route() enforces the staff role, the 2FA
 * session and the permission (`users.read` for positions / liquidations because they name users, `exchange.read` otherwise).
 */
export function registerAdminRiskRoutes(router: Router, opts: RouteOptions, risk: AdminRiskService, metrics: AdminMetricsService): void {
  route(router, opts, 'adminRiskPositions', async ({ query }) => risk.positions(query));
  route(router, opts, 'adminLiquidations', async ({ query }) => risk.liquidations(query));
  route(router, opts, 'adminFundingSummary', async ({ query }) => risk.fundingSummary(query));
  route(router, opts, 'adminMetrics', async ({ query }) => metrics.metrics(query));
}
