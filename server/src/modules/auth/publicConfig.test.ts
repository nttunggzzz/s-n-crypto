import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness } from '../../../test/apiHarness.ts';

// What the apps learn about email: with a real mail transport the server says it delivers ("sent"); the log / file
// transports (dev, e2e, a closed server before a mail domain exists) say "log" so the app does not claim "email sent".
describe('publicConfig.emailDelivery (N-13)', () => {
  const real = new ApiHarness();
  beforeAll(async () => {
    await real.start({ env: { EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 'test-key-not-used' } });
  });
  afterAll(async () => {
    await real.stop();
  });

  it('"sent" with the resend transport, together with the verification flag', async () => {
    expect(await real.browser().publicConfig()).toMatchObject({ emailDelivery: 'sent', emailVerificationRequired: true });
  });
});
