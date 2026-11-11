import { describe, expect, it } from 'vitest';
import { AgentOutputSchema, BilingualAgentOutputSchema } from '../src/ai/agent-output.schema.js';

const validPayload = {
  category: 'data_breach_external_disclosure',
  severity: 'high',
  confidence: 0.82,
  reasoning: 'Based on the description, this appears to be an accidental external disclosure.',
  reasoningEs: 'Según la descripción, parece una divulgación externa accidental.',
  reasoningEn: 'Based on the description, this appears to be an accidental external disclosure.',
  descriptionEs: 'Un empleado envió datos por error.',
  descriptionEn: 'An employee sent data by mistake.',
  requiresHumanReview: true,
  proposedActions: [
    { type: 'notify_consultant', title: 'Avisar al equipo de privacidad', titleEs: 'Avisar al equipo de privacidad', titleEn: 'Notify the privacy team', priority: 'high', parameters: {} },
  ],
};

describe('AgentOutputSchema', () => {
  it('accepts a valid payload', () => {
    const result = AgentOutputSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects a missing category', () => {
    const { category, ...rest } = validPayload;
    expect(AgentOutputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an unknown category', () => {
    const result = AgentOutputSchema.safeParse({ ...validPayload, category: 'not_a_real_category' });
    expect(result.success).toBe(false);
  });

  it('rejects confidence outside [0,1]', () => {
    expect(AgentOutputSchema.safeParse({ ...validPayload, confidence: 1.5 }).success).toBe(false);
    expect(AgentOutputSchema.safeParse({ ...validPayload, confidence: -0.1 }).success).toBe(false);
  });

  it('rejects a reasoning string that is too short', () => {
    const result = AgentOutputSchema.safeParse({ ...validPayload, reasoning: 'too short' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown proposedActions[].type', () => {
    const result = AgentOutputSchema.safeParse({
      ...validPayload,
      proposedActions: [{ type: 'delete_all_data', title: 'x', priority: 'high', parameters: {} }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 5 proposed actions', () => {
    const action = validPayload.proposedActions[0];
    const result = AgentOutputSchema.safeParse({
      ...validPayload,
      proposedActions: Array(6).fill(action),
    });
    expect(result.success).toBe(false);
  });

  it('defaults requiresHumanReview to true when omitted', () => {
    const { requiresHumanReview, ...rest } = validPayload;
    const result = AgentOutputSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.requiresHumanReview).toBe(true);
  });

  it('requires both languages for new AI responses', () => {
    expect(BilingualAgentOutputSchema.safeParse(validPayload).success).toBe(true);
    const { reasoningEn, ...incomplete } = validPayload;
    expect(BilingualAgentOutputSchema.safeParse(incomplete).success).toBe(false);
  });
});
