CREATE DATABASE IF NOT EXISTS incident_flow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE incident_flow;

CREATE TABLE incidents (
  id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  external_id            VARCHAR(100)  NULL,
  company_name           VARCHAR(255)  NOT NULL,
  source                 VARCHAR(50)   NOT NULL DEFAULT 'manual',
  description            TEXT          NOT NULL,
  reported_by            VARCHAR(255)  NULL,
  category               VARCHAR(64)   NULL,
  severity               ENUM('low','medium','high','critical') NULL,
  confidence             DECIMAL(4,3)  NULL,
  status                 ENUM('pending','analyzing','classified','action_pending','resolved','rejected')
                                       NOT NULL DEFAULT 'pending',
  requires_human_review  BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_incidents_status (status),
  INDEX idx_incidents_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE agent_runs (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id        BIGINT UNSIGNED NOT NULL,
  provider           VARCHAR(50)  NOT NULL,
  model              VARCHAR(100) NOT NULL,
  input_hash         CHAR(64)     NOT NULL,
  structured_output  JSON         NULL,
  status             ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  error_message      TEXT         NULL,
  duration_ms        INT UNSIGNED NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_agent_runs_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  INDEX idx_agent_runs_incident (incident_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE proposed_actions (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id    BIGINT UNSIGNED NOT NULL,
  agent_run_id   BIGINT UNSIGNED NULL,
  action_type    VARCHAR(50)  NOT NULL,
  title          VARCHAR(255) NOT NULL,
  priority       ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  parameters     JSON         NULL,
  status         ENUM('pending','approved','rejected','executed','failed') NOT NULL DEFAULT 'pending',
  approved_by    VARCHAR(255) NULL,
  approved_at    TIMESTAMP    NULL,
  executed_at    TIMESTAMP    NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_proposed_actions_incident  FOREIGN KEY (incident_id)  REFERENCES incidents(id)  ON DELETE CASCADE,
  CONSTRAINT fk_proposed_actions_agent_run FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
  INDEX idx_proposed_actions_incident (incident_id),
  INDEX idx_proposed_actions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_logs (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id    BIGINT UNSIGNED NULL,
  event          VARCHAR(100) NOT NULL,
  actor_type     ENUM('system','ai_agent','human') NOT NULL,
  actor_id       VARCHAR(255) NULL,
  metadata       JSON NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_logs_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  INDEX idx_audit_logs_incident (incident_id),
  INDEX idx_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE webhook_deliveries (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  delivery_id    VARCHAR(100) NOT NULL,
  event_type     VARCHAR(100) NOT NULL,
  incident_id    BIGINT UNSIGNED NULL,
  received_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_webhook_deliveries_delivery_id (delivery_id),
  CONSTRAINT fk_webhook_deliveries_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
