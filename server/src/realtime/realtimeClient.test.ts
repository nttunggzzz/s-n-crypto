import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket as ServerSocket } from 'ws';
import { createRealtimeClient, WS_SESSION_ENDED, type RealtimeClient, type RealtimeCloseInfo } from '@cex/contracts';

// The browser client (global WebSocket, Node 22+) against a plain ws server that closes the way the real hub does.
let wss: WebSocketServer | undefined;
let client: RealtimeClient | undefined;
afterEach(async () => {
  client?.close();
  client = undefined;
  await new Promise((r) => (wss ? wss.close(r) : r(null)));
  wss = undefined;
});

async function serve(onConnection: (ws: ServerSocket, n: number) => void) {
  let n = 0;
  wss = new WebSocketServer({ port: 0 });
  wss.on('connection', (ws) => onConnection(ws, ++n));
  await new Promise((r) => wss!.once('listening', r));
  return `ws://127.0.0.1:${(wss.address() as { port: number }).port}`;
}
const until = async (cond: () => boolean, what: string) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
  expect(cond(), what).toBe(true);
};

describe('RealtimeClient.onClose (R-16)', () => {
  it('reports the close code and reason (session ended = 4401) and still reconnects by itself', async () => {
    const url = await serve((ws, n) => {
      if (n === 1) ws.close(WS_SESSION_ENDED, 'session ended');
    });
    client = createRealtimeClient({ url, maxBackoffMs: 50 });
    const closes: RealtimeCloseInfo[] = [];
    const statuses: string[] = [];
    client.onClose((i) => closes.push(i));
    client.onStatus((s) => statuses.push(s));

    await until(() => closes.length === 1, 'onClose not called');
    expect(closes[0]).toEqual({ code: WS_SESSION_ENDED, reason: 'session ended' });
    await until(() => statuses.lastIndexOf('open') > statuses.indexOf('closed'), 'no automatic reconnect after the close');
  });

  it('is not called for the connection reconnect() replaces, after unsubscribe, or after close()', async () => {
    const url = await serve(() => {});
    client = createRealtimeClient({ url, maxBackoffMs: 50 });
    const closes: RealtimeCloseInfo[] = [];
    const off = client.onClose((i) => closes.push(i));
    const opened: string[] = [];
    client.onStatus((s) => opened.push(s));
    await until(() => opened.includes('open'), 'first connection');

    client.reconnect(); // replaces the connection: no "closed" for the old one
    await until(() => opened.filter((s) => s === 'open').length === 2, 'second connection');
    expect(closes).toEqual([]);

    off();
    for (const c of wss!.clients) c.close(1001, 'going away'); // the server drops the line; the client has unsubscribed
    await until(() => opened.includes('closed'), 'client noticed the drop');
    expect(closes).toEqual([]);

    const closesAfter: RealtimeCloseInfo[] = [];
    client.onClose((i) => closesAfter.push(i));
    client.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(closesAfter).toEqual([]); // closed by the app itself
  });
});
