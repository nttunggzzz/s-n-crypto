import { and, eq, sql } from 'drizzle-orm';
import type { FaucetStatus } from '@cex/contracts';
import { dec, minDec, toFixedStr, ZERO, type Dec } from '@cex/core';
import { faucetClaims, users } from '../../db/schema.ts';
import type { Db, DbOrTx } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { applyBalanceChanges, type BalanceState } from './ledger.ts';
import type { ExchangeConfig } from './exchangeConfig.ts';
import type { ExchangeEvents } from './events.ts';

interface ClaimStats {
  total: Dec;
  last: Date | null;
}

/** Virtual-money faucet: fixed amount, cooldown, lifetime cap — all admin-configurable. */
export class FaucetService {
  constructor(
    private readonly db: Db,
    private readonly config: ExchangeConfig,
    private readonly events: ExchangeEvents,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async stats(tx: DbOrTx, userId: string, asset: string): Promise<ClaimStats> {
    const [row] = await tx
      .select({ total: sql<string | null>`sum(${faucetClaims.amount})`, last: sql<Date | null>`max(${faucetClaims.createdAt})` })
      .from(faucetClaims)
      .where(and(eq(faucetClaims.userId, userId), eq(faucetClaims.asset, asset)));
    return { total: row?.total ? dec(row.total) : ZERO, last: row?.last ? new Date(row.last) : null };
  }

  private build(stats: ClaimStats): FaucetStatus {
    const s = this.config.settings;
    const cap = dec(s.faucetLifetimeCap);
    const capReached = stats.total.gte(cap);
    const next = stats.last ? new Date(stats.last.getTime() + s.faucetCooldownHours * 3_600_000) : null;
    const coolingDown = next !== null && next > this.now();
    return {
      asset: s.faucetAsset,
      amount: toFixedStr(dec(s.faucetAmount)),
      cooldownHours: s.faucetCooldownHours,
      lifetimeCap: toFixedStr(cap),
      totalClaimed: toFixedStr(stats.total),
      canClaim: !capReached && !coolingDown,
      nextAvailableAt: !capReached && coolingDown ? next!.toISOString() : null,
    };
  }

  async status(userId: string): Promise<FaucetStatus> {
    return this.build(await this.stats(this.db, userId, this.config.settings.faucetAsset));
  }

  async claim(userId: string): Promise<{ claimed: Dec; balance: BalanceState; status: FaucetStatus }> {
    const s = this.config.settings;
    const result = await this.db.transaction(async (tx) => {
      // Serialize claims of the same user.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
      const stats = await this.stats(tx, userId, s.faucetAsset);
      const status = this.build(stats);
      if (stats.total.gte(dec(s.faucetLifetimeCap))) throw new AppError('FAUCET_CAP_REACHED', 'Lifetime faucet limit reached');
      if (!status.canClaim) throw new AppError('FAUCET_COOLDOWN', 'Faucet is cooling down', { nextAvailableAt: status.nextAvailableAt });
      const amount = minDec(dec(s.faucetAmount), dec(s.faucetLifetimeCap).sub(stats.total));
      const [claim] = await tx
        .insert(faucetClaims)
        .values({ userId, asset: s.faucetAsset, amount: toFixedStr(amount), createdAt: this.now() })
        .returning();
      const state = await applyBalanceChanges(tx, [
        { userId, asset: s.faucetAsset, type: 'FAUCET', deltaAvailable: amount, refType: 'FAUCET', refId: String(claim!.id) },
      ]);
      const balance = [...state.values()][0]!;
      return { claimed: amount, balance, status: this.build({ total: stats.total.add(amount), last: claim!.createdAt }) };
    });
    this.events.publish({ balances: [result.balance] });
    return result;
  }
}
