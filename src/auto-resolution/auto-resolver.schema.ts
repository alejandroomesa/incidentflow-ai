import type { IncidentCategory } from '../ai/agent-output.schema.js';

export interface AutoResolverInput {
  incidentId: number;
  category: IncidentCategory;
  // Modified-actions override (used when a human edits proposed actions before
  // approving a medium/high risk incident) is deferred to the Approval Gate.
}

export type ResolutionStatus = 'resolved' | 'failed' | 'partial';

export interface ExecutedAction {
  actionType: string;
  title: string;
  parameters: Record<string, unknown>;
  result: 'success' | 'error';
  executedAt: Date;
  output?: unknown;
  errorMessage?: string;
}

export interface ResolutionResult {
  status: ResolutionStatus;
  executedActions: ExecutedAction[];
  failedAction?: {
    stepIndex: number;
    error: string;
  };
  resolvedAt?: Date;
}
