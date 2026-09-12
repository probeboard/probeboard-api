import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { loggerOptions } from '../core/logging';
import { DbModule } from '../core/db/db.module';
import { HealthController } from './health/health.controller';

/** HTTP API. Never probes — that is the worker's job (docs §7.1). */
@Module({
  imports: [LoggerModule.forRoot(loggerOptions('api')), DbModule],
  controllers: [HealthController],
})
export class AppModule {}
