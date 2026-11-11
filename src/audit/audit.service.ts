import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

// Servicio de auditoría para registrar y recuperar eventos de auditoría relacionados con incidentes
export type ActorType = 'system' | 'ai_agent' | 'human';

export interface AuditEventInput {
  incidentId: number | null;
  event: string;
  actorType: ActorType;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditLogRow extends RowDataPacket {
  id: number;
  incident_id: number | null;
  event: string;
  actor_type: ActorType;
  actor_id: string | null;
  metadata: unknown;
  created_at: string;
}

export const auditService = {
  async record(input: AuditEventInput): Promise<void> {
    await pool.execute<ResultSetHeader>(
      `INSERT INTO audit_logs (incident_id, event, actor_type, actor_id, metadata) VALUES (?, ?, ?, ?, ?)`,
      [input.incidentId, input.event, input.actorType, input.actorId ?? null, JSON.stringify(input.metadata ?? {})],
    );
  },

  async findByIncident(incidentId: number): Promise<AuditLogRow[]> {
    const [rows] = await pool.execute<AuditLogRow[]>(
      'SELECT * FROM audit_logs WHERE incident_id = ? ORDER BY created_at ASC',
      [incidentId],
    );
    return rows;
  },
};
