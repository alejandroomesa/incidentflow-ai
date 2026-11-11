import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

const app = createApp();

function sign(body: string, secret = env.WEBHOOK_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    company: 'Empresa Demo SL',
    description: 'Un empleado ha compartido datos de clientes con un tercero no autorizado.',
    reportedBy: 'Departamento de IT',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('POST /api/webhooks/incidents — signature verification', () => {
  it('accepts a validly signed, fresh request', async () => {
    const body = JSON.stringify(basePayload());
    const res = await request(app)
      .post('/api/webhooks/incidents')
      .set('X-Webhook-Signature', sign(body))
      .set('X-Webhook-Delivery', randomUUID())
      .set('X-Webhook-Event', 'incident.created')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('pending');
  });

  it('rejects a request with no signature header', async () => {
    const body = JSON.stringify(basePayload());
    const res = await request(app)
      .post('/api/webhooks/incidents')
      .set('X-Webhook-Delivery', randomUUID())
      .set('X-Webhook-Event', 'incident.created')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
  });

  it('rejects a request with an invalid/tampered signature', async () => {
    const body = JSON.stringify(basePayload());
    const res = await request(app)
      .post('/api/webhooks/incidents')
      .set('X-Webhook-Signature', sign(body, 'wrong-secret'))
      .set('X-Webhook-Delivery', randomUUID())
      .set('X-Webhook-Event', 'incident.created')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_signature');
  });

  it('rejects a request whose body was tampered with after signing', async () => {
    const signedBody = JSON.stringify(basePayload({ company: 'Original Co' }));
    const signature = sign(signedBody);
    const tamperedBody = JSON.stringify(basePayload({ company: 'Tampered Co' }));

    const res = await request(app)
      .post('/api/webhooks/incidents')
      .set('X-Webhook-Signature', signature)
      .set('X-Webhook-Delivery', randomUUID())
      .set('X-Webhook-Event', 'incident.created')
      .set('Content-Type', 'application/json')
      .send(tamperedBody);

    expect(res.status).toBe(401);
  });

  it('rejects a stale timestamp beyond the max age window', async () => {
    const body = JSON.stringify(basePayload({ timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString() }));
    const res = await request(app)
      .post('/api/webhooks/incidents')
      .set('X-Webhook-Signature', sign(body))
      .set('X-Webhook-Delivery', randomUUID())
      .set('X-Webhook-Event', 'incident.created')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('stale_or_missing_timestamp');
  });

  it('does not reprocess a replayed delivery id', async () => {
    const deliveryId = randomUUID();
    const body = JSON.stringify(basePayload());

    const first = await request(app)
      .post('/api/webhooks/incidents')
      .set('X-Webhook-Signature', sign(body))
      .set('X-Webhook-Delivery', deliveryId)
      .set('X-Webhook-Event', 'incident.created')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(first.status).toBe(202);

    const replay = await request(app)
      .post('/api/webhooks/incidents')
      .set('X-Webhook-Signature', sign(body))
      .set('X-Webhook-Delivery', deliveryId)
      .set('X-Webhook-Event', 'incident.created')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(replay.status).toBe(200);
    expect(replay.body.status).toBe('already_processed');
  });
});
