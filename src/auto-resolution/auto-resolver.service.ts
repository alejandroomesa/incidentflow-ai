import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { auditService } from '../audit/audit.service.js';
import { incidentRepository } from '../modules/incidents/incident.repository.js';
import { protocolManager } from '../modules/protocols/protocol-manager.service.js';
import type { ProtocolStep } from '../modules/protocols/protocol.schema.js';
import { createInternalTask } from '../tools/create-task.tool.js';
import { notifyConsultant } from '../tools/notify-consultant.tool.js';
import { restartService } from '../tools/restart-service.tool.js';
import type { AutoResolverInput, ExecutedAction, ResolutionResult, ResolutionStatus } from './auto-resolver.schema.js';

const MAX_ACTION_ATTEMPTS = 3;

/**
 * Execute all protocol steps for a low-risk incident.
 * Groups steps into dependency-respecting batches (topological sort over
 * `step.dependencies`, which reference array indices) and runs each batch in
 * parallel; batches run sequentially. Stops at the first batch containing a
 * failed step.
 */
export async function resolveIncident(input: AutoResolverInput): Promise<ResolutionResult> {
  const protocol = await protocolManager.getByCategory(input.category);

  if (!protocol) {
    await incidentRepository.updateStatus(input.incidentId, 'requiring_approval');
    await auditService.record({
      incidentId: input.incidentId,
      event: 'approval_required',
      actorType: 'system',
      metadata: { reason: 'no_protocol_for_category', category: input.category },
    });
    return { status: 'failed', executedActions: [] };
  }

  const startedAt = new Date();
  const executedActions: ExecutedAction[] = [];
  let failure: { stepIndex: number; error: string } | null;

  try {
    failure = await withTimeout(
      runBatches(protocol.steps, input.incidentId, executedActions),
      env.AUTO_RESOLVE_TIMEOUT_MS,
      `Auto-resolution timed out after ${env.AUTO_RESOLVE_TIMEOUT_MS}ms`,
    );
  } catch (timeoutError) {
    // Approximate the failing step as the next one that hadn't completed yet.
    failure = {
      stepIndex: executedActions.length,
      error: timeoutError instanceof Error ? timeoutError.message : String(timeoutError),
    };
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  if (failure) {
    await incidentRepository.updateStatus(input.incidentId, 'failed');
    await storeAutoResolution(input.incidentId, protocol.id, 'failed', executedActions, failure.stepIndex, startedAt, completedAt, durationMs);
    return { status: 'failed', executedActions, failedAction: failure };
  }

  await incidentRepository.markResolved(input.incidentId, completedAt);
  await auditService.record({
    incidentId: input.incidentId,
    event: 'incident_auto_resolved',
    actorType: 'system',
    metadata: { actionsCount: executedActions.length },
  });
  await storeAutoResolution(input.incidentId, protocol.id, 'resolved', executedActions, null, startedAt, completedAt, durationMs);

  return { status: 'resolved', executedActions, resolvedAt: completedAt };
}

/**
 * Groups step array-indices into batches: all steps in a batch have every
 * dependency satisfied by a previous batch, so they can run in parallel.
 */
function buildBatches(steps: ProtocolStep[]): number[][] {
  const n = steps.length;
  const indegree = new Array<number>(n).fill(0);
  const dependents: number[][] = Array.from({ length: n }, () => []);

  steps.forEach((step, i) => {
    const deps = step.dependencies ?? [];
    indegree[i] = deps.length;
    deps.forEach((depIndex) => dependents[depIndex]?.push(i));
  });

  const batches: number[][] = [];
  const remaining = new Set(steps.map((_, i) => i));

  while (remaining.size > 0) {
    const batch = [...remaining].filter((i) => indegree[i] === 0);
    if (batch.length === 0) {
      // Should be unreachable: ProtocolManagerService.validate() rejects circular
      // dependencies before a protocol can ever be stored.
      throw new Error('Cyclic dependency detected among protocol steps');
    }
    batches.push(batch);
    batch.forEach((i) => {
      remaining.delete(i);
      dependents[i].forEach((dependent) => {
        indegree[dependent] -= 1;
      });
    });
  }

  return batches;
}

async function runBatches(
  steps: ProtocolStep[],
  incidentId: number,
  executedActions: ExecutedAction[],
): Promise<{ stepIndex: number; error: string } | null> {
  const batches = buildBatches(steps);

  for (const batch of batches) {
    const settled = await Promise.allSettled(
      batch.map((stepIndex) => runStep(steps[stepIndex], stepIndex, incidentId, executedActions)),
    );

    const failedIndex = settled.findIndex((r) => r.status === 'rejected');
    if (failedIndex !== -1) {
      const stepIndex = batch[failedIndex];
      const reason = (settled[failedIndex] as PromiseRejectedResult).reason;
      return { stepIndex, error: reason instanceof Error ? reason.message : String(reason) };
    }
  }

  return null;
}

async function runStep(
  step: ProtocolStep,
  stepIndex: number,
  incidentId: number,
  executedActions: ExecutedAction[],
): Promise<void> {
  await auditService.record({
    incidentId,
    event: 'action_execution_started',
    actorType: 'system',
    metadata: { stepIndex, actionType: step.actionType },
  });

  try {
    const output = await executeWithRetry(step, incidentId);
    executedActions.push({
      actionType: step.actionType,
      title: step.title,
      parameters: step.parameters,
      result: 'success',
      executedAt: new Date(),
      output,
    });
    await auditService.record({
      incidentId,
      event: 'action_execution_success',
      actorType: 'system',
      metadata: { stepIndex, actionType: step.actionType },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    executedActions.push({
      actionType: step.actionType,
      title: step.title,
      parameters: step.parameters,
      result: 'error',
      executedAt: new Date(),
      errorMessage,
    });
    await auditService.record({
      incidentId,
      event: 'action_execution_failed',
      actorType: 'system',
      metadata: { stepIndex, actionType: step.actionType, error: errorMessage },
    });
    throw error;
  }
}

/** Retries with exponential backoff (max 3 attempts), each attempt bounded by ACTION_TIMEOUT_MS. */
async function executeWithRetry(step: ProtocolStep, incidentId: number): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ACTION_ATTEMPTS; attempt++) {
    try {
      return await withTimeout(
        executeSingleAction(step, incidentId),
        env.ACTION_TIMEOUT_MS,
        `Action "${step.actionType}" timed out after ${env.ACTION_TIMEOUT_MS}ms`,
      );
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ACTION_ATTEMPTS) {
        await sleep(2 ** attempt * 1000);
      }
    }
  }

  throw lastError;
}

