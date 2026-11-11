import { createHash } from 'node:crypto';
import OpenAI, { APIError } from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionCreateParamsNonStreaming,
} from 'openai/resources/index.js';
import { env } from '../config/env.js';
import { getInternalProtocol } from '../tools/get-protocol.tool.js';
import { saveAuditEvent } from '../tools/save-audit-event.tool.js';
import { AIProviderError } from '../shared/errors/app-error.js';
import { AgentOutputSchema } from './agent-output.schema.js';
import type { AIProvider, ClassificationRequest, ClassificationResult } from './ai-provider.interface.js';

// Routed via OpenRouter (OpenAI-compatible chat completions API) to a Claude model.
// See env.CLAUDE_MODEL for the active model slug (e.g. "anthropic/claude-opus-4.8").

const MAX_ITERATIONS = 4;

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

TOOLS AVAILABLE TO YOU:
- get_internal_protocol(category): look up this firm's internal handling protocol
  for a category, to inform which actions you propose.
- save_audit_event(action, performedBy): log an internal audit trail note about your
  own analysis process (performedBy should always be "ai_agent").
- return_classification(...): call this exactly once, as your LAST action, with your
  final structured classification. Do not produce any other free-text final answer.

Respond only via tool calls. Do not add commentary outside tool calls.`;

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_internal_protocol',
      description: "Look up this firm's internal handling protocol for an incident category.",
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'The incident category to look up' },
        },
        required: ['category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_audit_event',
      description: 'Log an internal audit trail note about the analysis process.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          performedBy: { type: 'string' },
        },
        required: ['action', 'performedBy'],
      },
    },
  },
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
          requiresHumanReview: { type: 'boolean' },
          proposedActions: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['create_internal_task', 'notify_consultant'] },
                title: { type: 'string' },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
                parameters: { type: 'object' },
              },
              required: ['type', 'title', 'priority'],
            },
          },
        },
        required: ['category', 'severity', 'confidence', 'reasoning', 'requiresHumanReview', 'proposedActions'],
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
    });
  }

  private async createCompletion(params: ChatCompletionCreateParamsNonStreaming & { reasoning?: { enabled: boolean } }) {
    try {
      return await this.client.chat.completions.create(params);
    } catch (err) {
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
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(req) },
    ];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const forcingFinal = i === MAX_ITERATIONS - 1;
      const response = await this.createCompletion({
        model: env.CLAUDE_MODEL,
        // Some models (e.g. free ones) mandate reasoning and reject `reasoning: {enabled: false}`,
        // so we don't force it off — instead we budget enough max_tokens to cover both the
        // reasoning trace and the final tool-call JSON.
        max_tokens: 2000,
        tools,
        tool_choice: forcingFinal ? { type: 'function', function: { name: 'return_classification' } } : 'auto',
        messages,
      });

      const message = response.choices[0]?.message;
      if (!message) throw new Error('Empty response from AI provider');

      messages.push(message);

      const toolCalls = message.tool_calls ?? [];
      const finalCall = toolCalls.find((c) => c.type === 'function' && c.function.name === 'return_classification');

      if (finalCall && finalCall.type === 'function') {
        const parsed = AgentOutputSchema.parse(JSON.parse(finalCall.function.arguments));
        return {
          output: parsed,
          inputHash: sha256(req.anonymizedDescription),
          model: env.CLAUDE_MODEL,
          provider: 'openrouter',
          durationMs: Date.now() - startedAt,
        };
      }

      if (toolCalls.length === 0) {
        // Model responded with no tool calls at all — nudge it back on track.
        messages.push({
          role: 'user',
          content: 'You must respond using tool calls only. Call return_classification with your final answer.',
        });
        continue;
      }

      for (const call of toolCalls) {
        if (call.type !== 'function') continue;
        let content: string;
        try {
          if (call.function.name === 'get_internal_protocol') {
            const args = JSON.parse(call.function.arguments) as { category: string };
            content = getInternalProtocol(args.category);
          } else if (call.function.name === 'save_audit_event') {
            const args = JSON.parse(call.function.arguments) as { action: string; performedBy: string };
            await saveAuditEvent({ incidentId: req.incidentId, action: args.action, performedBy: args.performedBy });
            content = 'ok';
          } else {
            content = `Unknown tool: ${call.function.name}`;
          }
        } catch (err) {
          content = `Tool error: ${String(err)}`;
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }

    throw new Error('Agent did not produce a classification within iteration budget');
  }
}
