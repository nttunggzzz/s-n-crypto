import { describe, expect, it } from 'vitest';
import { devEmailEnv, devStaff2faEnv } from './devEmailEnv.mjs';

// N-01: `npm run dev` starts without the email-verification requirement unless the owner decided otherwise.
const OFF = { env: { REQUIRE_EMAIL_VERIFICATION: 'false' }, required: false };

describe('devEmailEnv', () => {
  it('nothing decided → verification off (dev only logs emails)', () => {
    expect(devEmailEnv({ argv: [], env: {} })).toEqual(OFF);
  });
  it('respects a decision in the shell or in .env (nothing is added)', () => {
    expect(devEmailEnv({ argv: [], env: { REQUIRE_EMAIL_VERIFICATION: 'true' } })).toEqual({ env: {}, required: true });
    expect(devEmailEnv({ argv: [], env: { REQUIRE_EMAIL_VERIFICATION: 'false' } })).toEqual({ env: {}, required: false });
    expect(devEmailEnv({ argv: [], env: {}, envFileText: 'PORT=1\nREQUIRE_EMAIL_VERIFICATION=false\n' })).toEqual({ env: {}, required: false });
    expect(devEmailEnv({ argv: [], env: {}, envFileText: '  REQUIRE_EMAIL_VERIFICATION = true\r\n' })).toEqual({ env: {}, required: true });
  });
  it('--verify-email forces the production behaviour, whatever the shell or .env say', () => {
    expect(devEmailEnv({ argv: ['--verify-email'], env: { REQUIRE_EMAIL_VERIFICATION: 'false' }, envFileText: 'REQUIRE_EMAIL_VERIFICATION=false' })).toEqual({
      env: { REQUIRE_EMAIL_VERIFICATION: 'true' },
      required: true,
    });
  });
  it('a commented-out or empty line in .env is not a decision (and does not swallow the next line)', () => {
    expect(devEmailEnv({ argv: [], env: {}, envFileText: '# REQUIRE_EMAIL_VERIFICATION=true\n' })).toEqual(OFF);
    expect(devEmailEnv({ argv: [], env: {}, envFileText: 'REQUIRE_EMAIL_VERIFICATION=\nPORT=8080\n' })).toEqual(OFF);
  });
});

describe('devStaff2faEnv (owner decision 2026-10-17)', () => {
  it('dev starts without staff 2FA unless --with-2fa, the shell or .env decided', () => {
    expect(devStaff2faEnv({ argv: [], env: {} })).toEqual({ env: { STAFF_REQUIRE_2FA: 'false' }, required: false });
    expect(devStaff2faEnv({ argv: ['--with-2fa'], env: { STAFF_REQUIRE_2FA: 'false' } })).toEqual({ env: { STAFF_REQUIRE_2FA: 'true' }, required: true });
    expect(devStaff2faEnv({ argv: [], env: { STAFF_REQUIRE_2FA: 'true' } })).toEqual({ env: {}, required: true });
    expect(devStaff2faEnv({ argv: [], env: {}, envFileText: 'STAFF_REQUIRE_2FA=true\n' })).toEqual({ env: {}, required: true });
    expect(devStaff2faEnv({ argv: [], env: {}, envFileText: '# STAFF_REQUIRE_2FA=true\n' })).toEqual({ env: { STAFF_REQUIRE_2FA: 'false' }, required: false });
  });
});
