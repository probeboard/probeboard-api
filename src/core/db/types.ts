import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Kysely database types.
 *
 * Hand-written and kept in step with the migrations in `src/core/db/migrations`,
 * which are the source of truth. A schema change without a matching change here
 * is a review finding (see AGENTS.md).
 */

/** Read as a Date, written as either. */
type Timestamp = ColumnType<Date, Date | string, Date | string>;

/** Defaulted by the database on insert, never written by hand. */
type CreatedAt = ColumnType<Date, Date | string | undefined, Date | string>;

export interface SchemaMigrationsTable {
  name: string;
  applied_at: CreatedAt;
}

export interface UsersTable {
  id: Generated<string>;
  /** Always normalised lowercase. Use `normalizeEmail` before reading or writing. */
  email: string;
  /** Argon2id encoded string, including parameters and salt. */
  password_hash: string;
  email_verified_at: Timestamp | null;
  created_at: CreatedAt;
  updated_at: CreatedAt;
}

export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  /** SHA-256 of the token. The token itself is never stored. */
  token_hash: Buffer;
  issued_at: CreatedAt;
  expires_at: Timestamp;
  last_seen_at: CreatedAt;
  revoked_at: Timestamp | null;
}

export type AuthAttemptScope = 'ip' | 'email';

export interface AuthAttemptsTable {
  id: Generated<number>;
  scope: AuthAttemptScope;
  key: string;
  succeeded: boolean;
  occurred_at: CreatedAt;
}

export interface Database {
  schema_migrations: SchemaMigrationsTable;
  users: UsersTable;
  sessions: SessionsTable;
  auth_attempts: AuthAttemptsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export type Session = Selectable<SessionsTable>;
export type NewSession = Insertable<SessionsTable>;
