import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, otpauthUrl, SecretBox, verifyTotp } from './totp.ts';

// RFC 6238 Appendix B (SHA1, key "12345678901234567890"), last 6 digits of the 8-digit values.
const RFC_KEY = Buffer.from('12345678901234567890');
const VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    for (const [t, code8] of VECTORS) expect(hotp(RFC_KEY, Math.floor(t / 30), 8)).toBe(code8);
  });

  it('base32 round-trips', () => {
    const secret = base32Encode(RFC_KEY);
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(secret).equals(RFC_KEY)).toBe(true);
  });

  it('accepts ±1 step of drift and refuses a replayed step', () => {
    const secret = base32Encode(RFC_KEY);
    const now = 59_000;
    const code = hotp(RFC_KEY, 1);
    expect(verifyTotp(secret, code, now, null)).toBe(1);
    expect(verifyTotp(secret, code, now + 30_000, null)).toBe(1); // previous step still accepted
    expect(verifyTotp(secret, code, now + 60_000, null)).toBeNull(); // too old
    expect(verifyTotp(secret, code, now, 1)).toBeNull(); // replay
    expect(verifyTotp(secret, '12345', now, null)).toBeNull();
  });

  it('builds an otpauth URL and seals secrets', () => {
    expect(otpauthUrl('CEX Sim', 'a@b.co', 'ABC')).toBe('otpauth://totp/CEX%20Sim%3Aa%40b.co?secret=ABC&issuer=CEX%20Sim&algorithm=SHA1&digits=6&period=30');
    const box = new SecretBox(Buffer.alloc(32, 7).toString('base64'));
    const sealed = box.seal('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => new SecretBox(Buffer.alloc(32, 8).toString('base64')).open(sealed)).toThrow();
  });
});
