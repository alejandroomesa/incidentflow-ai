import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', issues: err.issues });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'internal_server_error', message: 'Unexpected error' });
}
