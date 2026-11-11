import type { NextFunction, Request, Response } from 'express';
import type { ResultSetHeader } from 'mysql2';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { auditService } from '../audit/audit.service.js';
import { incidentService } from '../modules/incidents/incident.service.js';

// Define el esquema de validación para la carga útil del webhook de incidentes
const WebhookIncidentPayloadSchema = z.object({
  company: z.string().min(1).max(255),
  description: z.string().min(10).max(10000),
  reportedBy: z.string().max(255).nullable().optional(),
  externalId: z.string().max(100).nullable().optional(),
  timestamp: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

interface DuplicateKeyError {
  code?: string;
}

// Comprueba si el error es un error de clave duplicada (ER_DUP_ENTRY)
function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as DuplicateKeyError).code === 'ER_DUP_ENTRY';
}

// Controlador para manejar los webhooks entrantes relacionados con incidentes
export const webhookController = {
  async handleIncidentWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = WebhookIncidentPayloadSchema.parse(req.body);
      const deliveryId = req.webhookDeliveryId!;
      const eventType = req.webhookEvent!;

      try {
        await pool.execute<ResultSetHeader>(
          'INSERT INTO webhook_deliveries (delivery_id, event_type) VALUES (?, ?)',
          [deliveryId, eventType],
        );
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          res.status(200).json({ status: 'already_processed' });
          return;
        }
        throw err;
      }

      const incident = await incidentService.createIncident({
        company: payload.company,
        source: 'webhook',
        description: payload.description,
        reportedBy: payload.reportedBy ?? null,
        externalId: payload.externalId ?? null,
      });

      await pool.execute('UPDATE webhook_deliveries SET incident_id = ? WHERE delivery_id = ?', [
        incident.id,
        deliveryId,
      ]);

      await auditService.record({
        incidentId: incident.id,
        event: 'incident_received_via_webhook',
        actorType: 'system',
        metadata: { deliveryId, eventType },
      });

      res.status(202).json({ incidentId: incident.id, status: incident.status });
    } catch (err) {
      next(err);
    }
  },
};
