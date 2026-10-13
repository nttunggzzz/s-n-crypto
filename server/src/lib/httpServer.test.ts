import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer, KEEP_ALIVE_TIMEOUT_MS } from './httpServer.ts';

let server: ReturnType<typeof createHttpServer> | undefined;
afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((r) => (server ? server.close(r) : r(null)));
  server = undefined;
});

describe('createHttpServer', () => {
  it('keeps idle connections longer than proxies/tunnels (≥ 90 s) and headersTimeout above it', () => {
    server = createHttpServer((_req, res) => res.end('ok'));
    expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
    expect(KEEP_ALIVE_TIMEOUT_MS).toBeGreaterThan(90_000);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });

  it('a connection idle for longer than Node’s old 5 s default is still open and serves the next request', async () => {
    server = createHttpServer((_req, res) => res.end('ok'));
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const socket = net.connect(port, '127.0.0.1');
    await new Promise((r) => socket.once('connect', r));
    const ask = () =>
      new Promise<string>((resolve, reject) => {
        socket.once('data', (d) => resolve(String(d)));
        socket.once('error', reject);
        socket.write(`GET / HTTP/1.1\r\nHost: x\r\nConnection: keep-alive\r\n\r\n`);
      });
    expect(await ask()).toContain('200 OK');
    await new Promise((r) => setTimeout(r, 5_500));
    expect(socket.destroyed).toBe(false);
    expect(await ask()).toContain('200 OK');
    socket.destroy();
  }, 15_000);
});
