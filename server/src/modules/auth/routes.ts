import type { Response, Router } from 'express';
import type { Config } from '../../config.ts';
import { clientIp, route, SESSION_COOKIE, type RouteOptions } from '../../lib/http.ts';
import { RateLimiter } from '../../lib/rateLimit.ts';
import { AppError } from '../../lib/errors.ts';
import { verifyCaptcha } from './captcha.ts';
import { toMe, type AuthService } from './authService.ts';

export function registerAuthRoutes(router: Router, opts: RouteOptions, auth: AuthService, config: Config): void {
  const k = config.RATE_LIMIT_SCALE;
  const registerLimit = new RateLimiter(5 * k, 3600_000);
  const loginLimit = new RateLimiter(20 * k, 15 * 60_000);
  const emailLimit = new RateLimiter(5 * k, 3600_000);

  const setCookie = (res: Response, token: string) =>
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: config.SESSION_TTL_DAYS * 86_400_000,
    });

  const client = (req: Parameters<typeof clientIp>[0]) => ({ ip: clientIp(req), userAgent: req.headers['user-agent'] });

  route(router, opts, 'register', async ({ body, req, res }) => {
    registerLimit.consume(`ip:${clientIp(req)}`);
    await verifyCaptcha(config.TURNSTILE_SECRET, body.captchaToken, clientIp(req));
    const { user, token } = await auth.register(body, client(req));
    setCookie(res, token);
    return { user: toMe(user) };
  });

  route(router, opts, 'login', async ({ body, req, res }) => {
    loginLimit.consume(`ip:${clientIp(req)}`);
    const r = await auth.login(body, client(req));
    if (r.kind === 'challenge') return { twoFactorRequired: true as const, challengeToken: r.challengeToken, expiresAt: r.expiresAt.toISOString() };
    setCookie(res, r.token);
    return { user: toMe(r.user) };
  });

  route(router, opts, 'loginTwoFactor', async ({ body, req, res }) => {
    loginLimit.consume(`ip:${clientIp(req)}`);
    const { user, token } = await auth.loginTwoFactor(body.challengeToken, body.code, client(req));
    setCookie(res, token);
    return { user: toMe(user) };
  });

  route(router, opts, 'setupTwoFactor', async ({ auth: ctx, body }) => auth.setupTwoFactor(ctx, body.currentPassword));
  route(router, opts, 'enableTwoFactor', async ({ auth: ctx, body, req }) => ({ recoveryCodes: await auth.enableTwoFactor(ctx, body.code, clientIp(req)) }));
  route(router, opts, 'disableTwoFactor', async ({ auth: ctx, body, req }) => {
    await auth.disableTwoFactor(ctx, body.currentPassword, body.code, clientIp(req));
    return { ok: true as const };
  });
  route(router, opts, 'regenerateRecoveryCodes', async ({ auth: ctx, body }) => ({ recoveryCodes: await auth.regenerateRecoveryCodes(ctx, body.code) }));

  route(router, opts, 'logout', async ({ auth: ctx, res }) => {
    await auth.logout(ctx.session.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true as const };
  });

  route(router, opts, 'verifyEmail', async ({ body }) => {
    await auth.verifyEmail(body.token);
    return { ok: true as const };
  });

  route(router, opts, 'resendVerification', async ({ auth: ctx }) => {
    emailLimit.consume(`user:${ctx.user.id}`);
    await auth.sendVerification(ctx.user);
    return { ok: true as const };
  });

  route(router, opts, 'forgotPassword', async ({ body, req }) => {
    emailLimit.consume(`ip:${clientIp(req)}`);
    await auth.forgotPassword(body.email);
    return { ok: true as const };
  });

  route(router, opts, 'resetPassword', async ({ body }) => {
    await auth.resetPassword(body.token, body.newPassword);
    return { ok: true as const };
  });

  route(router, opts, 'changePassword', async ({ auth: ctx, body }) => {
    await auth.changePassword(ctx, body.currentPassword, body.newPassword);
    return { ok: true as const };
  });

  route(router, opts, 'listSessions', async ({ auth: ctx }) => ({ items: await auth.listSessions(ctx) }));

  route(router, opts, 'revokeSession', async ({ auth: ctx, params }) => {
    await auth.revokeSession(ctx, params.sessionId);
    return { ok: true as const };
  });

  route(router, opts, 'me', async ({ auth: ctx }) => toMe(ctx.user));
  route(router, opts, 'updateProfile', async ({ auth: ctx, body }) => toMe(await auth.updateProfile(ctx, body)));
  route(router, opts, 'securityOverview', async ({ auth: ctx }) => auth.security.overview(ctx.user));
  route(router, opts, 'setAntiPhishingCode', async ({ auth: ctx, body }) => auth.security.overview(await auth.setAntiPhishing(ctx, body.code, body.currentPassword, body.twoFactorCode)));
  route(router, opts, 'loginHistory', async ({ auth: ctx, query }) => {
    const cursor = query.cursor === undefined ? undefined : Number(query.cursor);
    if (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor <= 0)) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
    return auth.security.history(ctx.user.id, cursor, query.limit);
  });
}
