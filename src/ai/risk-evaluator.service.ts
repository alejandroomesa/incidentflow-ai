import { pool } from '../config/database.js';
import { auditService } from '../audit/audit.service.js';
import type {
  RiskEvaluatorInput,
  RiskEvaluationResult,
  RiskFactor,
  RiskLevel,
} from './risk-evaluator.schema.js';

/**
 * Risk Evaluator Service
 * 
 * Evaluates the risk level of an incident based on multiple factors:
 * - Severity (40 points max)
 * - Category (30 points max)
 * - Confidence (20 points max)
 * - Metadata (15 points max)
 * 
 * Classification:
 * - score >= 60: high risk
 * - score >= 30: medium risk
 * - score < 30: low risk
 */

interface CategoryRiskMapping {
  weight: number;
  reason: string;
}

const CATEGORY_RISK_WEIGHTS: Record<string, CategoryRiskMapping> = {
  data_breach_external_disclosure: { weight: 30, reason: 'External data breach poses critical security risk' },
  unauthorized_access: { weight: 30, reason: 'Unauthorized access indicates potential security compromise' },
  improper_data_sharing: { weight: 20, reason: 'Data sharing violation may lead to compliance issues' },
  physical_security: { weight: 20, reason: 'Physical security breach requires immediate attention' },
  phishing_social_engineering: { weight: 15, reason: 'Social engineering attempt detected' },
  data_loss_destruction: { weight: 25, reason: 'Data loss may impact business operations' },
  system_misconfiguration: { weight: 10, reason: 'System misconfiguration detected' },
  other: { weight: 10, reason: 'Uncategorized incident requires review' },
};

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 40,
  high: 30,
  medium: 15,
  low: 5,
};

/**
 * Calculate risk score and classify risk level
 */
function calculateRiskScore(input: RiskEvaluatorInput): {
  score: number;
  factors: RiskFactor[];
} {
  const factors: RiskFactor[] = [];
  let score = 0;

  // Factor 1: Severity (40 points max)
  const severityWeight = SEVERITY_WEIGHTS[input.severity] || 5;
  score += severityWeight;
  factors.push({
    name: 'severity',
    value: input.severity,
    weight: severityWeight,
  });

  // Factor 2: Category (30 points max)
  const categoryMapping = CATEGORY_RISK_WEIGHTS[input.category] || CATEGORY_RISK_WEIGHTS.other;
  score += categoryMapping.weight;
  factors.push({
    name: 'category',
    value: input.category,
    weight: categoryMapping.weight,
  });

  // Factor 3: Confidence (20 points max)
  // Low confidence increases risk score
  if (input.confidence < 0.6) {
    score += 20;
    factors.push({
      name: 'low_confidence',
      value: input.confidence,
      weight: 20,
    });
  } else if (input.confidence < 0.8) {
    score += 10;
    factors.push({
      name: 'medium_confidence',
      value: input.confidence,
      weight: 10,
    });
  }

  // Factor 4: Metadata (15 points max)
  if (input.metadata) {
    const affectedUsers = input.metadata.affectedUsers;
    if (typeof affectedUsers === 'number' && affectedUsers > 100) {
      score += 15;
      factors.push({
        name: 'many_affected_users',
        value: affectedUsers,
        weight: 15,
      });
    } else if (typeof affectedUsers === 'number' && affectedUsers > 10) {
      score += 10;
      factors.push({
        name: 'multiple_affected_users',
        value: affectedUsers,
        weight: 10,
      });
    }

    const dataVolume = input.metadata.dataVolume;
    if (typeof dataVolume === 'string' && ['large', 'critical'].includes(dataVolume)) {
      score += 10;
      factors.push({
        name: 'large_data_volume',
        value: dataVolume,
        weight: 10,
      });
    }
  }

  return { score, factors };
}

/**
 * Classify risk level based on score
 */
function classifyRiskLevel(score: number): { riskLevel: RiskLevel; rationale: string } {
  if (score >= 60) {
    return {
      riskLevel: 'high',
      rationale: 'High risk due to critical severity and/or sensitive category requiring immediate human review',
    };
  }
  
  if (score >= 30) {
    return {
      riskLevel: 'medium',
      rationale: 'Medium risk requiring human review before automated action',
    };
  }
  
  return {
    riskLevel: 'low',
    rationale: 'Low risk suitable for automated resolution following predefined protocols',
  };
}

/**
 * Evaluate risk for an incident
 * Always returns a valid result, defaults to 'high' on error for safety
 */
export async function evaluateRisk(
  incidentId: number,
  input: RiskEvaluatorInput
): Promise<RiskEvaluationResult> {
  try {
    const { score, factors } = calculateRiskScore(input);
    const { riskLevel, rationale } = classifyRiskLevel(score);

    const result: RiskEvaluationResult = {
      riskLevel,
      rationale,
      factors,
    };

    // Store evaluation in database
    await storeRiskEvaluation(incidentId, result);

    // Update incidents table with risk_level
    await updateIncidentRiskLevel(incidentId, riskLevel);

    // Log evaluation in audit
    await auditService.record({
      incidentId,
      event: 'risk_evaluated',
      actorType: 'system',
      metadata: {
        riskLevel,
        score,
        factorCount: factors.length,
      },
    });

    return result;
  } catch (error) {
    // On error, default to high risk for safety
    await auditService.record({
      incidentId,
      event: 'risk_evaluation_failed',
      actorType: 'system',
      metadata: { error: String(error) },
    });

    const safeResult: RiskEvaluationResult = {
      riskLevel: 'high',
      rationale: 'Failed to evaluate risk, defaulting to high for safety',
      factors: [],
    };

    // Still try to store the safe result
    try {
      await storeRiskEvaluation(incidentId, safeResult);
      await updateIncidentRiskLevel(incidentId, 'high');
    } catch {
      // Ignore storage errors in fallback path
    }

    return safeResult;
  }
}

/**
 * Store risk evaluation in risk_evaluations table
 */
async function storeRiskEvaluation(
  incidentId: number,
  result: RiskEvaluationResult
): Promise<void> {
  await pool.execute(
    `INSERT INTO risk_evaluations (incident_id, risk_level, rationale, factors)
     VALUES (?, ?, ?, ?)`,
    [incidentId, result.riskLevel, result.rationale, JSON.stringify(result.factors)]
  );
}

/**
 * Update incidents table with risk_level
 */
async function updateIncidentRiskLevel(incidentId: number, riskLevel: RiskLevel): Promise<void> {
  await pool.execute(
    `UPDATE incidents SET risk_level = ? WHERE id = ?`,
    [riskLevel, incidentId]
  );
}

/**
 * Get risk evaluation for an incident
 */
export async function getRiskEvaluation(incidentId: number): Promise<RiskEvaluationResult | null> {
  const [rows] = await pool.execute<any[]>(
    `SELECT risk_level, rationale, factors, evaluated_at 
     FROM risk_evaluations 
     WHERE incident_id = ? 
     ORDER BY evaluated_at DESC 
     LIMIT 1`,
    [incidentId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    riskLevel: row.risk_level,
    rationale: row.rationale,
    factors: typeof row.factors === 'string' ? JSON.parse(row.factors) : row.factors,
  };
}
