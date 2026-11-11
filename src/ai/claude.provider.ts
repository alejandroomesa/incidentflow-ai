import { createHash } from 'node:crypto';
import OpenAI, { APIConnectionTimeoutError, APIError } from 'openai';
import type {
  ChatCompletionTool,
  ChatCompletionCreateParamsNonStreaming,
} from 'openai/resources/index.js';
import { env } from '../config/env.js';
import { AIProviderError } from '../shared/errors/app-error.js';
import { BilingualAgentOutputSchema } from './agent-output.schema.js';
import type { AIProvider, ClassificationRequest, ClassificationResult } from './ai-provider.interface.js';

// Routed via OpenRouter (OpenAI-compatible chat completions API) to a Claude model.
// See env.CLAUDE_MODEL for the active model slug (e.g. "anthropic/claude-opus-4.8").

const SYSTEM_PROMPT = `You are an internal classification and triage support tool used by data-protection
consultants at a consulting firm. You assist consultants in categorizing reported
personal-data incidents and proposing next-step actions. You are NOT a lawyer and
you have NO authority to issue a final legal or regulatory determination.

HARD CONSTRAINTS (violating these makes your output unusable):
1. Never state or imply a definitive legal conclusion — e.g. never assert that an
   incident "does" or "does not" require notifying a supervisory authority (AEPD) or
   data subjects as established fact. If you have a view, phrase it as a preliminary,
   non-binding suggestion for the human consultant to evaluate.
2. Always set requiresHumanReview to true. Every output you produce is provisional
   until a human consultant reviews and approves it.
3. Do not use language implying the case is closed, resolved, or legally settled.
4. Your "reasoning" field is a classification support note, not a ruling — write it
   as "Based on the description, this appears to be..." not "This incident is...".
5. You cannot execute create_internal_task or notify_consultant yourself — they are
   not available to you. Only propose them in proposedActions; a human approves them.

Use these internal guidelines when proposing actions: contain the exposure, identify
affected data and recipients, preserve evidence, rotate credentials when relevant,
and escalate regulatory questions to the privacy consultant. Return faithful Spanish
and English versions of the incident description, reasoning and every action title.
Keep "reasoning" and "title" in Spanish as backwards-compatible fallbacks.

Call return_classification exactly once. Respond only with that tool call and do not
add commentary outside it.`;

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      // KEEP IN SYNC WITH agent-output.schema.ts — Zod validation on the parsed
      // arguments is the real enforcement gate, this schema is a hint to the model.
      name: 'return_classification',
      description: 'Return the final structured classification. Call this exactly once, as the last step.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: [
              'unauthorized_access',
              'data_breach_external_disclosure',
              'improper_data_sharing',
              'data_loss_destruction',
              'phishing_social_engineering',
              'system_misconfiguration',
              'physical_security',
              'other',
            ],
          },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: { type: 'string' },
          reasoningEs: { type: 'string', description: 'Classification explanation in Spanish' },
          reasoningEn: { type: 'string', description: 'Classification explanation in English' },
          descriptionEs: { type: 'string', description: 'Faithful Spanish translation of the incident description' },
          descriptionEn: { type: 'string', description: 'Faithful English translation of the incident description' },
          requiresHumanReview: { type: 'boolean' },
          proposedActions: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['create_internal_task', 'notify_consultant'] },
                title: { type: 'string' },
                titleEs: { type: 'string', description: 'Action title in Spanish' },
                titleEn: { type: 'string', description: 'Action title in English' },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
                parameters: { type: 'object' },
              },
              required: ['type', 'title', 'titleEs', 'titleEn', 'priority'],
            },
          },
        },
        required: ['category', 'severity', 'confidence', 'reasoning', 'reasoningEs', 'reasoningEn', 'descriptionEs', 'descriptionEn', 'requiresHumanReview', 'proposedActions'],
      },
    },
  },
];

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function buildUserPrompt(req: ClassificationRequest): string {
  return `Incident report to classify (personal data already anonymized where detected):

Company: ${req.companyName}
Source: ${req.source}
Reported by: ${req.reportedBy ?? 'unknown'}

Description:
${req.anonymizedDescription}

Analyze this and call return_classification with your structured output.`;
}

export class ClaudeProvider implements AIProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL,
      timeout: env.AI_REQUEST_TIMEOUT_MS,
      maxRetries: 0,
    });
  }

  private async createCompletion(params: ChatCompletionCreateParamsNonStreaming & { reasoning?: { enabled: boolean } }) {
    try {
      return await this.client.chat.completions.create(params);
    } catch (err) {
      if (err instanceof APIConnectionTimeoutError) {
        throw new AIProviderError(
          `El proveedor de IA no respondió en ${Math.round(env.AI_REQUEST_TIMEOUT_MS / 1000)} segundos. ` +
            'Los modelos gratuitos pueden estar saturados; inténtalo de nuevo.',
          504,
        );
      }
      if (err instanceof APIError) {
        if (err.status === 402) {
          throw new AIProviderError(
            'OpenRouter no tiene créditos suficientes para completar el análisis con IA. ' +
              'Añade crédito en https://openrouter.ai/settings/credits y vuelve a intentarlo.',
            502,
          );
        }
        if (err.status === 429) {
          throw new AIProviderError('Se alcanzó el límite de peticiones de OpenRouter. Inténtalo de nuevo en unos segundos.', 502);
        }
        if (err.status === 401) {
          throw new AIProviderError('La API key de OpenRouter (OPENROUTER_API_KEY) no es válida o ha expirado.', 502);
        }
        if (err.status === 404) {
          throw new AIProviderError(`El modelo configurado "${params.model}" no está disponible en OpenRouter.`, 502);
        }
        throw new AIProviderError(`Error del proveedor de IA (OpenRouter): ${err.message}`, 502);
      }
      throw new AIProviderError(`No se pudo contactar con el proveedor de IA (OpenRouter): ${String(err)}`, 502);
    }
  }

  async classifyIncident(req: ClassificationRequest): Promise<ClassificationResult> {
    const startedAt = Date.now();
    const response = await this.createCompletion({
      model: env.CLAUDE_MODEL,
      max_tokens: env.AI_MAX_TOKENS,
      tools,
      tool_choice: { type: 'function', function: { name: 'return_classification' } },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(req) },
      ],
    });

    const message = response.choices[0]?.message;
    const finalCall = message?.tool_calls?.find(
      (call) => call.type === 'function' && call.function.name === 'return_classification',
    );
    if (!finalCall || finalCall.type !== 'function') {
      throw new AIProviderError('El modelo no devolvió una clasificación estructurada válida. Inténtalo de nuevo.', 502);
    }

    const parsed = BilingualAgentOutputSchema.parse(JSON.parse(finalCall.function.arguments));
    return {
      output: parsed,
      inputHash: sha256(req.anonymizedDescription),
      model: env.CLAUDE_MODEL,
      provider: 'openrouter',
      durationMs: Date.now() - startedAt,
    };
  }
}
