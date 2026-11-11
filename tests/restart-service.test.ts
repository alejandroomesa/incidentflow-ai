import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { restartService } from '../src/tools/restart-service.tool.js';
import { pool } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import type { RowDataPacket } from 'mysql2';

describe('restart-service tool', () => {
  const incidentId = 700001;

  beforeAll(async () => {
    await pool.query('SELECT 1');
    await pool.execute(
      `INSERT INTO incidents (id, company_name, source, description, status)
       VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
       ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
      [incidentId],
    );
  });

  afterAll(async () => {
    await pool.execute('DELETE FROM incidents WHERE id = ?', [incidentId]);
    await pool.end();
  });

  // Feature: auto-incident-resolution, Property 22: Ejecución de Acciones restart_service
  it('restarts a whitelisted service successfully', async () => {
    const serviceName = env.ALLOWED_SERVICES_TO_RESTART[0];
    const result = await restartService({ incidentId, serviceName });

    expect(result.success).toBe(true);
    expect(result.serviceName).toBe(serviceName);
    expect(result.newStatus).toBe('running');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('refuses to restart a service outside the whitelist', async () => {
    const result = await restartService({ incidentId, serviceName: 'definitely-not-allowed' });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('whitelist');
  });

  it('records service_restart_initiated and service_restart_success in the audit log', async () => {
    const serviceName = env.ALLOWED_SERVICES_TO_RESTART[0];
    await restartService({ incidentId, serviceName });

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT event FROM audit_logs WHERE incident_id = ? AND event IN ('service_restart_initiated', 'service_restart_success') ORDER BY created_at DESC LIMIT 2`,
      [incidentId],
    );

    const events = rows.map((r) => r.event);
    expect(events).toContain('service_restart_initiated');
    expect(events).toContain('service_restart_success');
  });
});
