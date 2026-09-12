import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DbService } from '../../core/db/db.service.js';
import type { AuthAttemptScope } from '../../core/db/types.js';

@Injectable()
export class AuthAttemptRepository {
  constructor(private readonly db: DbService) {}

  async record(
    scope: AuthAttemptScope,
    key: string,
    succeeded: boolean,
    at: Date = new Date(),
  ): Promise<void> {
    await this.db.kysely
      .insertInto('auth_attempts')
      .values({ scope, key, succeeded, occurred_at: at })
      .execute();
  }

  /** Attempts in the window, optionally only the failed ones. */
  async countSince(
    scope: AuthAttemptScope,
    key: string,
    since: Date,
    onlyFailures: boolean,
  ): Promise<number> {
    let query = this.db.kysely
      .selectFrom('auth_attempts')
      .select(sql<number>`count(*)::int`.as('count'))
      .where('scope', '=', scope)
      .where('key', '=', key)
      .where('occurred_at', '>=', since);

    if (onlyFailures) query = query.where('succeeded', '=', false);

    return (await query.executeTakeFirstOrThrow()).count;
  }

  /**
   * Clears the record for a key, called after a success so a user who finally
   * remembers their password is not still locked out by earlier failures.
   */
  async clear(scope: AuthAttemptScope, key: string): Promise<void> {
    await this.db.kysely
      .deleteFrom('auth_attempts')
      .where('scope', '=', scope)
      .where('key', '=', key)
      .execute();
  }

  /** Bounds the table. Without this it is an unbounded log of every attempt. */
  async pruneBefore(cutoff: Date): Promise<number> {
    const result = await this.db.kysely
      .deleteFrom('auth_attempts')
      .where('occurred_at', '<', cutoff)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
