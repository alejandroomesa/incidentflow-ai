import type { AIProvider, ClassificationRequest, ClassificationResult } from './ai-provider.interface.js';

/**
 * Seam for a future Gemini implementation — not wired up. IncidentFlow AI uses
 * ClaudeProvider as the active provider (see incident-agent.ts).
 */
export class GeminiProvider implements AIProvider {
  async classifyIncident(_req: ClassificationRequest): Promise<ClassificationResult> {
    throw new Error('GeminiProvider is not implemented yet. Use ClaudeProvider or implement this class.');
  }
}
