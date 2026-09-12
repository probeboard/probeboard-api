import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely database types. Kept hand-written and in step with the migrations in
 * `src/db/migrations` — the migrations are the source of truth.
 */

type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface SchemaMigrationsTable {
  name: string;
  applied_at: Generated<Timestamp>;
}

export interface Database {
  schema_migrations: SchemaMigrationsTable;
}
