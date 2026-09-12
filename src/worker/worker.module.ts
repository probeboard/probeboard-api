import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { loggerOptions } from '../core/logging';
import { DbModule } from '../core/db/db.module';

/**
 * Probe worker. Same codebase as the API, different entrypoint and module set
 * (docs §7.1) so it can be scaled independently (NFR-7).
 *
 * Loops are added in M4 (scheduler), M5 (rollup), M6 (evaluator), M7 (dispatcher).
 */
@Module({
  imports: [LoggerModule.forRoot(loggerOptions('worker')), DbModule],
})
export class WorkerModule {}
