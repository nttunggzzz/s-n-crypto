// route() framework checks with fake handlers: no database, no ApiHarness (contracts 0.13.0 — format 'binary', 413 mapping).
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { errorHandler, route } from './http.ts';
import { logger } from '../logger.ts';
import type { AuthContext } from '../modules/auth/authService.ts';

const IMAGE = '00000000-0000-4000-b000-000000000001';
const NOT_BYTES = '00000000-0000-4000-b000-000000000002';
// a real 1×1 PNG with a 0x00 and 0xff in it: bytes must come back untouched (no JSON / text re-encoding)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '32kb' })); // same global parser as app.ts
  // fake session: signed in only with the test header (route() checks req.auth like in the app)
  app.use((req, _res, next) => {
    req.auth = req.headers['x-test-user'] ? ({ user: { role: 'user', emailVerifiedAt: new Date() }, session: { mfaVerified: false } } as unknown as AuthContext) : null;
    next();
  });
  const router = express.Router();
  const opts = { requireEmailVerification: false, validateResponses: true };
  route(router, opts, 'journalAttachment', async ({ params, res }) => {
    if (params.attachmentId === NOT_BYTES) return { contentType: 'image/png', data: 'not bytes' } as never;
    res.setHeader('ETag', '"abc"'); // headers set by the handler are kept
    return { contentType: 'image/png', data: PNG };
  });
  route(router, opts, 'journalUpdateSettings', async ({ body }) => {
    if (body.autoJournal) return { autoJournal: true, autoSince: 'not a date' } as never; // breaks the contract on purpose
    return { autoJournal: false, autoSince: null };
  });
  app.use(router);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const signedIn = { 'x-test-user': '1' };
const patch = (body: string) => fetch(`${base}/api/v1/journal/settings`, { method: 'PATCH', headers: { ...signedIn, 'content-type': 'application/json' }, body });

describe("route() with format 'binary'", () => {
  it('needs a session like any user endpoint: 401 JSON error', async () => {
    const r = await fetch(`${base}/api/v1/journal/attachments/${IMAGE}`);
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('sends the bytes untouched with their Content-Type (no schema check, handler headers kept)', async () => {
    const r = await fetch(`${base}/api/v1/journal/attachments/${IMAGE}`, { headers: signedIn });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('etag')).toBe('"abc"');
    expect(Buffer.from(await r.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('params are still validated (400) and a handler result that is not bytes is a 500, never sent', async () => {
    const bad = await fetch(`${base}/api/v1/journal/attachments/not-a-uuid`, { headers: signedIn });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    const r = await fetch(`${base}/api/v1/journal/attachments/${NOT_BYTES}`, { headers: signedIn });
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });
});

describe('JSON endpoints keep their behaviour', () => {
  it('a JSON body above 32 KB → 413 PAYLOAD_TOO_LARGE (BODY_TOO_LARGE, limitBytes 32768), logged with path and IP', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const r = await patch(JSON.stringify({ autoJournal: false, pad: 'x'.repeat(40_000) }));
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large', details: { reason: 'BODY_TOO_LARGE', limitBytes: 32768 } } });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/v1/journal/settings', ip: expect.any(String), limit: 32768 }), 'request body too large');
    warn.mockRestore();
  });

  it('valid body → JSON response checked against the contract; strict body → 400; response off-contract → 500', async () => {
    const ok = await patch(JSON.stringify({ autoJournal: false }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('application/json');
    expect(await ok.json()).toEqual({ autoJournal: false, autoSince: null });
    const strict = await patch(JSON.stringify({ autoJournal: false, autoSince: '2026-01-01T00:00:00.000Z' }));
    expect(strict.status).toBe(400);
    expect(await strict.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect((await patch(JSON.stringify({ autoJournal: true }))).status).toBe(500);
    const malformed = await patch('{"autoJournal":');
    expect(malformed.status).toBe(400);
  });
});
