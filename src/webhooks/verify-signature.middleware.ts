import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  // Extiende la interfaz Request de Express para incluir propiedades personalizadas
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      webhookDeliveryId?: string;
      webhookEvent?: string;
    }
  }
}

// Middleware para capturar el cuerpo sin procesar de la solicitud
export function captureRawBody(req: Request, _res: Response, buf: Buffer): void {
  req.rawBody = buf;
}

// Middleware para verificar la firma del webhook
export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  const signatureHeader = req.header('X-Webhook-Signature');
  const deliveryId = req.header('X-Webhook-Delivery');
  const eventType = req.header('X-Webhook-Event');

  if (!signatureHeader || !deliveryId || !eventType) {
    res.status(401).json({ error: 'missing_required_headers' });
    return;
  }

  const [algo, providedHex] = signatureHeader.split('=');
  if (algo !== 'sha256' || !providedHex || !/^[0-9a-f]+$/i.test(providedHex)) {
    res.status(401).json({ error: 'invalid_signature_format' });
    return;
  }

  const rawBody = req.rawBody ?? Buffer.alloc(0);
  const expectedHex = createHmac('sha256', env.WEBHOOK_SECRET).update(rawBody).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(providedHex, 'hex');

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    res.status(401).json({ error: 'invalid_signature' });
    return;
  }

  const timestamp = (req.body as { timestamp?: string })?.timestamp;
  const ageMs = timestamp ? Date.now() - new Date(timestamp).getTime() : NaN;
  const maxAgeMs = env.WEBHOOK_MAX_AGE_SECONDS * 1000;

  if (!timestamp || Number.isNaN(ageMs) || Math.abs(ageMs) > maxAgeMs) {
    res.status(401).json({ error: 'stale_or_missing_timestamp' });
    return;
  }

  req.webhookDeliveryId = deliveryId;
  req.webhookEvent = eventType;
  next();
}
