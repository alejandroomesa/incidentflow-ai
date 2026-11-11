import { NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import { auditService } from '../../audit/audit.service.js';
import { createInternalTask } from '../../tools/create-task.tool.js';
import { notifyConsultant } from '../../tools/notify-consultant.tool.js';
import {
  incidentRepository,
  proposedActionRepository,
  type IncidentRow,
  type ProposedActionRow,
} from './incident.repository.js';
import type { CreateIncidentInput } from './incident.schema.js';

export const incidentService = {
  async createIncident(input: CreateIncidentInput): Promise<IncidentRow> {
    const id = await incidentRepository.create(input);
    await auditService.record({
      incidentId: id,
      event: 'incident_created',
      actorType: 'system',
      metadata: { source: input.source },
    });
    const incident = await incidentRepository.findById(id);
    if (!incident) throw new NotFoundError('Incident not found after creation');
    return incident;
  },

  async listIncidents(): Promise<IncidentRow[]> {
    return incidentRepository.findAll();
  },

  async getIncident(id: number): Promise<IncidentRow> {
    const incident = await incidentRepository.findById(id);
    if (!incident) throw new NotFoundError(`Incident ${id} not found`);
    return incident;
  },

  async listProposedActions(incidentId: number): Promise<ProposedActionRow[]> {
    return proposedActionRepository.findAllByIncident(incidentId);
  },

  async approveAction(incidentId: number, actionId: number, approvedBy: string): Promise<void> {
    const action = await proposedActionRepository.findById(actionId);
    if (!action || action.incident_id !== incidentId) throw new NotFoundError('Proposed action not found');
    if (action.status !== 'pending') {
      throw new ValidationError(`Action is not pending (status=${action.status})`);
    }

    await proposedActionRepository.markApproved(actionId, approvedBy);
    await auditService.record({
      incidentId,
      event: 'action_approved',
      actorType: 'human',
      actorId: approvedBy,
      metadata: { actionId },
    });

    const parameters = (action.parameters ?? {}) as Record<string, unknown>;

    try {
      if (action.action_type === 'create_internal_task') {
        await createInternalTask({ incidentId, title: action.title, priority: action.priority });
      } else if (action.action_type === 'notify_consultant') {
        await notifyConsultant({ incidentId, team: (parameters.team as string) ?? 'privacy-consultants' });
      } else {
        throw new ValidationError(`Unknown action_type: ${action.action_type}`);
      }

      await proposedActionRepository.markExecuted(actionId);
      await auditService.record({
        incidentId,
        event: 'action_executed',
        actorType: 'system',
        metadata: { actionId, actionType: action.action_type },
      });
    } catch (err) {
      await proposedActionRepository.markFailed(actionId);
      await auditService.record({
        incidentId,
        event: 'action_execution_failed',
        actorType: 'system',
        metadata: { actionId, error: String(err) },
      });
      throw err;
    }
  },

  async rejectAction(incidentId: number, actionId: number, rejectedBy: string, reason?: string): Promise<void> {
    const action = await proposedActionRepository.findById(actionId);
    if (!action || action.incident_id !== incidentId) throw new NotFoundError('Proposed action not found');
    if (action.status !== 'pending') {
      throw new ValidationError(`Action is not pending (status=${action.status})`);
    }

    await proposedActionRepository.markRejected(actionId);
    await auditService.record({
      incidentId,
      event: 'action_rejected',
      actorType: 'human',
      actorId: rejectedBy,
      metadata: { actionId, reason: reason ?? null },
    });
  },
};
