import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// ───────────────────────────── base32 (RFC 4648, no padding)

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ───────────────────────────── TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 digits)

export const TOTP_PERIOD_S = 30;
const DIGITS = 6;

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1]! & 0xf;
  const bin = ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_S);
}

/**
 * Checks a 6-digit code against the current step ±1 (clock drift).
 * Returns the matched step, or null. Steps <= lastUsedStep are refused (no replay).
 */
export function verifyTotp(secretB32: string, code: string, nowMs: number, lastUsedStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretB32);
  const current = totpStep(nowMs);
  for (const step of [current - 1, current, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(hotp(key, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUrl(issuer: string, account: string, secretB32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_PERIOD_S}`;
}

// ───────────────────────────── recovery codes

const RC_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes

export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const b = randomBytes(8);
    const chars = [...b].map((x) => RC_ALPHABET[x % RC_ALPHABET.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
}

// ───────────────────────────── secrets at rest (AES-256-GCM)

/** Encrypts small secrets (TOTP keys) with the server data key. Format: v1:iv:tag:ciphertext (base64). */
export class SecretBox {
  private readonly key: Buffer;
  constructor(keyB64: string) {
    this.key = Buffer.from(keyB64, 'base64');
    if (this.key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes (base64)');
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
  }

  open(sealed: string): string {
    const [v, iv, tag, ct] = sealed.split(':');
    if (v !== 'v1' || !iv || !tag || !ct) throw new Error('bad sealed secret');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  }
}
