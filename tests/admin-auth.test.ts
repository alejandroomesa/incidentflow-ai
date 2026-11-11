import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireAdminToken } from '../src/admin/admin-auth.middleware.js';
import { env } from '../src/config/env.js';

const originalAdminToken = env.ADMIN_TOKEN;

function createResponse() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { response: { status } as unknown as Response, status, json };
}

function createRequest(authorization?: string) {
  return {
    header: vi.fn((name: string) => name.toLowerCase() === 'authorization' ? authorization : undefined),
  } as unknown as Request;
}

afterEach(() => {
  env.ADMIN_TOKEN = originalAdminToken;
});

describe('admin authentication', () => {
  it('allows a request with the configured bearer token', () => {
    env.ADMIN_TOKEN = 'private-admin-token-with-24-chars';
    const { response, status } = createResponse();
    const next = vi.fn() as NextFunction;

    requireAdminToken(createRequest(`Bearer ${env.ADMIN_TOKEN}`), response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it('rejects a request with an invalid token', () => {
    env.ADMIN_TOKEN = 'private-admin-token-with-24-chars';
    const { response, status, json } = createResponse();
    const next = vi.fn() as NextFunction;

    requireAdminToken(createRequest('Bearer invalid-admin-token-value'), response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'admin_unauthorized' }));
  });

  it('keeps cleanup disabled when no admin token is configured', () => {
    env.ADMIN_TOKEN = undefined;
    const { response, status, json } = createResponse();
    const next = vi.fn() as NextFunction;

    requireAdminToken(createRequest(), response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'admin_disabled' }));
  });
});
