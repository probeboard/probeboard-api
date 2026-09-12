import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { loggerOptions } from '../core/logging.js';
import { DbModule } from '../core/db/db.module.js';
import { HealthController } from './health/health.controller.js';

/** HTTP API. Never probes — that is the worker's job (docs §7.1). */
@Module({
  imports: [LoggerModule.forRoot(loggerOptions('api')), DbModule],
  controllers: [HealthController],
})
export class AppModule {}
