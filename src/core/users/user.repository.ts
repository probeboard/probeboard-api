import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service.js';
import type { User } from '../db/types.js';
import { normalizeEmail } from './email.js';

/**
 * Data access for accounts.
 *
 * In `core` rather than `api` because M7's notifier reads a user's email from
 * the *worker* to send an incident alert. Authentication itself — hashing,
 * sessions, guards — never leaves the api.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly db: DbService) {}

  /**
   * Creates an account, or returns undefined if the address is taken.
   *
   * `ON CONFLICT DO NOTHING` rather than a read followed by a write: two
   * concurrent registrations of the same address would both pass the read and
   * one would then fail on the unique index (review rule g15). The caller
   * decides what to tell the client — A-1 requires that a taken address is
   * indistinguishable from a fresh one.
   */
  async create(email: string, passwordHash: string): Promise<User | undefined> {
    return this.db.kysely
      .insertInto('users')
      .values({ email: normalizeEmail(email), password_hash: passwordHash })
      .onConflict((oc) => oc.column('email').doNothing())
      .returningAll()
      .executeTakeFirst();
  }

  findByEmail(email: string): Promise<User | undefined> {
    return this.db.kysely
      .selectFrom('users')
      .selectAll()
      .where('email', '=', normalizeEmail(email))
      .executeTakeFirst();
  }

  findById(id: string): Promise<User | undefined> {
    return this.db.kysely.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /** Returns the updated row, or undefined if no such user exists. */
  async updatePasswordHash(id: string, passwordHash: string): Promise<User | undefined> {
    return this.db.kysely
      .updateTable('users')
      .set({ password_hash: passwordHash, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }
}
