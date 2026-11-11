import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fc from 'fast-check';
import { evaluateRisk, getRiskEvaluation } from '../src/ai/risk-evaluator.service.js';
import { pool } from '../src/config/database.js';
import type { RiskEvaluatorInput } from '../src/ai/risk-evaluator.schema.js';

// Mock audit service to avoid database dependencies in tests
vi.mock('../src/audit/audit.service.js', () => ({
  auditService: {
    record: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Risk Evaluator - Property Tests', () => {
  beforeAll(async () => {
    // Ensure database connection is ready
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    // Clean up test data. Pool is shared with the "Unit Tests" describe below and
    // closed once at the very end of the file, not here.
    // Bounded to this file's own generator range (900000-999999) -- test files run
    // concurrently, so an unbounded ">= 900000" would race with other suites' data.
    await pool.execute('DELETE FROM risk_evaluations WHERE incident_id BETWEEN 900000 AND 999999');
    await pool.execute('DELETE FROM incidents WHERE id BETWEEN 900000 AND 999999');
  });

  // Feature: auto-incident-resolution, Property 1: Validación de risk_level del Agente
  // Para cualquier salida válida del Incident Agent, el campo risk_level debe ser uno de los valores válidos: "low", "medium", o "high"
  it('should always return a valid risk_level (low/medium/high)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          category: fc.constantFrom(
            'unauthorized_access',
            'data_breach_external_disclosure',
            'improper_data_sharing',
            'data_loss_destruction',
            'phishing_social_engineering',
            'system_misconfiguration',
            'physical_security',
            'other'
          ),
          severity: fc.constantFrom('low', 'medium', 'high', 'critical'),
          confidence: fc.float({ min: 0, max: 1 }),
        }),
        fc.integer({ min: 900000, max: 999999 }),
        async (input: RiskEvaluatorInput, incidentId: number) => {
          // Create test incident
          await pool.execute(
            `INSERT INTO incidents (id, company_name, source, description, status) 
             VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
             ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
            [incidentId]
          );

          const result = await evaluateRisk(incidentId, input);

          // Verify risk_level is one of the valid values
          expect(result.riskLevel).toMatch(/^(low|medium|high)$/);
          expect(['low', 'medium', 'high']).toContain(result.riskLevel);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: auto-incident-resolution, Property 2: Justificación de Riesgo Obligatoria
  // Para cualquier incidencia analizada por el agente, la evaluación de riesgo debe contener un campo rationale no vacío que explique la clasificación
  it('should always return non-empty rationale explaining the classification', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          category: fc.constantFrom(
            'unauthorized_access',
            'data_breach_external_disclosure',
            'improper_data_sharing',
            'data_loss_destruction',
            'phishing_social_engineering',
            'system_misconfiguration',
            'physical_security',
            'other'
          ),
          severity: fc.constantFrom('low', 'medium', 'high', 'critical'),
          confidence: fc.float({ min: 0, max: 1 }),
          metadata: fc.option(
            fc.record({
              affectedUsers: fc.option(fc.integer({ min: 0, max: 10000 })),
              dataVolume: fc.option(fc.constantFrom('small', 'medium', 'large', 'critical')),
            }),
            { nil: undefined }
          ),
        }),
        fc.integer({ min: 900000, max: 999999 }),
        async (input: RiskEvaluatorInput, incidentId: number) => {
          // Create test incident
          await pool.execute(
            `INSERT INTO incidents (id, company_name, source, description, status) 
             VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
             ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
            [incidentId]
          );

          const result = await evaluateRisk(incidentId, input);

          // Verify rationale is non-empty
          expect(result.rationale).toBeTruthy();
          expect(result.rationale.length).toBeGreaterThan(0);
          expect(typeof result.rationale).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property: Risk evaluation should be consistent for same inputs
  it('should return consistent results for identical inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          category: fc.constantFrom(
            'unauthorized_access',
            'data_breach_external_disclosure',
            'improper_data_sharing'
          ),
          severity: fc.constantFrom('low', 'medium', 'high', 'critical'),
          confidence: fc.float({ min: 0, max: 1 }),
        }),
        fc.integer({ min: 900000, max: 999999 }),
        async (input: RiskEvaluatorInput, baseIncidentId: number) => {
          const incidentId1 = baseIncidentId;
          const incidentId2 = baseIncidentId + 100000;

          // Create two test incidents
          await pool.execute(
            `INSERT INTO incidents (id, company_name, source, description, status) 
             VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
             ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
            [incidentId1]
          );
          await pool.execute(
            `INSERT INTO incidents (id, company_name, source, description, status) 
             VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
             ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
            [incidentId2]
          );

          const result1 = await evaluateRisk(incidentId1, input);
          const result2 = await evaluateRisk(incidentId2, input);

          // Same input should produce same risk level
          expect(result1.riskLevel).toBe(result2.riskLevel);
          expect(result1.rationale).toBe(result2.rationale);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Property: Factors array should always be present
  it('should always return a factors array', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          category: fc.constantFrom(
            'unauthorized_access',
            'data_breach_external_disclosure',
            'improper_data_sharing'
          ),
          severity: fc.constantFrom('low', 'medium', 'high', 'critical'),
          confidence: fc.float({ min: 0, max: 1 }),
        }),
        fc.integer({ min: 900000, max: 999999 }),
        async (input: RiskEvaluatorInput, incidentId: number) => {
          await pool.execute(
            `INSERT INTO incidents (id, company_name, source, description, status) 
             VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
             ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
            [incidentId]
          );

          const result = await evaluateRisk(incidentId, input);

          expect(Array.isArray(result.factors)).toBe(true);
          expect(result.factors.length).toBeGreaterThan(0);

          // Each factor should have required properties
          result.factors.forEach((factor) => {
            expect(factor).toHaveProperty('name');
            expect(factor).toHaveProperty('value');
            expect(factor).toHaveProperty('weight');
            expect(typeof factor.name).toBe('string');
            expect(typeof factor.weight).toBe('number');
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Risk Evaluator - Unit Tests', () => {
  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    // Bounded to this describe's own hardcoded incident ids (800001-800010).
    await pool.execute('DELETE FROM risk_evaluations WHERE incident_id BETWEEN 800000 AND 800999');
    await pool.execute('DELETE FROM incidents WHERE id BETWEEN 800000 AND 800999');
    await pool.end();
  });

  // Unit test: alta severidad debe ser high risk
  it('should classify critical severity with sensitive category as high risk', async () => {
    const incidentId = 800001;
    await pool.execute(
      `INSERT INTO incidents (id, company_name, source, description, status) 
       VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
       ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
      [incidentId]
    );

    const input: RiskEvaluatorInput = {
      category: 'data_breach_external_disclosure',
      severity: 'critical',
      confidence: 0.9,
    };

    const result = await evaluateRisk(incidentId, input);

    expect(result.riskLevel).toBe('high');
    expect(result.rationale).toContain('High risk');

    // Verify it was stored in database
    const stored = await getRiskEvaluation(incidentId);
    expect(stored).not.toBeNull();
    expect(stored?.riskLevel).toBe('high');
  });

  // Unit test: baja confianza (<0.6) aumenta risk score
  it('should increase risk score for low confidence (<0.6)', async () => {
    const incidentId = 800002;
    await pool.execute(
      `INSERT INTO incidents (id, company_name, source, description, status) 
       VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
       ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
      [incidentId]
    );

    const lowConfidenceInput: RiskEvaluatorInput = {
      category: 'system_misconfiguration',
      severity: 'low',
      confidence: 0.5, // Low confidence
    };

    const result = await evaluateRisk(incidentId, lowConfidenceInput);

    // Low confidence should add weight to factors
    const confidenceFactor = result.factors.find((f) => f.name === 'low_confidence');
    expect(confidenceFactor).toBeDefined();
    expect(confidenceFactor?.weight).toBe(20);
  });

  // Unit test: medium confidence (0.6-0.8) adds moderate weight
  it('should add moderate weight for medium confidence (0.6-0.8)', async () => {
    const incidentId = 800003;
    await pool.execute(
      `INSERT INTO incidents (id, company_name, source, description, status) 
       VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
       ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
      [incidentId]
    );

    const mediumConfidenceInput: RiskEvaluatorInput = {
      category: 'system_misconfiguration',
      severity: 'low',
      confidence: 0.7, // Medium confidence
    };

    const result = await evaluateRisk(incidentId, mediumConfidenceInput);

    const confidenceFactor = result.factors.find((f) => f.name === 'medium_confidence');
    expect(confidenceFactor).toBeDefined();
    expect(confidenceFactor?.weight).toBe(10);
  });

  // Unit test: low severity with non-sensitive category should be low risk
  it('should classify low severity with non-sensitive category as low risk', async () => {
    const incidentId = 800004;
    await pool.execute(
      `INSERT INTO incidents (id, company_name, source, description, status) 
       VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
       ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
      [incidentId]
    );

    const input: RiskEvaluatorInput = {
      category: 'system_misconfiguration',
      severity: 'low',
      confidence: 0.9,
    };

    const result = await evaluateRisk(incidentId, input);

    expect(result.riskLevel).toBe('low');
    expect(result.rationale).toContain('Low risk');
  });

  // Unit test: medium severity should result in medium risk
  it('should classify medium severity with moderate category as medium risk', async () => {
    const incidentId = 800005;
    await pool.execute(
      `INSERT INTO incidents (id, company_name, source, description, status) 
       VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
       ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
      [incidentId]
    );

    const input: RiskEvaluatorInput = {
      category: 'improper_data_sharing',
      severity: 'medium',
      confidence: 0.8,
    };

    const result = await evaluateRisk(incidentId, input);

    expect(result.riskLevel).toBe('medium');
    expect(result.rationale).toContain('Medium risk');
  });

  // Unit test: metadata with many affected users increases risk
  it('should increase risk score when many users are affected (>100)', async () => {
    const incidentId = 800006;
    await pool.execute(
      `INSERT INTO incidents (id, company_name, source, description, status) 
       VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
       ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
      [incidentId]
    );

    const input: RiskEvaluatorInput = {
      category: 'improper_data_sharing',
      severity: 'medium',
      confidence: 0.8,
      metadata: {
        affectedUsers: 150,
      },
    };

    const result = await evaluateRisk(incidentId, input);

    const usersFactor = result.factors.find((f) => f.name === 'many_affected_users');
    expect(usersFactor).toBeDefined();
    expect(usersFactor?.weight).toBe(15);
    expect(usersFactor?.value).toBe(150);
  });

  // Unit test: metadata with large data volume increases risk
  it('should increase risk score for large data volume', async () => {
    const incidentId = 800007;
    await pool.execute(
      `INSERT INTO incidents (id, company_name, source, description, status) 
       VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
       ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
      [incidentId]
    );

    const input: RiskEvaluatorInput = {
      category: 'data_loss_destruction',
      severity: 'medium',
      confidence: 0.8,
      metadata: {
        dataVolume: 'large',
      },
    };

    const result = await evaluateRisk(incidentId, input);

    const volumeFactor = result.factors.find((f) => f.name === 'large_data_volume');
    expect(volumeFactor).toBeDefined();
    expect(volumeFactor?.weight).toBe(10);
  });

  // Unit test: getRiskEvaluation retrieves stored evaluation
  it('should retrieve stored risk evaluation from database', async () => {
    const incidentId = 800008;
    await pool.execute(
      `INSERT INTO incidents (id, company_name, source, description, status) 
       VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
       ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
      [incidentId]
    );

    const input: RiskEvaluatorInput = {
      category: 'phishing_social_engineering',
      severity: 'high',
      confidence: 0.85,
    };

    await evaluateRisk(incidentId, input);
    const retrieved = await getRiskEvaluation(incidentId);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.riskLevel).toBeDefined();
    expect(retrieved?.rationale).toBeDefined();
    expect(Array.isArray(retrieved?.factors)).toBe(true);
  });

  // Unit test: incidents table is updated with risk_level
  it('should update incidents table with risk_level', async () => {
    const incidentId = 800009;
    await pool.execute(
      `INSERT INTO incidents (id, company_name, source, description, status) 
       VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
       ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
      [incidentId]
    );

    const input: RiskEvaluatorInput = {
      category: 'unauthorized_access',
      severity: 'high',
      confidence: 0.9,
    };

    const result = await evaluateRisk(incidentId, input);

    // Verify incidents table was updated
    const [rows] = await pool.execute<any[]>(
      'SELECT risk_level FROM incidents WHERE id = ?',
      [incidentId]
    );

    expect(rows.length).toBe(1);
    expect(rows[0].risk_level).toBe(result.riskLevel);
  });

  // Unit test: unauthorized_access with high severity is high risk
  it('should classify unauthorized_access with high severity as high risk', async () => {
    const incidentId = 800010;
    await pool.execute(
      `INSERT INTO incidents (id, company_name, source, description, status) 
       VALUES (?, 'Test Company', 'manual', 'Test incident', 'classified')
       ON DUPLICATE KEY UPDATE company_name = 'Test Company'`,
      [incidentId]
    );

    const input: RiskEvaluatorInput = {
      category: 'unauthorized_access',
      severity: 'high',
      confidence: 0.9,
    };

    const result = await evaluateRisk(incidentId, input);

    // unauthorized_access (30) + high severity (30) = 60 = high risk threshold
    expect(result.riskLevel).toBe('high');
  });
});
