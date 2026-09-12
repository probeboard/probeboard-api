import { All, Controller } from '@nestjs/common';
import { NotFoundError } from '../../../core/errors/app-error.js';

/**
 * Catches every request no route matched.
 *
 * Without it Express answers with its own HTML error page, so a client that
 * mistypes a path gets markup from a JSON API. This module is imported last,
 * because Nest matches routes in registration order and a wildcard registered
 * earlier would shadow every real route.
 */
@Controller()
export class NotFoundController {
  @All('*splat')
  notFound(): never {
    throw new NotFoundError('route');
  }
}
