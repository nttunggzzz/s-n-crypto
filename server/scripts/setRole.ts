/**
 * Sets a user's role from the server command line — used to create the first owner,
 * since nobody can promote themselves through the API. Writes a ROLE_BOOTSTRAP audit row.
 *
 *   npm run admin:set-role -- someone@example.com owner
 */
import { eq } from 'drizzle-orm';
import { Role } from '@cex/contracts';
import { loadConfig } from '../src/config.ts';
import { createDatabase } from '../src/db/client.ts';
import { users } from '../src/db/schema.ts';
import { writeAudit } from '../src/modules/admin/audit.ts';

const [email, roleArg] = process.argv.slice(2);
const role = Role.safeParse(roleArg);
if (!email || !role.success) {
  console.error('usage: npm run admin:set-role -- <email> <user|support|admin|owner>');
  process.exit(1);
}

const config = loadConfig();
const database = createDatabase(config.DATABASE_URL, 1);
try {
  const [u] = await database.db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!u) throw new Error(`no user with email ${email}`);
  if (u.isBot) throw new Error('the signal bot account cannot get a role');
  await database.db.transaction(async (tx) => {
    await tx.update(users).set({ role: role.data, updatedAt: new Date() }).where(eq(users.id, u.id));
    await writeAudit(tx, { actorId: null, action: 'ROLE_BOOTSTRAP', targetType: 'USER', targetId: u.id, before: { role: u.role }, after: { role: role.data }, reason: 'set from the server command line' });
  });
  console.log(`${u.email}: ${u.role} -> ${role.data}${role.data !== 'user' && !u.twoFactorEnabledAt ? ' (must enable 2FA before using the admin area)' : ''}`);
} finally {
  await database.close();
}
