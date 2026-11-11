import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

export function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  if (!env.ADMIN_TOKEN) {
    res.status(503).json({ error: 'admin_disabled', message: 'Admin access is not configured' });
    return;
  }

  const authorization = req.header('authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expected = Buffer.from(env.ADMIN_TOKEN, 'utf8');
  const supplied = Buffer.from(suppliedToken, 'utf8');
  const valid = expected.length === supplied.length && timingSafeEqual(expected, supplied);

  if (!valid) {
    res.status(401).json({ error: 'admin_unauthorized', message: 'Invalid admin credentials' });
    return;
  }

  next();
}
