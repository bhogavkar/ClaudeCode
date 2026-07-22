import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Request validation middleware. Parses (and coerces) body/query/params with
 * the supplied Zod schemas, replacing the raw values with the validated result.
 * Validation failures are thrown as ZodError and shaped by the error handler.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query));
    if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
    next();
  };
}
