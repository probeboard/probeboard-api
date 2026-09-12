import { describe, expect, it } from 'vitest';
import { migrationFiles, migrationName, readMigration } from './files.js';

describe('migrationName', () => {
  it('strips the direction suffix', () => {
    expect(migrationName('0001_init.up.sql')).toBe('0001_init');
    expect(migrationName('0001_init.down.sql')).toBe('0001_init');
  });

  it('leaves a name containing "up" or "down" intact', () => {
    expect(migrationName('0007_add_uptime_rollups.up.sql')).toBe('0007_add_uptime_rollups');
    expect(migrationName('0008_downsample_stats.down.sql')).toBe('0008_downsample_stats');
  });
});

describe('migrationFiles', () => {
  it('returns only the requested direction', async () => {
    const up = await migrationFiles('up');
    const down = await migrationFiles('down');

    expect(up.every((f) => f.endsWith('.up.sql'))).toBe(true);
    expect(down.every((f) => f.endsWith('.down.sql'))).toBe(true);
  });

  it('every migration has both halves', async () => {
    // A migration with no down file cannot be rolled back, and the CI
    // migrations job would fail on it rather than here.
    const up = (await migrationFiles('up')).map(migrationName);
    const down = (await migrationFiles('down')).map(migrationName);
    expect(up).toEqual(down);
  });

  it('is ordered by name, which is what makes the sequence deterministic', async () => {
    const files = await migrationFiles('up');
    expect(files).toEqual([...files].sort());
  });

  it('names are zero-padded so ordering survives the tenth migration', async () => {
    for (const name of (await migrationFiles('up')).map(migrationName)) {
      expect(name).toMatch(/^\d{4}_/);
    }
  });
});

describe('readMigration', () => {
  it('reads the sql for a direction', async () => {
    expect(await readMigration('0001_init', 'up')).toContain('CREATE TYPE');
    expect(await readMigration('0001_init', 'down')).toContain('DROP TYPE');
  });

  it('fails loudly for a migration that does not exist', async () => {
    await expect(readMigration('9999_nope', 'up')).rejects.toThrow();
  });
});
