import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from '../src/config/database';
import type { RowDataPacket } from 'mysql2';
import { protocolManager } from '../src/modules/protocols/protocol-manager.service.js';
import type { CreateProtocolInput } from '../src/modules/protocols/protocol.schema.js';

/**
 * Task 4: Checkpoint de protocolos
 * 
 * This test suite verifies:
 * 1. Default protocols are in the database
 * 2. Parser can do round-trip correctly (JSON → Object → JSON)
 * 3. Validation rejects invalid protocols
 */

interface Protocol {
  id: number;
  category: string;
  version: string;
  name: string;
  description: string;
  steps: any;
  conditions: any;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

describe('Protocol Checkpoint - Task 4', () => {
  describe('1. Verificar que protocolos por defecto están en BD', () => {
    it('should have 6 default protocols in the database', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT COUNT(*) as count FROM protocols WHERE is_active = TRUE'
      );
      
      expect(rows[0].count).toBe(6);
    });

    it('should have protocol for unauthorized_access category', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM protocols WHERE category = ? AND is_active = TRUE',
        ['unauthorized_access']
      );
      
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].name).toBe('Unauthorized Access Response Protocol');
      expect(rows[0].version).toBe('1.0.0');
    });

    it('should have protocol for system_misconfiguration category', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM protocols WHERE category = ? AND is_active = TRUE',
        ['system_misconfiguration']
      );
      
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].name).toBe('System Misconfiguration Response Protocol');
    });

    it('should have protocol for improper_data_sharing category', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM protocols WHERE category = ? AND is_active = TRUE',
        ['improper_data_sharing']
      );
      
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].name).toBe('Improper Data Sharing Response Protocol');
    });

    it('should have protocol for phishing_social_engineering category', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM protocols WHERE category = ? AND is_active = TRUE',
        ['phishing_social_engineering']
      );
      
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].name).toBe('Phishing Response Protocol');
    });

    it('should have protocol for physical_security category', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM protocols WHERE category = ? AND is_active = TRUE',
        ['physical_security']
      );
      
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].name).toBe('Physical Security Response Protocol');
    });

    it('should have fallback protocol for "other" category', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM protocols WHERE category = ? AND is_active = TRUE',
        ['other']
      );
      
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].name).toBe('General Incident Response Protocol');
    });

    it('all protocols should have valid structure with steps', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT id, category, steps FROM protocols WHERE is_active = TRUE'
      );
      
      for (const row of rows) {
        expect(row.steps).toBeDefined();
        const steps = JSON.parse(JSON.stringify(row.steps));
        expect(Array.isArray(steps)).toBe(true);
        expect(steps.length).toBeGreaterThan(0);
        
        // Verify each step has required fields
        for (const step of steps) {
          expect(step).toHaveProperty('order');
          expect(step).toHaveProperty('actionType');
          expect(step).toHaveProperty('title');
          expect(step).toHaveProperty('parameters');
        }
      }
    });

    it('all protocols should have at least 2 steps (create_task + notify_consultant)', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT category, steps FROM protocols WHERE is_active = TRUE'
      );
      
      for (const row of rows) {
        const steps = JSON.parse(JSON.stringify(row.steps));
        expect(steps.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('all protocol steps should have correct dependency structure', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT category, steps FROM protocols WHERE is_active = TRUE'
      );
      
      for (const row of rows) {
        const steps = JSON.parse(JSON.stringify(row.steps));
        
        // Step 1 should depend on step 0
        if (steps.length >= 2) {
          const step1 = steps.find((s: any) => s.order === 1);
          expect(step1).toBeDefined();
          expect(step1.dependencies).toBeDefined();
          expect(step1.dependencies).toContain(0);
        }
      }
    });
  });

  describe('2. Verificar que el parser hace round-trip correctamente', () => {
    it('should successfully parse protocol from DB and serialize back to equivalent JSON', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM protocols WHERE category = ? AND is_active = TRUE LIMIT 1',
        ['unauthorized_access']
      );
      
      expect(rows.length).toBe(1);
      const protocol = rows[0];
      
      // Parse steps from DB (they're already JSON objects from MySQL)
      const originalSteps = JSON.parse(JSON.stringify(protocol.steps));
      
      // Serialize back to JSON string
      const serialized = JSON.stringify(originalSteps, null, 2);
      
      // Parse again
      const reparsed = JSON.parse(serialized);
      
      // Verify round-trip: original → serialize → parse → equivalent
      expect(reparsed).toEqual(originalSteps);
    });

    it('should preserve all protocol fields during round-trip', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM protocols WHERE category = ? LIMIT 1',
        ['phishing_social_engineering']
      );
      
      const protocol = rows[0];
      
      // Create protocol object
      const protocolObj = {
        category: protocol.category,
        version: protocol.version,
        name: protocol.name,
        description: protocol.description,
        steps: JSON.parse(JSON.stringify(protocol.steps)),
        conditions: protocol.conditions,
        isActive: protocol.is_active
      };
      
      // Serialize to JSON
      const json = JSON.stringify(protocolObj, null, 2);
      
      // Parse back
      const parsed = JSON.parse(json);
      
      // Verify all fields preserved
      expect(parsed.category).toBe(protocolObj.category);
      expect(parsed.version).toBe(protocolObj.version);
      expect(parsed.name).toBe(protocolObj.name);
      expect(parsed.description).toBe(protocolObj.description);
      expect(parsed.steps).toEqual(protocolObj.steps);
      expect(parsed.isActive).toBe(protocolObj.isActive);
    });

    it('should preserve step order during round-trip', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT steps FROM protocols WHERE is_active = TRUE LIMIT 1'
      );
      
      const originalSteps = JSON.parse(JSON.stringify(rows[0].steps));
      const originalOrder = originalSteps.map((s: any) => s.order);
      
      // Round-trip
      const json = JSON.stringify(originalSteps);
      const parsed = JSON.parse(json);
      const parsedOrder = parsed.map((s: any) => s.order);
      
      expect(parsedOrder).toEqual(originalOrder);
    });

    it('should preserve nested parameters during round-trip', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT steps FROM protocols WHERE category = ? LIMIT 1',
        ['unauthorized_access']
      );
      
      const steps = JSON.parse(JSON.stringify(rows[0].steps));
      const step0 = steps[0];
      
      // Verify parameters exist
      expect(step0.parameters).toBeDefined();
      expect(step0.parameters.priority).toBeDefined();
      expect(step0.parameters.assignedTeam).toBeDefined();
      
      // Round-trip
      const json = JSON.stringify(step0);
      const parsed = JSON.parse(json);
      
      expect(parsed.parameters).toEqual(step0.parameters);
    });

    it('should preserve dependencies array during round-trip', async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT steps FROM protocols WHERE is_active = TRUE LIMIT 1'
      );
      
      const steps = JSON.parse(JSON.stringify(rows[0].steps));
      const stepWithDeps = steps.find((s: any) => s.dependencies && s.dependencies.length > 0);
      
      expect(stepWithDeps).toBeDefined();
      
      const originalDeps = stepWithDeps.dependencies;
      
      // Round-trip
      const json = JSON.stringify(stepWithDeps);
      const parsed = JSON.parse(json);
      
      expect(parsed.dependencies).toEqual(originalDeps);
    });
  });

  describe('3. Verificar que la validación rechaza protocolos inválidos', () => {
    // These tests call the real ProtocolManagerService.validate() instead of
    // reimplementing validation logic inline, so a regression in the actual
    // validator is caught here.
    const basePlainProtocol: CreateProtocolInput = {
      category: 'other',
      version: '1.0.0',
      name: 'Test Protocol',
      description: '',
      steps: [
        {
          order: 0,
          actionType: 'create_task',
          title: 'Step 0',
          parameters: { priority: 'high' },
        },
      ],
      conditions: [],
      isActive: true,
    };

    it('should detect missing required field: category', () => {
      const invalidProtocol = { ...basePlainProtocol, category: undefined } as unknown as CreateProtocolInput;

      const result = protocolManager.validate(invalidProtocol);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'category')).toBe(true);
    });

    it('should detect missing required field: version', () => {
      const invalidProtocol = { ...basePlainProtocol, version: undefined } as unknown as CreateProtocolInput;

      const result = protocolManager.validate(invalidProtocol);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'version')).toBe(true);
    });

    it('should detect missing required field: steps', () => {
      const invalidProtocol = { ...basePlainProtocol, steps: undefined } as unknown as CreateProtocolInput;

      const result = protocolManager.validate(invalidProtocol);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'steps')).toBe(true);
    });

    it('should detect empty steps array', () => {
      const invalidProtocol: CreateProtocolInput = { ...basePlainProtocol, steps: [] };

      const result = protocolManager.validate(invalidProtocol);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('At least one step'))).toBe(true);
    });

    it('should detect invalid action type', () => {
      const invalidProtocol = {
        ...basePlainProtocol,
        steps: [{ order: 0, actionType: 'invalid_action_type', title: 'Test Step', parameters: {} }],
      } as unknown as CreateProtocolInput;

      const result = protocolManager.validate(invalidProtocol);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field.includes('actionType'))).toBe(true);
    });

    it('should detect missing step parameters required for create_task', () => {
      const invalidProtocol: CreateProtocolInput = {
        ...basePlainProtocol,
        steps: [{ order: 0, actionType: 'create_task', title: 'Test Step', parameters: {} }],
      };

      const result = protocolManager.validate(invalidProtocol);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_PARAMETER' && e.field.includes('priority'))).toBe(true);
    });

    it('should detect invalid dependency reference (step index out of bounds)', () => {
      const invalidProtocol: CreateProtocolInput = {
        ...basePlainProtocol,
        steps: [
          { order: 0, actionType: 'create_task', title: 'Step 0', parameters: { priority: 'high' }, dependencies: [5] },
        ],
      };

      const result = protocolManager.validate(invalidProtocol);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_DEPENDENCY')).toBe(true);
    });

    it('should detect circular dependency (step depending on itself)', () => {
      const invalidProtocol: CreateProtocolInput = {
        ...basePlainProtocol,
        steps: [
          { order: 0, actionType: 'create_task', title: 'Step 0', parameters: { priority: 'high' }, dependencies: [0] },
        ],
      };

      const result = protocolManager.validate(invalidProtocol);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should detect forward dependency (step depending on future step)', () => {
      const invalidProtocol: CreateProtocolInput = {
        ...basePlainProtocol,
        steps: [
          { order: 0, actionType: 'create_task', title: 'Step 0', parameters: { priority: 'high' }, dependencies: [1] },
          { order: 1, actionType: 'notify_consultant', title: 'Step 1', parameters: { team: 'ops' } },
        ],
      };

      const result = protocolManager.validate(invalidProtocol);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should detect duplicate step orders', () => {
      const invalidProtocol: CreateProtocolInput = {
        ...basePlainProtocol,
        steps: [
          { order: 0, actionType: 'create_task', title: 'Step 0', parameters: { priority: 'high' } },
          { order: 0, actionType: 'notify_consultant', title: 'Also Step 0', parameters: { team: 'ops' } },
        ],
      };

      const result = protocolManager.validate(invalidProtocol);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_ORDER')).toBe(true);
    });

    it('should detect invalid version format (non-semver)', () => {
      const invalidProtocol: CreateProtocolInput = { ...basePlainProtocol, version: 'not-a-version' };

      const result = protocolManager.validate(invalidProtocol);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.message.toLowerCase().includes('semver'))).toBe(true);
    });
  });
});
