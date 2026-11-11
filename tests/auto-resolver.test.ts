import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fc from 'fast-check';
import { resolveIncident } from '../src/auto-resolution/auto-resolver.service.js';
import { protocolManager } from '../src/modules/protocols/protocol-manager.service.js';
import { pool } from '../src/config/database.js';
import type { RowDataPacket } from 'mysql2';

const ALL_CATEGORIES = [
  'unauthorized_access',
  'data_breach_external_disclosure',
  'improper_data_sharing',
  'data_loss_destruction',
  'phishing_social_engineering',
  'system_misconfiguration',
  'physical_security',
  'other',
] as const;

async function insertTestIncident(id: number): Promise<void> {
  await pool.execute(
    `INSERT INTO incidents (id, company_name, source, description, status)
     VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
     ON DUPLICATE KEY UPDATE status = 'classified', resolved_at = NULL`,
    [id],
  );
}

describe('Auto Resolver - Property Tests', () => {
  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    await pool.execute('DELETE FROM auto_resolutions WHERE incident_id BETWEEN 710000 AND 719999');
    await pool.execute('DELETE FROM incidents WHERE id BETWEEN 710000 AND 719999');
  });

  // Feature: auto-incident-resolution, Property 3: Auto-resolución de bajo riesgo
  // Feature: auto-incident-resolution, Property 4: Recuperación de protocolo por categoría (o el default "other")
  // Feature: auto-incident-resolution, Property 5: Ejecución secuencial de acciones respetando dependencias
  // Feature: auto-incident-resolution, Property 6: Timestamp de resolución
  // Feature: auto-incident-resolution, Property 24: Continuación con acciones exitosas
  it('resolves any valid category, in dependency order, and stamps resolved_at', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_CATEGORIES),
        fc.integer({ min: 710000, max: 719999 }),
        async (category, incidentId) => {
          await insertTestIncident(incidentId);

          const result = await resolveIncident({ incidentId, category });

          expect(result.status).toBe('resolved');
          expect(result.executedActions.length).toBeGreaterThan(0);
          expect(result.executedActions.every((a) => a.result === 'success')).toBe(true);
          // The default protocols are create_task -> notify_consultant, with the
          // second step depending on the first, so batches execute in that order.
          expect(result.executedActions[0].actionType).toBe('create_task');
          if (result.executedActions.length > 1) {
            expect(result.executedActions[1].actionType).toBe('notify_consultant');
            expect(result.executedActions[1].executedAt.getTime()).toBeGreaterThanOrEqual(
              result.executedActions[0].executedAt.getTime(),
            );
          }

          const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT status, resolved_at FROM incidents WHERE id = ?',
            [incidentId],
          );
          expect(rows[0].status).toBe('resolved');
          expect(rows[0].resolved_at).not.toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  }, 60000);
});

describe('Auto Resolver - Unit Tests', () => {
  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    await pool.execute('DELETE FROM auto_resolutions WHERE incident_id BETWEEN 720000 AND 720999');
    await pool.execute('DELETE FROM incidents WHERE id BETWEEN 720000 AND 720999');
    await pool.execute("DELETE FROM protocols WHERE name LIKE 'TEST_%'");
    await pool.end();
  });

  it('marks the incident as requiring_approval when no protocol exists at all, even "other"', async () => {
    const incidentId = 720001;
    await insertTestIncident(incidentId);

    const spy = vi.spyOn(protocolManager, 'getByCategory').mockResolvedValueOnce(null);
    try {
      const result = await resolveIncident({ incidentId, category: 'other' });

      expect(result.status).toBe('failed');
      expect(result.executedActions).toHaveLength(0);

      const [rows] = await pool.execute<RowDataPacket[]>('SELECT status FROM incidents WHERE id = ?', [incidentId]);
      expect(rows[0].status).toBe('requiring_approval');
    } finally {
      spy.mockRestore();
    }
  });

  it('stops before later batches and marks the incident failed when a step errors', async () => {
    const incidentId = 720002;
    await insertTestIncident(incidentId);

    // data_breach_external_disclosure has no seeded protocol; create a throwaway
    // one whose first step always fails (service outside the restart whitelist)
    // so we can verify failure semantics without touching the real default protocols.
    const protocolId = await protocolManager.create({
      category: 'data_breach_external_disclosure',
      version: '1.0.0',
      name: 'TEST_Failing_Protocol',
      description: 'Temporary protocol for failure-path testing',
      steps: [
        {
          order: 0,
          actionType: 'restart_service',
          title: 'Restart disallowed service',
          parameters: { serviceName: 'not-on-the-whitelist' },
        },
        {
          order: 1,
          actionType: 'create_task',
          title: 'Should never run',
          parameters: { priority: 'high' },
          dependencies: [0],
        },
      ],
      conditions: [],
      isActive: true,
    });

    try {
      const result = await resolveIncident({ incidentId, category: 'data_breach_external_disclosure' });

      expect(result.status).toBe('failed');
      expect(result.failedAction?.stepIndex).toBe(0);
      // Only the failing step ran; the dependent step 1 never started.
      expect(result.executedActions).toHaveLength(1);
      expect(result.executedActions[0].result).toBe('error');

      const [rows] = await pool.execute<RowDataPacket[]>('SELECT status FROM incidents WHERE id = ?', [incidentId]);
      expect(rows[0].status).toBe('failed');

      const [resolutions] = await pool.execute<RowDataPacket[]>(
        'SELECT status, failed_action_index FROM auto_resolutions WHERE incident_id = ?',
        [incidentId],
      );
      expect(resolutions).toHaveLength(1);
      expect(resolutions[0].status).toBe('failed');
      expect(resolutions[0].failed_action_index).toBe(0);
    } finally {
      await protocolManager.delete(protocolId);
    }
  }, 15000);
});
