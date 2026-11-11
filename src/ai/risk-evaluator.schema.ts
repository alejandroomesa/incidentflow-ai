import { z } from 'zod';
import { IncidentCategorySchema, IncidentSeveritySchema } from './agent-output.schema.js';

export const RiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const RiskFactorSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number()]),
  weight: z.number(),
});
export type RiskFactor = z.infer<typeof RiskFactorSchema>;

export const RiskEvaluationResultSchema = z.object({
  riskLevel: RiskLevelSchema,
  rationale: z.string().min(1),
  factors: z.array(RiskFactorSchema),
});
export type RiskEvaluationResult = z.infer<typeof RiskEvaluationResultSchema>;

export const RiskEvaluatorInputSchema = z.object({
  category: IncidentCategorySchema,
  severity: IncidentSeveritySchema,
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type RiskEvaluatorInput = z.infer<typeof RiskEvaluatorInputSchema>;
