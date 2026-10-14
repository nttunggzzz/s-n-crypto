import http, { type RequestListener } from 'node:http';

/**
 * How long an idle keep-alive connection stays open. Node's default (5 s) is shorter than what the clients in
 * front of the server keep: cloudflared (the live exchange's tunnel) and most proxies reuse an idle connection for
 * up to 90 s. A request sent on a connection the server is closing at that moment fails with ECONNRESET / 502 —
 * seen in the e2e run (`GET /api/v1/bots/grid → read ECONNRESET`). So the server must outlast its clients.
 */
export const KEEP_ALIVE_TIMEOUT_MS = 120_000;

/** The HTTP server for the API + /ws + the web apps, with keep-alive set longer than any client/proxy idle timeout. */
export function createHttpServer(app: RequestListener): http.Server {
  const server = http.createServer(app);
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  // must be larger than keepAliveTimeout, or Node may close a connection that is about to send its headers
  server.headersTimeout = KEEP_ALIVE_TIMEOUT_MS + 1_000;
  return server;
}
