-- Migration 003: Auto-Resolution System
-- This migration adds support for automatic incident resolution including:
-- - Risk evaluation and classification
-- - Protocol management
-- - Auto-resolution tracking
-- - PII mapping storage

USE incident_flow;

-- ============================================================================
-- 1. MODIFY EXISTING TABLES
-- ============================================================================

-- Add risk_level and resolved_at columns to incidents table.
-- Also extends the status ENUM with 'requiring_approval' and 'failed', required by the
-- Approval Gate and Auto Resolver flows (Requerimientos 2.5, 3.1, 3.6) but missing from
-- the original schema in db/init.sql.
ALTER TABLE incidents
    MODIFY COLUMN status ENUM('pending','analyzing','classified','action_pending','resolved','rejected','requiring_approval','failed') NOT NULL DEFAULT 'pending',
    ADD COLUMN risk_level ENUM('low', 'medium', 'high') NULL AFTER confidence,
    ADD COLUMN resolved_at TIMESTAMP NULL AFTER updated_at,
    ADD INDEX idx_risk_level (risk_level),
    ADD INDEX idx_status_risk (status, risk_level),
    ADD INDEX idx_status_risk_created (status, risk_level, created_at);

-- Add modification tracking columns to proposed_actions table
ALTER TABLE proposed_actions
    ADD COLUMN original_parameters JSON NULL AFTER parameters,
    ADD COLUMN modified_by VARCHAR(255) NULL AFTER approved_by,
    ADD COLUMN modified_at TIMESTAMP NULL AFTER executed_at;

-- ============================================================================
-- 2. CREATE NEW TABLES
-- ============================================================================

