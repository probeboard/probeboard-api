import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { toErrorResponse } from '../../../core/errors/http-mapping.js';

/**
 * Turns every thrown value into the same response shape. A thin adapter over
 * toErrorResponse(), which holds all the mapping logic and is tested directly.
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(ErrorFilter.name) private readonly logger: PinoLogger) {}

  catch(err: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();

    const { status, body, logDetail, isServerFault } = toErrorResponse(err);

    const fields = {
      status,
      code: body.code,
      method: req.method,
      path: req.url,
      cause: logDetail,
    };

    // Our fault or theirs decides the level: a 404 is not an incident, a 500
    // is. Neither is ever silently dropped.
    if (isServerFault) {
      this.logger.error(fields, 'request failed');
    } else {
      this.logger.warn(fields, 'request rejected');
    }

    res.status(status).json(body);
  }
}
