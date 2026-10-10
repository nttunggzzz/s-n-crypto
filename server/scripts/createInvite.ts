/**
 * Creates a sign-up invite code from the server command line — how the first people (the owner included)
 * get in when REGISTRATION=invite. Writes an INVITE_CREATE audit row (actor: command line).
 *
 *   npm run admin:invite -- "Chủ dự án" [maxUses=1] [expiresInDays=14]
 */
import { loadConfig } from '../src/config.ts';
import { createDatabase } from '../src/db/client.ts';
import { InviteService } from '../src/modules/auth/inviteService.ts';

const [note, maxUsesArg = '1', daysArg = '14'] = process.argv.slice(2);
const maxUses = Number(maxUsesArg);
const expiresInDays = Number(daysArg);
if (!note?.trim() || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100 || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) {
  console.error('usage: npm run admin:invite -- "<who it is for>" [maxUses 1-100] [expiresInDays 1-90]');
  process.exit(1);
}

const config = loadConfig();
const database = createDatabase(config.DATABASE_URL, 1);
try {
  const created = await new InviteService(database.db, config.APP_URL).create({ user: null }, { note, maxUses, expiresInDays });
  console.log(`invite ${created.invite.id} for "${created.invite.note}" — ${maxUses} use(s), expires ${created.invite.expiresAt}`);
  console.log(`code: ${created.code}`);
  console.log(`link: ${created.link}`);
  if (config.REGISTRATION !== 'invite') console.log('(registration is OPEN on this server — the code is not needed here)');
} finally {
  await database.close();
}
