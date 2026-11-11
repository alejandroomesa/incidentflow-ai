import type { AgentOutput } from './agent-output.schema.js';

export interface ClassificationRequest {
  incidentId: number;
  companyName: string;
  source: string;
  anonymizedDescription: string;
  reportedBy: string | null;
}

export interface ClassificationResult {
  output: AgentOutput;
  inputHash: string;
  model: string;
  provider: string;
  durationMs: number;
}

export interface AIProvider {
  classifyIncident(req: ClassificationRequest): Promise<ClassificationResult>;
}
