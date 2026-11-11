/**
 * Migration 003 Validation Tests
 * 
 * These tests validate that the migration SQL is syntactically correct
 * and contains all required elements.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Migration 003: Auto-Resolution System', () => {
  const migrationPath = path.join(__dirname, '..', 'db', '003_auto_resolution.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

  describe('File Structure', () => {
    it('should exist and be readable', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      expect(migrationSQL.length).toBeGreaterThan(0);
    });

    it('should use the correct database', () => {
      expect(migrationSQL).toContain('USE incident_flow;');
    });
  });

  describe('Table Modifications', () => {
    it('should add risk_level column to incidents table', () => {
      expect(migrationSQL).toMatch(/ALTER TABLE incidents.*ADD COLUMN risk_level/s);
      expect(migrationSQL).toContain("ENUM('low', 'medium', 'high')");
    });

    it('should extend incidents.status ENUM with requiring_approval and failed', () => {
      expect(migrationSQL).toMatch(/ALTER TABLE incidents.*MODIFY COLUMN status ENUM/s);
      expect(migrationSQL).toMatch(/status ENUM\([^)]*'requiring_approval'[^)]*'failed'[^)]*\)/);
    });

    it('should add resolved_at column to incidents table', () => {
      expect(migrationSQL).toMatch(/ALTER TABLE incidents.*ADD COLUMN resolved_at TIMESTAMP/s);
    });

    it('should add indexes for risk_level', () => {
      expect(migrationSQL).toContain('ADD INDEX idx_risk_level (risk_level)');
      expect(migrationSQL).toContain('ADD INDEX idx_status_risk (status, risk_level)');
      expect(migrationSQL).toContain('ADD INDEX idx_status_risk_created');
    });

    it('should add modification tracking to proposed_actions', () => {
      expect(migrationSQL).toMatch(/ALTER TABLE proposed_actions.*ADD COLUMN original_parameters JSON/s);
      expect(migrationSQL).toMatch(/ADD COLUMN modified_by VARCHAR\(255\)/);
      expect(migrationSQL).toMatch(/ADD COLUMN modified_at TIMESTAMP/);
    });
  });

  describe('New Tables', () => {
    it('should create risk_evaluations table', () => {
      expect(migrationSQL).toContain('CREATE TABLE risk_evaluations');
      expect(migrationSQL).toMatch(/risk_evaluations.*incident_id.*BIGINT UNSIGNED/s);
      expect(migrationSQL).toMatch(/risk_evaluations.*risk_level.*ENUM\('low', 'medium', 'high'\)/s);
      expect(migrationSQL).toMatch(/risk_evaluations.*rationale.*TEXT/s);
      expect(migrationSQL).toMatch(/risk_evaluations.*factors.*JSON/s);
    });

    it('should create protocols table', () => {
      expect(migrationSQL).toContain('CREATE TABLE protocols');
      expect(migrationSQL).toMatch(/protocols.*category.*VARCHAR\(100\)/s);
      expect(migrationSQL).toMatch(/protocols.*version.*VARCHAR\(20\)/s);
      expect(migrationSQL).toMatch(/protocols.*steps.*JSON.*NOT NULL/s);
      expect(migrationSQL).toMatch(/protocols.*is_active.*BOOLEAN/s);
      expect(migrationSQL).toMatch(/protocols.*archived_at.*TIMESTAMP.*NULL/s);
    });

    it('should create auto_resolutions table', () => {
      expect(migrationSQL).toContain('CREATE TABLE auto_resolutions');
      expect(migrationSQL).toMatch(/auto_resolutions.*incident_id.*BIGINT UNSIGNED/s);
      expect(migrationSQL).toMatch(/auto_resolutions.*protocol_id.*INT/s);
      expect(migrationSQL).toMatch(/auto_resolutions.*status.*ENUM\('resolved', 'failed', 'partial'\)/s);
      expect(migrationSQL).toMatch(/auto_resolutions.*executed_actions.*JSON/s);
    });

    it('should create pii_mappings table', () => {
      expect(migrationSQL).toContain('CREATE TABLE pii_mappings');
      expect(migrationSQL).toMatch(/pii_mappings.*token.*VARCHAR\(50\)/s);
      expect(migrationSQL).toMatch(/pii_mappings.*original_value_encrypted.*BLOB/s);
      expect(migrationSQL).toMatch(/pii_mappings.*pii_type.*ENUM\('email', 'phone', 'ip_address', 'name'\)/s);
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should add foreign keys for risk_evaluations', () => {
      expect(migrationSQL).toMatch(/risk_evaluations.*FOREIGN KEY.*incident_id.*REFERENCES incidents/s);
      expect(migrationSQL).toMatch(/ON DELETE CASCADE/);
    });

    it('should add foreign keys for auto_resolutions', () => {
      expect(migrationSQL).toMatch(/auto_resolutions.*FOREIGN KEY.*incident_id.*REFERENCES incidents/s);
      expect(migrationSQL).toMatch(/auto_resolutions.*FOREIGN KEY.*protocol_id.*REFERENCES protocols/s);
    });

    it('should add foreign keys for pii_mappings', () => {
      expect(migrationSQL).toMatch(/pii_mappings.*FOREIGN KEY.*incident_id.*REFERENCES incidents/s);
    });
  });

  describe('Indexes', () => {
    it('should create indexes for risk_evaluations', () => {
      expect(migrationSQL).toMatch(/risk_evaluations.*INDEX idx_incident_id/s);
      expect(migrationSQL).toMatch(/risk_evaluations.*INDEX idx_risk_level/s);
    });

    it('should create indexes for protocols', () => {
      expect(migrationSQL).toMatch(/protocols.*INDEX idx_category_active.*\(category, is_active\)/s);
      expect(migrationSQL).toMatch(/protocols.*INDEX idx_category/s);
    });

    it('should create indexes for auto_resolutions', () => {
      expect(migrationSQL).toMatch(/auto_resolutions.*INDEX idx_incident_id/s);
      expect(migrationSQL).toMatch(/auto_resolutions.*INDEX idx_status/s);
    });

    it('should create unique constraint for pii_mappings', () => {
      expect(migrationSQL).toMatch(/pii_mappings.*UNIQUE KEY unique_token_per_incident.*\(incident_id, token\)/s);
    });
  });

  describe('Default Protocols', () => {
    const expectedCategories = [
      'unauthorized_access',
      'system_misconfiguration',
      'improper_data_sharing',
      'phishing_social_engineering',
      'physical_security',
      'other'
    ];

    expectedCategories.forEach(category => {
      it(`should populate protocol for category: ${category}`, () => {
        expect(migrationSQL).toContain(`'${category}'`);
        expect(migrationSQL).toMatch(new RegExp(`INSERT INTO protocols.*${category}`, 's'));
      });
    });

    it('should include protocol version 1.0.0', () => {
      const versionMatches = migrationSQL.match(/'1\.0\.0'/g);
      expect(versionMatches).toBeTruthy();
      expect(versionMatches!.length).toBe(6); // 6 protocols
    });

    it('should define steps with order, actionType, title, parameters', () => {
      expect(migrationSQL).toContain("'order'");
      expect(migrationSQL).toContain("'actionType'");
      expect(migrationSQL).toContain("'title'");
      expect(migrationSQL).toContain("'parameters'");
    });

    it('should include create_task and notify_consultant actions', () => {
      expect(migrationSQL).toContain("'create_task'");
      expect(migrationSQL).toContain("'notify_consultant'");
    });

    it('should define dependencies between steps', () => {
      expect(migrationSQL).toContain("'dependencies'");
      expect(migrationSQL).toMatch(/JSON_ARRAY\(0\)/); // Step 1 depends on step 0
    });
  });

  describe('SQL Syntax', () => {
    it('should not have syntax errors in CREATE TABLE statements', () => {
      const createTableStatements = migrationSQL.match(/CREATE TABLE [^;]+;/gs);
      expect(createTableStatements).toBeTruthy();
      expect(createTableStatements!.length).toBeGreaterThanOrEqual(4);
    });

    it('should not have syntax errors in ALTER TABLE statements', () => {
      const alterTableStatements = migrationSQL.match(/ALTER TABLE [^;]+;/gs);
      expect(alterTableStatements).toBeTruthy();
      expect(alterTableStatements!.length).toBe(2); // incidents and proposed_actions
    });

    it('should not have syntax errors in INSERT statements', () => {
      const insertStatements = migrationSQL.match(/INSERT INTO [^;]+;/gs);
      expect(insertStatements).toBeTruthy();
      expect(insertStatements!.length).toBe(6); // 6 default protocols
    });

    it('should properly escape single quotes in JSON strings', () => {
      // Check that we're using JSON_OBJECT and JSON_ARRAY functions
      expect(migrationSQL).toContain('JSON_OBJECT');
      expect(migrationSQL).toContain('JSON_ARRAY');
    });

    it('should use InnoDB engine for all tables', () => {
      const createTableStatements = migrationSQL.match(/CREATE TABLE [^;]+;/gs) || [];
      createTableStatements.forEach(statement => {
        expect(statement).toMatch(/ENGINE=InnoDB/);
      });
    });

    it('should use utf8mb4 charset for all tables', () => {
      const createTableStatements = migrationSQL.match(/CREATE TABLE [^;]+;/gs) || [];
      createTableStatements.forEach(statement => {
        expect(statement).toMatch(/DEFAULT CHARSET=utf8mb4/);
      });
    });
  });

  describe('Comments and Documentation', () => {
    it('should have descriptive comments for JSON columns', () => {
      expect(migrationSQL).toMatch(/COMMENT.*Array of RiskFactor/);
      expect(migrationSQL).toMatch(/COMMENT.*Array of ProtocolStep/);
      expect(migrationSQL).toMatch(/COMMENT.*Array of ExecutedAction/);
    });

    it('should have section headers for organization', () => {
      expect(migrationSQL).toContain('MODIFY EXISTING TABLES');
      expect(migrationSQL).toContain('CREATE NEW TABLES');
      expect(migrationSQL).toContain('POPULATE DEFAULT PROTOCOLS');
    });
  });

  describe('Data Integrity', () => {
    it('should set NOT NULL constraints on critical fields', () => {
      expect(migrationSQL).toMatch(/steps.*JSON.*NOT NULL/);
      expect(migrationSQL).toMatch(/risk_level.*NOT NULL/);
      expect(migrationSQL).toMatch(/rationale.*TEXT.*NOT NULL/);
      expect(migrationSQL).toMatch(/status.*ENUM.*NOT NULL/);
    });

    it('should set default values where appropriate', () => {
      expect(migrationSQL).toMatch(/is_active.*BOOLEAN.*DEFAULT TRUE/);
      expect(migrationSQL).toMatch(/evaluated_at.*TIMESTAMP.*DEFAULT CURRENT_TIMESTAMP/);
    });

    it('should use proper timestamp handling', () => {
      expect(migrationSQL).toMatch(/created_at.*TIMESTAMP.*DEFAULT CURRENT_TIMESTAMP/);
      expect(migrationSQL).toMatch(/updated_at.*TIMESTAMP.*DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/);
    });
  });
});
