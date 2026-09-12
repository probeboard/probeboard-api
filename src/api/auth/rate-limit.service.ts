import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../core/config/config.module.js';
import type { AppConfig } from '../../core/config/schema.js';
import { normalizeEmail } from '../../core/users/email.js';
import { AuthAttemptRepository } from './rate-limit.repository.js';

export interface RateLimitVerdict {
  allowed: boolean;
  /** Which limit rejected it, for the log. Never returned to the caller. */
  scope?: 'ip' | 'email';
  retryAfterSeconds: number;
}

/**
 * Authentication rate limiting (NFR-14, A-6).
 *
 * Two limits, because A-6 describes two different threats:
 *
 * - **by IP**, counting every attempt, against one host hammering the endpoint.
 * - **by email**, counting only failures, against credential stuffing at one
 *   account from many hosts. An attacker with a botnet defeats the IP limit
 *   entirely, and this is the one that stops them.
 *
 * Counters live in PostgreSQL rather than in memory, so they survive a restart
 * — otherwise an attacker simply waits for a deploy — and so a second api
 * instance shares them. That is also why `@nestjs/throttler` was not used: its
 * default storage is in-process, and writing a Postgres backend for it is the
 * same work as this.
 */
@Injectable()
export class AuthRateLimitService {
  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly attempts: AuthAttemptRepository,
  ) {}

  private windowStart(now: Date): Date {
    return new Date(now.getTime() - this.cfg.AUTH_WINDOW_MS);
  }

  private get retryAfterSeconds(): number {
    return Math.ceil(this.cfg.AUTH_WINDOW_MS / 1000);
  }

  /**
   * Checked before the password is verified, so a locked-out attacker cannot
   * make us spend an Argon2 verification per attempt.
   */
  async check(
    ip: string,
    email: string | undefined,
    now: Date = new Date(),
  ): Promise<RateLimitVerdict> {
    const since = this.windowStart(now);

    const fromIp = await this.attempts.countSince('ip', ip, since, false);
    if (fromIp >= this.cfg.AUTH_MAX_PER_IP) {
      return { allowed: false, scope: 'ip', retryAfterSeconds: this.retryAfterSeconds };
    }

    if (email !== undefined) {
      const failures = await this.attempts.countSince('email', normalizeEmail(email), since, true);
      if (failures >= this.cfg.AUTH_MAX_FAILURES_PER_EMAIL) {
        return { allowed: false, scope: 'email', retryAfterSeconds: this.retryAfterSeconds };
      }
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  /**
   * Records the outcome.
   *
   * A success clears the account's failures so someone who finally remembers
   * their password is not still locked out — but does **not** clear the IP
   * counter, because one success among many attempts is exactly what a
   * successful credential-stuffing run looks like.
   */
  async record(
    ip: string,
    email: string | undefined,
    succeeded: boolean,
    now: Date = new Date(),
  ): Promise<void> {
    await this.attempts.record('ip', ip, succeeded, now);

    if (email === undefined) return;

    const normalized = normalizeEmail(email);
    if (succeeded) {
      await this.attempts.clear('email', normalized);
    } else {
      await this.attempts.record('email', normalized, false, now);
    }
  }
}
