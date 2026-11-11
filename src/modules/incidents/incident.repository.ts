import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import type { CreateIncidentInput } from './incident.schema.js';

export type IncidentStatus =
  | 'pending'
  | 'analyzing'
  | 'classified'
  | 'action_pending'
  | 'resolved'
  | 'rejected'
  | 'requiring_approval'
  | 'failed';

export interface IncidentRow extends RowDataPacket {
  id: number;
  external_id: string | null;
  company_name: string;
  source: string;
  description: string;
  reported_by: string | null;
  category: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  confidence: number | null;
  status: IncidentStatus;
  requires_human_review: number;
  created_at: string;
  updated_at: string;
}

export const incidentRepository = {
  async create(input: CreateIncidentInput): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO incidents (external_id, company_name, source, description, reported_by)
       VALUES (?, ?, ?, ?, ?)`,
      [input.externalId ?? null, input.company, input.source, input.description, input.reportedBy ?? null],
    );
    return result.insertId;
  },

  async findAll(): Promise<IncidentRow[]> {
    const [rows] = await pool.query<IncidentRow[]>('SELECT * FROM incidents ORDER BY created_at DESC');
    return rows;
  },

  async findById(id: number): Promise<IncidentRow | null> {
    const [rows] = await pool.execute<IncidentRow[]>('SELECT * FROM incidents WHERE id = ?', [id]);
    return rows[0] ?? null;
  },

  async updateStatus(id: number, status: IncidentStatus): Promise<void> {
    await pool.execute('UPDATE incidents SET status = ? WHERE id = ?', [status, id]);
  },

  async markResolved(id: number, resolvedAt: Date): Promise<void> {
    await pool.execute(
      `UPDATE incidents SET status = 'resolved', resolved_at = ? WHERE id = ?`,
      [resolvedAt, id],
    );
  },

  async updateClassification(
    id: number,
    fields: {
      category: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      confidence: number;
      requiresHumanReview: boolean;
      status: IncidentStatus;
    },
  ): Promise<void> {
    await pool.execute(
      `UPDATE incidents
       SET category = ?, severity = ?, confidence = ?, requires_human_review = ?, status = ?
       WHERE id = ?`,
      [fields.category, fields.severity, fields.confidence, fields.requiresHumanReview, fields.status, id],
    );
  },
};

export interface AgentRunRow extends RowDataPacket {
  id: number;
  incident_id: number;
  provider: string;
  model: string;
  input_hash: string;
  structured_output: unknown;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export const agentRunRepository = {
  async findLatestCompletedByIncident(incidentId: number): Promise<AgentRunRow | null> {
    const [rows] = await pool.execute<AgentRunRow[]>(
      `SELECT * FROM agent_runs
       WHERE incident_id = ? AND status = 'completed'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [incidentId],
    );
    return rows[0] ?? null;
  },

  async insertCompleted(
    incidentId: number,
    fields: { provider: string; model: string; inputHash: string; structuredOutput: unknown; durationMs: number },
  ): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO agent_runs (incident_id, provider, model, input_hash, structured_output, status, duration_ms)
       VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
      [incidentId, fields.provider, fields.model, fields.inputHash, JSON.stringify(fields.structuredOutput), fields.durationMs],
    );
    return result.insertId;
  },

  async insertFailed(
    incidentId: number,
    fields: { provider: string; model: string; inputHash: string; errorMessage: string },
  ): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO agent_runs (incident_id, provider, model, input_hash, status, error_message)
       VALUES (?, ?, ?, ?, 'failed', ?)`,
      [incidentId, fields.provider, fields.model, fields.inputHash, fields.errorMessage],
    );
    return result.insertId;
  },
};

export interface ProposedActionRow extends RowDataPacket {
  id: number;
  incident_id: number;
  agent_run_id: number | null;
  action_type: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  parameters: unknown;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  approved_by: string | null;
  approved_at: string | null;
  executed_at: string | null;
  created_at: string;
}

export const proposedActionRepository = {
  async insert(
    incidentId: number,
    agentRunId: number,
    action: { type: string; title: string; priority: 'low' | 'medium' | 'high' | 'urgent'; parameters: Record<string, unknown> },
  ): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO proposed_actions (incident_id, agent_run_id, action_type, title, priority, parameters)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [incidentId, agentRunId, action.type, action.title, action.priority, JSON.stringify(action.parameters)],
    );
    return result.insertId;
  },

  async findAllByIncident(incidentId: number): Promise<ProposedActionRow[]> {
    const [rows] = await pool.execute<ProposedActionRow[]>(
      'SELECT * FROM proposed_actions WHERE incident_id = ? ORDER BY created_at ASC',
      [incidentId],
    );
    return rows;
  },

  async findById(actionId: number): Promise<ProposedActionRow | null> {
    const [rows] = await pool.execute<ProposedActionRow[]>('SELECT * FROM proposed_actions WHERE id = ?', [actionId]);
    return rows[0] ?? null;
  },

  async markApproved(actionId: number, approvedBy: string): Promise<void> {
    await pool.execute(
      `UPDATE proposed_actions SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?`,
      [approvedBy, actionId],
    );
  },

  async markRejected(actionId: number): Promise<void> {
    await pool.execute(`UPDATE proposed_actions SET status = 'rejected' WHERE id = ?`, [actionId]);
  },

  async markExecuted(actionId: number): Promise<void> {
    await pool.execute(`UPDATE proposed_actions SET status = 'executed', executed_at = NOW() WHERE id = ?`, [actionId]);
  },

  async markFailed(actionId: number): Promise<void> {
    await pool.execute(`UPDATE proposed_actions SET status = 'failed' WHERE id = ?`, [actionId]);
  },
};
