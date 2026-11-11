import { createHash } from 'node:crypto';
import { auditService } from '../audit/audit.service.js';
import { env } from '../config/env.js';
import { NotFoundError } from '../shared/errors/app-error.js';
import { maskPII } from '../anonymization/pii-mask.js';
import {
  agentRunRepository,
  incidentRepository,
  proposedActionRepository,
} from '../modules/incidents/incident.repository.js';
import { ClaudeProvider } from './claude.provider.js';
import { evaluateRisk } from './risk-evaluator.service.js';
import { resolveIncident } from '../auto-resolution/auto-resolver.service.js';
import type { AgentOutput } from './agent-output.schema.js';
import type { AIProvider } from './ai-provider.interface.js';

const aiProvider: AIProvider = new ClaudeProvider();

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export async function runIncidentAnalysis(incidentId: number): Promise<AgentOutput> {
  const incident = await incidentRepository.findById(incidentId);
  if (!incident) throw new NotFoundError(`Incident ${incidentId} not found`);

  await incidentRepository.updateStatus(incidentId, 'analyzing');
  await auditService.record({ incidentId, event: 'analysis_started', actorType: 'system' });

  const anonymizedDescription = maskPII(incident.description);

  let result;
  try {
    result = await aiProvider.classifyIncident({
      incidentId,
      companyName: incident.company_name,
      source: incident.source,
      anonymizedDescription,
      reportedBy: incident.reported_by,
    });
  } catch (err) {
    await agentRunRepository.insertFailed(incidentId, {
      provider: 'openrouter',
      model: env.CLAUDE_MODEL,
      inputHash: sha256(anonymizedDescription),
      errorMessage: String(err),
    });
    await auditService.record({
      incidentId,
      event: 'analysis_failed',
      actorType: 'system',
      metadata: { error: String(err) },
    });
    await incidentRepository.updateStatus(incidentId, 'pending');
    throw err;
  }

  const agentRunId = await agentRunRepository.insertCompleted(incidentId, {
    provider: result.provider,
    model: result.model,
    inputHash: result.inputHash,
    structuredOutput: result.output,
    durationMs: result.durationMs,
  });

  await incidentRepository.updateClassification(incidentId, {
    category: result.output.category,
    severity: result.output.severity,
    confidence: result.output.confidence,
    requiresHumanReview: result.output.requiresHumanReview,
    status: 'classified',
  });

  for (const action of result.output.proposedActions) {
    await proposedActionRepository.insert(incidentId, agentRunId, {
      type: action.type,
      title: action.title,
      priority: action.priority,
      parameters: action.parameters,
    });
  }

  await auditService.record({
    incidentId,
    event: 'analysis_completed',
    actorType: 'ai_agent',
    actorId: 'ai_agent',
    metadata: { category: result.output.category, severity: result.output.severity },
  });

  // Evaluate risk after classification
  const riskEvaluation = await evaluateRisk(incidentId, {
    category: result.output.category,
    severity: result.output.severity,
    confidence: result.output.confidence,
    metadata: {}, // Can be extended with additional metadata from the incident
  });

  // Approval Gate (minimal): low risk auto-resolves via the protocol for this
  // category; medium/high risk is parked pending human review. Notifying the
  // responsible team and supporting modified actions before approval is the
  // full Approval Gate, not yet implemented.
  if (riskEvaluation.riskLevel === 'low') {
    await resolveIncident({ incidentId, category: result.output.category });
  } else {
    await incidentRepository.updateStatus(incidentId, 'requiring_approval');
    await auditService.record({
      incidentId,
      event: 'approval_required',
      actorType: 'system',
      metadata: { riskLevel: riskEvaluation.riskLevel, rationale: riskEvaluation.rationale },
    });
  }

  return result.output;
}
