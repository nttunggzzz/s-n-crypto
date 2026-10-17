// Dev has no mail server: emails (verification links, password resets) are only printed in the [server] log, so a
// sign-up that must verify its email can neither use the faucet nor trade until someone finds the link there.
// `npm run dev` therefore starts without that requirement — unless the owner decided: REQUIRE_EMAIL_VERIFICATION in the
// shell or in .env, or `--verify-email` (to try the real flow). The server's own default (true) and the live
// exchange (infra/host.mjs) are not touched.

/** The value of REQUIRE_EMAIL_VERIFICATION written in the text of a .env file, or undefined. */
export function envFileValue(envFileText) {
  // spaces/tabs only after "=": an empty value must not swallow the next line
  return /^[ \t]*REQUIRE_EMAIL_VERIFICATION[ \t]*=[ \t]*(\S+)/m.exec(envFileText ?? '')?.[1];
}

/**
 * @param {{ argv: string[], env: Record<string, string | undefined>, envFileText?: string }} input
 * @returns {{ env: Record<string, string>, required: boolean }} what to add to the dev server's environment, and whether
 *   the server will require email verification.
 */
export function devEmailEnv({ argv, env, envFileText }) {
  const fileValue = envFileValue(envFileText);
  if (argv.includes('--verify-email')) return { env: { REQUIRE_EMAIL_VERIFICATION: 'true' }, required: true };
  if (env.REQUIRE_EMAIL_VERIFICATION !== undefined) return { env: {}, required: env.REQUIRE_EMAIL_VERIFICATION !== 'false' };
  if (fileValue !== undefined) return { env: {}, required: fileValue !== 'false' };
  return { env: { REQUIRE_EMAIL_VERIFICATION: 'false' }, required: false };
}

// Owner decision 2026-10-17: until the security work is redone, `npm run dev` lets staff use the admin app without 2FA
// (STAFF_REQUIRE_2FA=false; the server refuses that value in production). `--with-2fa`, or STAFF_REQUIRE_2FA in the
// shell or .env, keeps the owner's choice. e2e and the live exchange are not touched (server default: true).

/**
 * @param {{ argv: string[], env: Record<string, string | undefined>, envFileText?: string }} input
 * @returns {{ env: Record<string, string>, required: boolean }} what to add to the dev server's environment, and whether
 *   staff need 2FA on it.
 */
export function devStaff2faEnv({ argv, env, envFileText }) {
  const fileValue = /^[ \t]*STAFF_REQUIRE_2FA[ \t]*=[ \t]*(\S+)/m.exec(envFileText ?? '')?.[1];
  if (argv.includes('--with-2fa')) return { env: { STAFF_REQUIRE_2FA: 'true' }, required: true };
  if (env.STAFF_REQUIRE_2FA !== undefined) return { env: {}, required: env.STAFF_REQUIRE_2FA !== 'false' };
  if (fileValue !== undefined) return { env: {}, required: fileValue !== 'false' };
  return { env: { STAFF_REQUIRE_2FA: 'false' }, required: false };
}