async function executeSingleAction(step: ProtocolStep, incidentId: number): Promise<unknown> {
  switch (step.actionType) {
    case 'create_task': {
      const priority = (step.parameters.priority as 'low' | 'medium' | 'high' | 'urgent') ?? 'medium';
      return createInternalTask({ incidentId, title: step.title, priority });
    }

    case 'notify_consultant': {
      const team = (step.parameters.team as string) ?? 'consultants';
      return notifyConsultant({ incidentId, team });
    }

    case 'restart_service': {
      const result = await restartService({
        incidentId,
        serviceName: step.parameters.serviceName as string,
        timeout: step.parameters.timeout as number | undefined,
        force: step.parameters.force as boolean | undefined,
      });
      if (!result.success) {
        throw new Error(result.errorMessage ?? `Failed to restart service ${String(step.parameters.serviceName)}`);
      }
      return result;
    }

    default:
      throw new Error(`Unsupported actionType: ${step.actionType}`);
  }
}

async function storeAutoResolution(
  incidentId: number,
  protocolId: number,
  status: ResolutionStatus,
  executedActions: ExecutedAction[],
  failedActionIndex: number | null,
  startedAt: Date,
  completedAt: Date,
  durationMs: number,
): Promise<void> {
  await pool.execute(
    `INSERT INTO auto_resolutions (incident_id, protocol_id, status, executed_actions, failed_action_index, started_at, completed_at, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [incidentId, protocolId, status, JSON.stringify(executedActions), failedActionIndex, startedAt, completedAt, durationMs],
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
