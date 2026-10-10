import { EventEmitter } from 'node:events';
import type { DcaPlan, GridBot } from '@cex/contracts';
import type { notifications } from '../../db/schema.ts';

/** Emitted after the change is committed; the realtime hub forwards them on the `user` channel. */
export class BotsEvents extends EventEmitter<{
  dcaPlan: [userId: string, plan: DcaPlan];
  gridBot: [userId: string, bot: GridBot];
  notification: [userId: string, row: typeof notifications.$inferSelect];
}> {}
