import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'kysely';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { describeError } from '../../core/errors/describe.js';
import { DbService } from '../../core/db/db.service.js';

@Controller()
export class HealthController {
  constructor(
    private readonly db: DbService,
    @InjectPinoLogger(HealthController.name) private readonly logger: PinoLogger,
  ) {}

  /** Liveness: the process is running. Deliberately touches no dependency. */
  @Get('healthz')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: the process can actually serve traffic. */
  @Get('readyz')
  async ready(): Promise<{ status: 'ok'; database: 'ok' }> {
    try {
      await sql`SELECT 1`.execute(this.db.kysely);
    } catch (err) {
      // Log the cause, return only a stable code. The detail is useful to an
      // operator and is not something to hand to an unauthenticated caller.
      this.logger.error({ cause: describeError(err) }, 'readiness check failed');
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'database is not reachable',
      });
    }
    return { status: 'ok', database: 'ok' };
  }
}