-- Table to store risk evaluations for incidents
CREATE TABLE risk_evaluations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    incident_id BIGINT UNSIGNED NOT NULL,
    risk_level ENUM('low', 'medium', 'high') NOT NULL,
    rationale TEXT NOT NULL,
    factors JSON NULL COMMENT 'Array of RiskFactor objects with name, value, and weight',
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
    INDEX idx_incident_id (incident_id),
    INDEX idx_risk_level (risk_level),
    INDEX idx_evaluated_at (evaluated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table to store resolution protocols
CREATE TABLE protocols (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    version VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    steps JSON NOT NULL COMMENT 'Array of ProtocolStep objects with order, actionType, title, parameters',
    conditions JSON NULL COMMENT 'Array of ProtocolCondition objects',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    archived_at TIMESTAMP NULL,
    INDEX idx_category_active (category, is_active),
    INDEX idx_category (category),
    INDEX idx_is_active (is_active),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table to track auto-resolution executions
CREATE TABLE auto_resolutions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    incident_id BIGINT UNSIGNED NOT NULL,
    protocol_id INT NOT NULL,
    status ENUM('resolved', 'failed', 'partial') NOT NULL,
    executed_actions JSON NOT NULL COMMENT 'Array of ExecutedAction objects',
    failed_action_index INT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NULL,
    duration_ms INT NULL,
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
    FOREIGN KEY (protocol_id) REFERENCES protocols(id),
    INDEX idx_incident_id (incident_id),
    INDEX idx_protocol_id (protocol_id),
    INDEX idx_status (status),
    INDEX idx_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table to store PII anonymization mappings
CREATE TABLE pii_mappings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    incident_id BIGINT UNSIGNED NOT NULL,
    token VARCHAR(50) NOT NULL COMMENT 'Token like EMAIL_1, PHONE_1, IP_1',
    original_value_encrypted BLOB NOT NULL COMMENT 'AES-256 encrypted original value',
    pii_type ENUM('email', 'phone', 'ip_address', 'name') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
    UNIQUE KEY unique_token_per_incident (incident_id, token),
    INDEX idx_incident_id (incident_id),
    INDEX idx_pii_type (pii_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. POPULATE DEFAULT PROTOCOLS
-- ============================================================================

-- Protocol for unauthorized_access category
INSERT INTO protocols (category, version, name, description, steps, is_active) VALUES (
    'unauthorized_access',
    '1.0.0',
    'Unauthorized Access Response Protocol',
    'Standard response protocol for unauthorized access incidents',
    JSON_ARRAY(
        JSON_OBJECT(
            'order', 0,
            'actionType', 'create_task',
            'title', 'Investigate unauthorized access attempt',
            'description', 'Create a task for the security team to investigate the unauthorized access',
            'parameters', JSON_OBJECT(
                'priority', 'high',
                'assignedTeam', 'security',
                'tags', JSON_ARRAY('security', 'access-control')
            )
        ),
        JSON_OBJECT(
            'order', 1,
            'actionType', 'notify_consultant',
            'title', 'Notify security consultant',
            'description', 'Alert the security consultant team about the incident',
            'parameters', JSON_OBJECT(
                'team', 'security-consultants',
                'notificationPriority', 'high',
                'includeIncidentDetails', true
            ),
            'dependencies', JSON_ARRAY(0)
        )
    ),
    TRUE
);

-- Protocol for system_misconfiguration category
INSERT INTO protocols (category, version, name, description, steps, is_active) VALUES (
    'system_misconfiguration',
    '1.0.0',
    'System Misconfiguration Response Protocol',
    'Standard response protocol for system misconfiguration incidents',
    JSON_ARRAY(
        JSON_OBJECT(
            'order', 0,
            'actionType', 'create_task',
            'title', 'Review system configuration',
            'description', 'Create a task for the infrastructure team to review the misconfigured system',
            'parameters', JSON_OBJECT(
                'priority', 'medium',
                'assignedTeam', 'infrastructure',
                'tags', JSON_ARRAY('config-review', 'system-health')
            )
        ),
        JSON_OBJECT(
            'order', 1,
            'actionType', 'notify_consultant',
            'title', 'Notify infrastructure team',
            'description', 'Alert the infrastructure team about the configuration issue',
            'parameters', JSON_OBJECT(
                'team', 'infrastructure-consultants',
                'notificationPriority', 'medium',
                'includeIncidentDetails', true
            ),
            'dependencies', JSON_ARRAY(0)
        )
    ),
    TRUE
);

-- Protocol for improper_data_sharing category
INSERT INTO protocols (category, version, name, description, steps, is_active) VALUES (
    'improper_data_sharing',
    '1.0.0',
    'Improper Data Sharing Response Protocol',
    'Standard response protocol for improper data sharing incidents',
    JSON_ARRAY(
        JSON_OBJECT(
            'order', 0,
            'actionType', 'create_task',
            'title', 'Review data sharing practices',
            'description', 'Create a task for the compliance team to review data sharing',
            'parameters', JSON_OBJECT(
                'priority', 'high',
                'assignedTeam', 'compliance',
                'tags', JSON_ARRAY('data-privacy', 'compliance')
            )
        ),
        JSON_OBJECT(
            'order', 1,
            'actionType', 'notify_consultant',
            'title', 'Notify compliance consultant',
            'description', 'Alert the compliance team about the data sharing incident',
            'parameters', JSON_OBJECT(
                'team', 'compliance-consultants',
                'notificationPriority', 'high',
                'includeIncidentDetails', true
            ),
            'dependencies', JSON_ARRAY(0)
        )
    ),
    TRUE
);

-- Protocol for phishing_social_engineering category
INSERT INTO protocols (category, version, name, description, steps, is_active) VALUES (
    'phishing_social_engineering',
    '1.0.0',
    'Phishing Response Protocol',
    'Standard response protocol for phishing and social engineering attempts',
    JSON_ARRAY(
        JSON_OBJECT(
            'order', 0,
            'actionType', 'create_task',
            'title', 'Investigate phishing attempt',
            'description', 'Create a task to investigate potential compromised credentials',
            'parameters', JSON_OBJECT(
                'priority', 'urgent',
                'assignedTeam', 'security',
                'tags', JSON_ARRAY('phishing', 'investigation')
            )
        ),
        JSON_OBJECT(
            'order', 1,
            'actionType', 'notify_consultant',
            'title', 'Alert IT security team',
            'description', 'Notify IT security about the phishing attempt',
            'parameters', JSON_OBJECT(
                'team', 'it-security',
                'notificationPriority', 'urgent',
                'includeIncidentDetails', true
            ),
            'dependencies', JSON_ARRAY(0)
        )
    ),
    TRUE
);

-- Protocol for physical_security category
INSERT INTO protocols (category, version, name, description, steps, is_active) VALUES (
    'physical_security',
    '1.0.0',
    'Physical Security Response Protocol',
    'Standard response protocol for physical security incidents',
    JSON_ARRAY(
        JSON_OBJECT(
            'order', 0,
            'actionType', 'create_task',
            'title', 'Review physical security incident',
            'description', 'Create a task for facilities team to review the security breach',
            'parameters', JSON_OBJECT(
                'priority', 'high',
                'assignedTeam', 'facilities',
                'tags', JSON_ARRAY('physical-security', 'facilities')
            )
        ),
        JSON_OBJECT(
            'order', 1,
            'actionType', 'notify_consultant',
            'title', 'Notify security consultant',
            'description', 'Alert the security consultant about the physical security incident',
            'parameters', JSON_OBJECT(
                'team', 'security-consultants',
                'notificationPriority', 'high',
                'includeIncidentDetails', true
            ),
            'dependencies', JSON_ARRAY(0)
        )
    ),
    TRUE
);

-- Fallback protocol for 'other' category
INSERT INTO protocols (category, version, name, description, steps, is_active) VALUES (
    'other',
    '1.0.0',
    'General Incident Response Protocol',
    'Default fallback protocol for uncategorized or general incidents',
    JSON_ARRAY(
        JSON_OBJECT(
            'order', 0,
            'actionType', 'create_task',
            'title', 'Review and categorize incident',
            'description', 'Create a task for the operations team to review and properly categorize the incident',
            'parameters', JSON_OBJECT(
                'priority', 'medium',
                'assignedTeam', 'operations',
                'tags', JSON_ARRAY('review', 'categorization')
            )
        ),
        JSON_OBJECT(
            'order', 1,
            'actionType', 'notify_consultant',
            'title', 'Notify operations consultant',
            'description', 'Alert the operations team about the new incident',
            'parameters', JSON_OBJECT(
                'team', 'operations-consultants',
                'notificationPriority', 'medium',
                'includeIncidentDetails', true
            ),
            'dependencies', JSON_ARRAY(0)
        )
    ),
    TRUE
);

-- ============================================================================
-- 4. VERIFICATION QUERIES (commented out - for manual verification)
-- ============================================================================

-- Verify new columns were added to incidents
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_SCHEMA = 'incident_flow' AND TABLE_NAME = 'incidents' 
-- AND COLUMN_NAME IN ('risk_level', 'resolved_at');

-- Verify new columns were added to proposed_actions
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_SCHEMA = 'incident_flow' AND TABLE_NAME = 'proposed_actions' 
-- AND COLUMN_NAME IN ('original_parameters', 'modified_by', 'modified_at');

-- Verify new tables were created
-- SHOW TABLES LIKE '%evaluations' OR LIKE '%protocols' OR LIKE '%resolutions' OR LIKE '%mappings';

-- Verify protocols were populated
-- SELECT id, category, name, version, is_active FROM protocols;

-- Verify indexes were created
-- SHOW INDEX FROM incidents WHERE Key_name LIKE '%risk%';
-- SHOW INDEX FROM risk_evaluations;
-- SHOW INDEX FROM protocols;
-- SHOW INDEX FROM auto_resolutions;
-- SHOW INDEX FROM pii_mappings;
