import { describe, expect, it } from 'vitest';
import { AgentOutputSchema } from '../src/ai/agent-output.schema.js';

const validPayload = {
  category: 'data_breach_external_disclosure',
  severity: 'high',
  confidence: 0.82,
  reasoning: 'Based on the description, this appears to be an accidental external disclosure.',
  requiresHumanReview: true,
  proposedActions: [
    { type: 'notify_consultant', title: 'Notify privacy team', priority: 'high', parameters: {} },
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
});
