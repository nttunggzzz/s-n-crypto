import type { NextFunction, Request, Response, Router } from 'express';
import { ZodError, type z } from 'zod';
import { endpoints, hasPermission, STAFF_ROLES, type AuthLevel, type EndpointName, type EndpointOutput, type Endpoints, type Permission } from '@cex/contracts';
import { AppError } from './errors.ts';
import { logger } from '../logger.ts';
import type { AuthContext } from '../modules/auth/authService.ts';

export const SESSION_COOKIE = 'cex_session';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext | null;
  }
}

type In<E, K extends string> = E extends Record<K, infer S> ? (S extends z.ZodType ? z.output<S> : undefined) : undefined;

export interface RouteCtx<N extends EndpointName> {
  params: In<Endpoints[N], 'params'>;
  query: In<Endpoints[N], 'query'>;
  body: In<Endpoints[N], 'body'>;
  /** Present for every non-public endpoint. */
  auth: Endpoints[N]['auth'] extends 'public' ? AuthContext | null : AuthContext;
  req: Request;
  res: Response;
}

export interface RouteOptions {
  requireEmailVerification: boolean;
  /** Validate responses against the contract (on in dev/test, off in production). */
  validateResponses: boolean;
}

/**
 * Registers an endpoint exactly as declared in @cex/contracts: same method/path,
 * inputs parsed with the contract schemas, auth level enforced, response checked.
 */
export function route<N extends EndpointName>(
  router: Router,
  opts: RouteOptions,
  name: N,
  handler: (ctx: RouteCtx<N>) => Promise<EndpointOutput<N>>,
): void {
  const def = endpoints[name];
  const method = def.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  router[method](def.path, async (req: Request, res: Response) => {
    const auth = req.auth ?? null;
    const level = def.auth as AuthLevel;
    if (level !== 'public') {
      if (!auth) throw new AppError('UNAUTHENTICATED', 'Sign in required');
      if (level === 'verified' && opts.requireEmailVerification && !auth.user.emailVerifiedAt) {
        throw new AppError('EMAIL_NOT_VERIFIED', 'Verify your email first');
      }
      if (level === 'staff') {
        // Order matters for the UI: not staff → 403; staff without 2FA (or not signed in with it) → TWO_FACTOR_REQUIRED.
        if (!STAFF_ROLES.includes(auth.user.role)) throw new AppError('FORBIDDEN', 'Staff only');
        if (!auth.user.twoFactorEnabledAt || !auth.session.mfaVerified) {
          throw new AppError('TWO_FACTOR_REQUIRED', 'Enable two-factor authentication and sign in with it to use the admin area');
        }
        const perm = (def as { permission?: Permission }).permission;
        if (!perm || !hasPermission(auth.user.role, perm)) throw new AppError('FORBIDDEN', `Missing permission ${perm ?? '(none declared)'}`);
      }
    }
    const d = def as { path: string; params?: z.ZodType; query?: z.ZodType; body?: z.ZodType; response: z.ZodType; status?: number; format?: 'json' | 'csv' };
    const ctx = {
      params: d.params ? d.params.parse(req.params) : undefined,
      query: d.query ? d.query.parse(req.query) : undefined,
      body: d.body ? d.body.parse(req.body ?? {}) : undefined,
      auth,
      req,
      res,
    } as RouteCtx<N>;
    const result = await handler(ctx);
    if (opts.validateResponses) {
      const check = d.response.safeParse(result);
      if (!check.success) {
        logger.error({ endpoint: name, issues: check.error.issues }, 'response does not match contract');
        throw new Error(`response of ${name} does not match its contract`);
      }
    }
    if (d.format === 'csv') {
      res.status(200).type('text/csv; charset=utf-8').attachment(d.path.split('/').pop()!).send(result);
      return;
    }
    res.status(d.status ?? 200).json(result);
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: { issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } },
    });
    return;
  }
  if (err && typeof err === 'object' && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' } });
    return;
  }
  logger.error({ err, method: req.method, path: req.path }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } });
}

export function clientIp(req: Request): string | undefined {
  return req.ip ?? req.socket.remoteAddress ?? undefined;
}

/** Session token from the httpOnly cookie, or `Authorization: Bearer` (mobile app). */
export function readSessionToken(req: Pick<Request, 'headers'> & { cookies?: Record<string, string> }): string | null {
  const bearer = req.headers.authorization;
  if (bearer?.startsWith('Bearer ')) return bearer.slice(7).trim() || null;
  return req.cookies?.[SESSION_COOKIE] ?? null;
}

/** Minimal cookie parsing for the WebSocket upgrade request. */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
