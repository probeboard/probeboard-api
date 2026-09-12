import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors/app-error.js';
import { ZodValidationPipe, zodBody } from './zod-validation.pipe.js';

const schema = z.object({
  name: z.string().min(1),
  url: z.url(),
  intervalSeconds: z.coerce.number().int().min(30),
});

const meta = { type: 'body' as const, metatype: undefined, data: undefined };

describe('ZodValidationPipe', () => {
  it('returns the parsed value, with coercions applied', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(
      pipe.transform(
        { name: 'checkout', url: 'https://example.com/health', intervalSeconds: '60' },
        meta,
      ),
    ).toEqual({ name: 'checkout', url: 'https://example.com/health', intervalSeconds: 60 });
  });

  it('strips properties the schema does not declare', () => {
    // An unknown field must not reach a handler that might trust it.
    const pipe = new ZodValidationPipe(schema);
    const out = pipe.transform(
      {
        name: 'checkout',
        url: 'https://example.com',
        intervalSeconds: 60,
        isAdmin: true,
      },
      meta,
    );
    expect(out).not.toHaveProperty('isAdmin');
  });

  it('throws a ValidationError naming every bad field, not just the first', () => {
    const pipe = new ZodValidationPipe(schema);
    const thrown = (() => {
      try {
        pipe.transform({ name: '', url: 'not-a-url', intervalSeconds: 5 }, meta);
      } catch (e) {
        return e;
      }
    })();

    expect(thrown).toBeInstanceOf(ValidationError);
    const details = (thrown as ValidationError).details as { path: string }[];
    expect(details.map((d) => d.path).sort()).toEqual(['intervalSeconds', 'name', 'url']);
  });

  it('labels a whole-object failure as (root)', () => {
    const pipe = new ZodValidationPipe(z.object({ a: z.string() }));
    const thrown = (() => {
      try {
        pipe.transform('not an object', meta);
      } catch (e) {
        return e;
      }
    })();
    expect(((thrown as ValidationError).details as { path: string }[])[0]?.path).toBe('(root)');
  });

  it('zodBody builds the same pipe', () => {
    expect(zodBody(schema)).toBeInstanceOf(ZodValidationPipe);
  });
});
