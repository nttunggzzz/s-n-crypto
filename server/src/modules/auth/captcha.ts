import { AppError } from '../../lib/errors.ts';

/** Cloudflare Turnstile. Disabled (no-op) when no secret is configured. */
export async function verifyCaptcha(secret: string, token: string | undefined, ip: string | undefined): Promise<void> {
  if (!secret) return;
  if (!token) throw new AppError('VALIDATION_ERROR', 'Captcha required', { field: 'captchaToken' });
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = (await res.json()) as { success?: boolean };
  if (!data.success) throw new AppError('VALIDATION_ERROR', 'Captcha failed', { field: 'captchaToken' });
}
