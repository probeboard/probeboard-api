import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../../core/errors/app-error.js';
import { NotFoundController } from './not-found.controller.js';

describe('NotFoundController', () => {
  it('throws a mapped NotFoundError rather than letting Express answer', () => {
    // Express's own 404 is an HTML page, which is the wrong content type for
    // a JSON API and carries no machine-readable code.
    expect(() => new NotFoundController().notFound()).toThrow(NotFoundError);
  });

  it('uses the code clients branch on', () => {
    try {
      new NotFoundController().notFound();
    } catch (err) {
      expect((err as NotFoundError).code).toBe('NOT_FOUND');
      expect((err as NotFoundError).status).toBe(404);
    }
  });
});
