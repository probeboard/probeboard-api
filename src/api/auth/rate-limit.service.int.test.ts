import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../core/config/index.js';
import type { DbService } from '../../core/db/db.service.js';
import { connectTestDb, truncateAll, type TestDb } from '../../testing/database.js';
import { AuthAttemptRepository } from './rate-limit.repository.js';
import { AuthRateLimitService } from './rate-limit.service.js';

const cfg = loadConfig({
  DATABASE_URL: 'postgres://u:p@localhost:5432/probeboard',
  AUTH_WINDOW_MS: '60000',
  AUTH_MAX_PER_IP: '5',
  AUTH_MAX_FAILURES_PER_EMAIL: '3',
});

let ctx: TestDb;
let repo: AuthAttemptRepository;
let limiter: AuthRateLimitService;

const IP = '203.0.113.7';

beforeAll(() => {
  ctx = connectTestDb();
  repo = new AuthAttemptRepository({ kysely: ctx.db } as DbService);
  limiter = new AuthRateLimitService(cfg, repo);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await truncateAll(ctx.pool);
});

describe('per-IP limit', () => {
  it('allows attempts up to the limit and then refuses', async () => {
    // A distinct address each time, so only the IP limit is in play: with one
    // address the account lockout fires first, which is itself correct.
    for (let i = 0; i < 5; i++) {
      expect((await limiter.check(IP, `u${String(i)}@example.com`)).allowed).toBe(true);
      await limiter.record(IP, `u${String(i)}@example.com`, false);
    }

    const verdict = await limiter.check(IP, 'fresh@example.com');
    expect(verdict.allowed).toBe(false);
    expect(verdict.scope).toBe('ip');
    expect(verdict.retryAfterSeconds).toBe(60);
  });

  it('lets the account limit fire before the IP limit when one address is hammered', async () => {
    // Three failures at one address trips the account lockout even though the
    // IP has attempts to spare.
    for (let i = 0; i < 3; i++) await limiter.record(IP, 'victim@example.com', false);

    const verdict = await limiter.check(IP, 'victim@example.com');
    expect(verdict.allowed).toBe(false);
    expect(verdict.scope).toBe('email');
  });

  it('counts successes too, so a hammering host is still throttled', async () => {
    // One success among many attempts is what a successful stuffing run looks
    // like, so a success must not buy more attempts.
    for (let i = 0; i < 5; i++) await limiter.record(IP, `u${String(i)}@example.com`, true);

    expect((await limiter.check(IP, 'next@example.com')).allowed).toBe(false);
  });

  it('does not throttle a different host', async () => {
    for (let i = 0; i < 6; i++) await limiter.record(IP, `u${String(i)}@example.com`, false);

    expect((await limiter.check('198.51.100.9', 'fresh@example.com')).allowed).toBe(true);
  });

  it('forgets attempts once the window has passed', async () => {
    const old = new Date(Date.now() - 120_000);
    for (let i = 0; i < 6; i++) await limiter.record(IP, 'a@example.com', false, old);

    // Both limits forget: the IP's six attempts and the address's six failures.
    expect((await limiter.check(IP, 'a@example.com')).allowed).toBe(true);
  });
});

describe('per-account limit', () => {
  it('locks an account after repeated failures from different hosts', async () => {
    // The threat the IP limit cannot see: one account, many hosts.
    for (let i = 0; i < 3; i++) {
      await limiter.record(`192.0.2.${String(i)}`, 'victim@example.com', false);
    }

    const verdict = await limiter.check('192.0.2.99', 'victim@example.com');
    expect(verdict.allowed).toBe(false);
    expect(verdict.scope).toBe('email');
  });

  it('counts only failures, so ordinary logins never lock an account', async () => {
    for (let i = 0; i < 10; i++) {
      await limiter.record(`192.0.2.${String(i)}`, 'busy@example.com', true);
    }

    expect((await limiter.check('192.0.2.200', 'busy@example.com')).allowed).toBe(true);
  });

  it('clears failures on success, so remembering your password unlocks you', async () => {
    await limiter.record('192.0.2.1', 'alice@example.com', false);
    await limiter.record('192.0.2.1', 'alice@example.com', false);
    await limiter.record('192.0.2.1', 'alice@example.com', true);

    expect((await limiter.check('192.0.2.9', 'alice@example.com')).allowed).toBe(true);
  });

  it('treats differently-cased addresses as one account', async () => {
    // Otherwise the lockout is bypassed by changing capitalisation.
    for (let i = 0; i < 3; i++) {
      await limiter.record(`192.0.2.${String(i)}`, 'Victim@Example.COM', false);
    }

    expect((await limiter.check('192.0.2.99', 'victim@example.com')).allowed).toBe(false);
  });

  it('does not lock a different account', async () => {
    for (let i = 0; i < 4; i++) await limiter.record('192.0.2.1', 'victim@example.com', false);

    expect((await limiter.check('198.51.100.1', 'other@example.com')).allowed).toBe(true);
  });

  it('applies the IP limit even when no email was supplied', async () => {
    for (let i = 0; i < 5; i++) await limiter.record(IP, undefined, false);

    expect((await limiter.check(IP, undefined)).allowed).toBe(false);
  });
});

describe('durability', () => {
  it('survives a restart, because the counters are in the database', async () => {
    // In-memory counters would reset here, and an attacker would only need to
    // wait for a deploy.
    for (let i = 0; i < 5; i++) await limiter.record(IP, `u${String(i)}@example.com`, false);

    const restarted = new AuthRateLimitService(
      cfg,
      new AuthAttemptRepository({ kysely: ctx.db } as DbService),
    );

    expect((await restarted.check(IP, 'fresh@example.com')).allowed).toBe(false);
  });
});

describe('retention', () => {
  it('prunes attempts older than the cutoff, and no others', async () => {
    await repo.record('ip', IP, false, new Date(Date.now() - 86_400_000 * 2));
    await repo.record('ip', IP, false);

    expect(await repo.pruneBefore(new Date(Date.now() - 86_400_000))).toBe(1);
    expect(await repo.countSince('ip', IP, new Date(0), false)).toBe(1);
  });
});
