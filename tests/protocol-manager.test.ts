import { describe, it, expect, beforeAll } from 'vitest';
import { protocolManager } from '../src/modules/protocols/protocol-manager.service.js';
import { protocolParser } from '../src/modules/protocols/protocol-parser.js';
import type { CreateProtocolInput } from '../src/modules/protocols/protocol.schema.js';

describe('Protocol Manager and Parser', () => {
  describe('Protocol Validation', () => {
    it('should validate a valid protocol', () => {
      const validProtocol: CreateProtocolInput = {
        category: 'system_misconfiguration',
        version: '1.0.0',
        name: 'Test Protocol',
        description: 'Test protocol for validation',
        steps: [
          {
            order: 0,
            actionType: 'create_task',
            title: 'Create task',
            parameters: { priority: 'high' },
          },
        ],
        conditions: [],
        isActive: true,
      };

      const result = protocolManager.validate(validProtocol);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject protocol with missing required fields', () => {
      const invalidProtocol = {
        version: '1.0.0',
        name: 'Test Protocol',
        steps: [],
        isActive: true,
      } as unknown as CreateProtocolInput;

      const result = protocolManager.validate(invalidProtocol);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject protocol with invalid semver version', () => {
      const invalidProtocol: CreateProtocolInput = {
        category: 'other',
        version: '1.0', // Invalid semver
        name: 'Test Protocol',
        description: '',
        steps: [
          {
            order: 0,
            actionType: 'create_task',
            title: 'Create task',
            parameters: { priority: 'high' },
          },
        ],
        conditions: [],
        isActive: true,
      };

      const result = protocolManager.validate(invalidProtocol);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('semver'))).toBe(true);
    });

    it('should reject protocol with no steps', () => {
      const invalidProtocol: CreateProtocolInput = {
        category: 'other',
        version: '1.0.0',
        name: 'Test Protocol',
        description: '',
        steps: [],
        conditions: [],
        isActive: true,
      };

      const result = protocolManager.validate(invalidProtocol);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('At least one step'))).toBe(true);
    });

    it('should reject protocol with duplicate step orders', () => {
      const invalidProtocol: CreateProtocolInput = {
        category: 'other',
        version: '1.0.0',
        name: 'Test Protocol',
        description: '',
        steps: [
          {
            order: 0,
            actionType: 'create_task',
            title: 'Step 1',
            parameters: { priority: 'high' },
          },
          {
            order: 0, // Duplicate order
            actionType: 'notify_consultant',
            title: 'Step 2',
            parameters: { team: 'security' },
          },
        ],
        conditions: [],
        isActive: true,
      };

      const result = protocolManager.validate(invalidProtocol);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_ORDER')).toBe(true);
    });

    it('should reject protocol with circular dependencies', () => {
      const invalidProtocol: CreateProtocolInput = {
        category: 'other',
        version: '1.0.0',
        name: 'Test Protocol',
        description: '',
        steps: [
          {
            order: 0,
            actionType: 'create_task',
            title: 'Step 1',
            parameters: { priority: 'high' },
            dependencies: [1], // Depends on future step
          },
          {
            order: 1,
            actionType: 'notify_consultant',
            title: 'Step 2',
            parameters: { team: 'security' },
          },
        ],
        conditions: [],
        isActive: true,
      };

      const result = protocolManager.validate(invalidProtocol);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('should reject protocol with invalid dependency reference', () => {
      const invalidProtocol: CreateProtocolInput = {
        category: 'other',
        version: '1.0.0',
        name: 'Test Protocol',
        description: '',
        steps: [
          {
            order: 0,
            actionType: 'create_task',
            title: 'Step 1',
            parameters: { priority: 'high' },
            dependencies: [5], // Non-existent step
          },
        ],
        conditions: [],
        isActive: true,
      };

      const result = protocolManager.validate(invalidProtocol);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_DEPENDENCY')).toBe(true);
    });

    it('should reject create_task without priority parameter', () => {
      const invalidProtocol: CreateProtocolInput = {
        category: 'other',
        version: '1.0.0',
        name: 'Test Protocol',
        description: '',
        steps: [
          {
            order: 0,
            actionType: 'create_task',
            title: 'Create task',
            parameters: {}, // Missing priority
          },
        ],
        conditions: [],
        isActive: true,
      };

      const result = protocolManager.validate(invalidProtocol);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_PARAMETER' && e.field.includes('priority'))).toBe(true);
    });

    it('should reject notify_consultant without team parameter', () => {
      const invalidProtocol: CreateProtocolInput = {
        category: 'other',
        version: '1.0.0',
        name: 'Test Protocol',
        description: '',
        steps: [
          {
            order: 0,
            actionType: 'notify_consultant',
            title: 'Notify consultant',
            parameters: {}, // Missing team
          },
        ],
        conditions: [],
        isActive: true,
      };

      const result = protocolManager.validate(invalidProtocol);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_PARAMETER' && e.field.includes('team'))).toBe(true);
    });

    it('should reject restart_service without serviceName parameter', () => {
      const invalidProtocol: CreateProtocolInput = {
        category: 'other',
        version: '1.0.0',
        name: 'Test Protocol',
        description: '',
        steps: [
          {
            order: 0,
            actionType: 'restart_service',
            title: 'Restart service',
            parameters: {}, // Missing serviceName
          },
        ],
        conditions: [],
        isActive: true,
      };

      const result = protocolManager.validate(invalidProtocol);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_PARAMETER' && e.field.includes('serviceName'))).toBe(true);
    });
  });

  describe('Protocol Parser', () => {
    it('should parse valid JSON protocol', () => {
      const jsonProtocol = JSON.stringify({
        category: 'system_misconfiguration',
        version: '1.0.0',
        name: 'Test Protocol',
        description: 'Test description',
        steps: [
          {
            order: 0,
            actionType: 'create_task',
            title: 'Create task',
            parameters: { priority: 'high' },
          },
        ],
        conditions: [],
        isActive: true,
      });

      const result = protocolParser.parse(jsonProtocol);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.category).toBe('system_misconfiguration');
    });

    it('should reject invalid JSON syntax', () => {
      const invalidJson = '{ "category": "other", invalid json }';

      const result = protocolParser.parse(invalidJson);
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('syntax');
      expect(result.error?.message).toBeDefined();
    });

    it('should reject JSON with invalid structure', () => {
      const invalidStructure = JSON.stringify({
        category: 'other',
        version: '1.0.0',
        name: 'Test',
        steps: 'not an array', // Invalid type
        isActive: true,
      });

      const result = protocolParser.parse(invalidStructure);
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('validation');
    });

    it('should pretty print protocol with 2-space indentation', () => {
      const protocol: CreateProtocolInput = {
        category: 'other',
        version: '1.0.0',
        name: 'Test Protocol',
        description: 'Test',
        steps: [
          {
            order: 0,
            actionType: 'create_task',
            title: 'Task',
            parameters: { priority: 'high' },
          },
        ],
        conditions: [],
        isActive: true,
      };

      const printed = protocolParser.print(protocol);
      expect(printed).toContain('  '); // Should have 2-space indentation
      expect(() => JSON.parse(printed)).not.toThrow(); // Should be valid JSON
    });

    it('should support round-trip (parse -> print -> parse)', () => {
      const originalJson = JSON.stringify({
        category: 'unauthorized_access',
        version: '2.0.0',
        name: 'Security Protocol',
        description: 'High security protocol',
        steps: [
          {
            order: 0,
            actionType: 'create_task',
            title: 'Investigate',
            parameters: { priority: 'urgent', assignedTeam: 'security' },
          },
          {
            order: 1,
            actionType: 'notify_consultant',
            title: 'Alert team',
            parameters: { team: 'security-team' },
            dependencies: [0],
          },
        ],
        conditions: [],
        isActive: true,
      });

      // Parse
      const parseResult1 = protocolParser.parse(originalJson);
      expect(parseResult1.success).toBe(true);

      // Print
      const printed = protocolParser.print(parseResult1.data!);

      // Parse again
      const parseResult2 = protocolParser.parse(printed);
      expect(parseResult2.success).toBe(true);

      // Compare
      expect(parseResult2.data).toEqual(parseResult1.data);
    });
  });

  describe('Protocol Manager Integration', () => {
    it('should validate all action types correctly', () => {
      const protocolWithAllActions: CreateProtocolInput = {
        category: 'other',
        version: '1.0.0',
        name: 'Complete Protocol',
        description: 'Protocol with all action types',
        steps: [
          {
            order: 0,
            actionType: 'create_task',
            title: 'Create task',
            parameters: { priority: 'high', assignedTeam: 'ops' },
          },
          {
            order: 1,
            actionType: 'notify_consultant',
            title: 'Notify consultant',
            parameters: { team: 'security', notificationPriority: 'high' },
            dependencies: [0],
          },
          {
            order: 2,
            actionType: 'restart_service',
            title: 'Restart service',
            parameters: { serviceName: 'api-gateway', timeout: 30 },
            dependencies: [1],
          },
        ],
        conditions: [
          {
            field: 'severity',
            operator: 'less_than',
            value: 'critical',
          },
        ],
        isActive: true,
      };

      const result = protocolManager.validate(protocolWithAllActions);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
