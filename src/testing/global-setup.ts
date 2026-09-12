import { Pool } from 'pg';
import { up } from '../core/db/migrator/runner.js';
import { testDatabaseUrl } from './database.js';

/**
 * Brings the test database up to date once, before the integration suite.
 *
 * It uses the application's own migration runner rather than a test-only
 * schema, so the tests run against the schema that actually ships.
 */
export default async function setup(): Promise<void> {
  const pool = new Pool({ connectionString: testDatabaseUrl(), max: 1 });
  try {
    await up(pool, () => undefined);
  } finally {
    await pool.end();
  }
}
