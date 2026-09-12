import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import type { Pool } from 'pg';
import { config } from '../config';
import { createDb, createPool, type Db } from './database';

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly kysely: Db;
  private readonly pool: Pool;

  constructor(@InjectPinoLogger(DbService.name) private readonly logger: PinoLogger) {
    this.pool = createPool(config(), (msg, fields) => this.logger.error(fields, msg));
    this.kysely = createDb(this.pool);
  }

  async onModuleDestroy(): Promise<void> {
    await this.kysely.destroy();
  }
}
