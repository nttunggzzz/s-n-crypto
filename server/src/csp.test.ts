import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness } from '../test/apiHarness.ts';

const csp = async (h: ApiHarness) => {
  const res = await fetch(`${h.base}/api/v1/health`);
  const header = res.headers.get('content-security-policy') ?? '';
  return new Map(header.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name!, values] as const));
};

// R-04: the sign-up captcha (Cloudflare Turnstile) needs its script, iframe and request allowed — only when it is on.
describe('Content-Security-Policy', () => {
  describe('without a captcha', () => {
    const h = new ApiHarness();
    beforeAll(() => h.start());
    afterAll(() => h.stop());
    it('scripts only from this origin, no frames', async () => {
      const d = await csp(h);
      expect(d.get('script-src')).toEqual(["'self'"]);
      expect(d.get('default-src')).toEqual(["'self'"]); // connect-src / frame-src fall back to it
      expect(d.get('connect-src')).toBeUndefined();
      expect(d.get('frame-src')).toBeUndefined();
      expect([...d.keys()].join(' ')).not.toContain('cloudflare');
    });
  });

  describe('with the captcha (TURNSTILE_SITE_KEY)', () => {
    const h = new ApiHarness();
    beforeAll(() => h.start({ env: { TURNSTILE_SECRET: 's', TURNSTILE_SITE_KEY: 'k' } }));
    afterAll(() => h.stop());
    it('allows exactly Cloudflare Turnstile for script, frame and connect; everything else as before', async () => {
      const d = await csp(h);
      expect(d.get('script-src')).toEqual(["'self'", 'https://challenges.cloudflare.com']);
      expect(d.get('frame-src')).toEqual(['https://challenges.cloudflare.com']);
      expect(d.get('connect-src')).toEqual(["'self'", 'https://challenges.cloudflare.com']);
      expect(d.get('default-src')).toEqual(["'self'"]);
      expect(d.get('object-src')).toEqual(["'none'"]);
    });
  });
});
