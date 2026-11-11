# Migration 003: Auto-Resolution System

## Overview

This migration adds database support for the automatic incident resolution system, including risk evaluation, protocol management, auto-resolution tracking, and PII mapping storage.

## What This Migration Does

### 1. Modifies Existing Tables

#### `incidents` table
- **Adds `risk_level`**: ENUM('low', 'medium', 'high') - Classification of incident risk
- **Adds `resolved_at`**: TIMESTAMP - When the incident was resolved
- **Adds indexes**: For efficient querying by risk level and status combinations

#### `proposed_actions` table
- **Adds `original_parameters`**: JSON - Original action parameters before modification
- **Adds `modified_by`**: VARCHAR(255) - Who modified the action
- **Adds `modified_at`**: TIMESTAMP - When the action was modified

### 2. Creates New Tables

#### `risk_evaluations`
Stores risk assessment results for each incident:
- `incident_id`: Foreign key to incidents
- `risk_level`: Classification (low/medium/high)
- `rationale`: Explanation of the classification
- `factors`: JSON array of factors that influenced the risk score
- `evaluated_at`: Timestamp of evaluation

#### `protocols`
Stores resolution protocols for different incident categories:
- `category`: Incident category this protocol applies to
- `version`: Semantic version of the protocol
- `name`: Human-readable name
- `description`: Protocol description
- `steps`: JSON array of actions to execute
- `conditions`: Optional conditions for protocol application
- `is_active`: Whether this protocol is currently active
- `archived_at`: Soft delete timestamp

#### `auto_resolutions`
Tracks automatic resolution executions:
- `incident_id`: Foreign key to incidents
- `protocol_id`: Which protocol was used
- `status`: Result (resolved/failed/partial)
- `executed_actions`: JSON array of actions that were executed
- `failed_action_index`: Index of failed action (if any)
- `started_at`, `completed_at`, `duration_ms`: Execution timing

#### `pii_mappings`
Stores encrypted mappings of anonymized PII tokens:
- `incident_id`: Foreign key to incidents
- `token`: The anonymization token (e.g., EMAIL_1, PHONE_1)
- `original_value_encrypted`: AES-256 encrypted original value
- `pii_type`: Type of PII (email/phone/ip_address/name)

### 3. Populates Default Protocols

The migration seeds the database with 6 default protocols:
- **unauthorized_access**: For unauthorized access incidents
- **system_misconfiguration**: For misconfiguration issues
- **improper_data_sharing**: For data sharing violations
- **phishing_social_engineering**: For phishing attempts
- **physical_security**: For physical security breaches
- **other**: Fallback protocol for uncategorized incidents

Each protocol includes:
- A task creation step
- A consultant notification step
- Proper dependency ordering

## How to Apply

### Prerequisites
1. Docker must be running
2. MySQL container must be accessible via docker-compose

### Option 1: Using PowerShell (Windows)
```powershell
.\scripts\apply-migration-003.ps1
```

### Option 2: Using Bash (Linux/Mac/WSL)
```bash
chmod +x scripts/apply-migration-003.sh
./scripts/apply-migration-003.sh
```

### Option 3: Manual Application
```bash
# Start MySQL if not running
docker compose up -d mysql

# Apply migration
docker compose exec -T mysql mysql -uroot -prootpass incident_flow < db/003_auto_resolution.sql
```

## Verification

After applying the migration, verify:

### 1. New Tables Exist
```sql
SHOW TABLES LIKE '%evaluations%';
SHOW TABLES LIKE '%protocols%';
SHOW TABLES LIKE '%resolutions%';
SHOW TABLES LIKE '%mappings%';
```

### 2. Columns Were Added
```sql
DESCRIBE incidents;
DESCRIBE proposed_actions;
```

Look for:
- `incidents.risk_level`
- `incidents.resolved_at`
- `proposed_actions.original_parameters`
- `proposed_actions.modified_by`
- `proposed_actions.modified_at`

### 3. Protocols Were Populated
```sql
SELECT id, category, name, version, is_active FROM protocols;
```

Should return 6 protocols.

### 4. Indexes Were Created
```sql
SHOW INDEX FROM incidents WHERE Key_name LIKE '%risk%';
SHOW INDEX FROM risk_evaluations;
SHOW INDEX FROM protocols;
```

## Rollback

If you need to rollback this migration:

```sql
-- Drop new tables
DROP TABLE IF EXISTS pii_mappings;
DROP TABLE IF EXISTS auto_resolutions;
DROP TABLE IF EXISTS protocols;
DROP TABLE IF EXISTS risk_evaluations;

-- Remove columns from incidents
ALTER TABLE incidents 
    DROP COLUMN risk_level,
    DROP COLUMN resolved_at,
    DROP INDEX idx_risk_level,
    DROP INDEX idx_status_risk,
    DROP INDEX idx_status_risk_created;

-- Remove columns from proposed_actions
ALTER TABLE proposed_actions
    DROP COLUMN original_parameters,
    DROP COLUMN modified_by,
    DROP COLUMN modified_at;
```

## Related Requirements

This migration supports the following requirements from the spec:
- **1.2**: Risk level classification
- **2.6**: Resolved timestamp tracking
- **4.1**: Audit trail for actions
- **5.1, 5.2**: Protocol storage and retrieval
- **9.3**: PII mapping storage

## Next Steps

After applying this migration:
1. Implement Risk Evaluator service (`src/ai/risk-evaluator.service.ts`)
2. Implement Protocol Manager service (`src/auto-resolution/protocol-manager.service.ts`)
3. Implement Auto Resolver service (`src/auto-resolution/auto-resolver.service.ts`)
4. Update Incident Agent to integrate risk evaluation
5. Implement PII encryption and mapping services

## Notes

- All JSON columns use MySQL's native JSON type for efficient querying
- Soft delete is used for protocols (via `archived_at`) to maintain audit trail
- All foreign keys use `ON DELETE CASCADE` except where historical data must be preserved
- Indexes are optimized for common query patterns identified in the design document
- Protocol steps use dependency arrays to enable parallel execution where possible
