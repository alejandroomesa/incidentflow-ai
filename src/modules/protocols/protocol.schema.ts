import { z } from 'zod';
import { IncidentCategorySchema } from '../../ai/agent-output.schema.js';

// Action types enum
export const ActionTypeSchema = z.enum([
  'create_task',
  'notify_consultant',
  'restart_service',
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

// Protocol condition operator
export const ConditionOperatorSchema = z.enum([
  'equals',
  'contains',
  'greater_than',
  'less_than',
]);

// Protocol condition
export const ProtocolConditionSchema = z.object({
  field: z.string().min(1).max(100),
  operator: ConditionOperatorSchema,
  value: z.unknown(),
});
export type ProtocolCondition = z.infer<typeof ProtocolConditionSchema>;

// Protocol step
export const ProtocolStepSchema = z.object({
  order: z.number().int().min(0),
  actionType: ActionTypeSchema,
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  parameters: z.record(z.string(), z.unknown()),
  dependencies: z.array(z.number().int().min(0)).optional().default([]),
});
export type ProtocolStep = z.infer<typeof ProtocolStepSchema>;

// Protocol create/update input
export const CreateProtocolSchema = z.object({
  category: IncidentCategorySchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be valid semver (e.g., 1.0.0)'),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().default(''),
  steps: z.array(ProtocolStepSchema).min(1, 'At least one step is required'),
  conditions: z.array(ProtocolConditionSchema).optional().default([]),
  isActive: z.boolean().default(true),
});
export type CreateProtocolInput = z.infer<typeof CreateProtocolSchema>;

// Protocol with ID (database representation)
export const ProtocolSchema = CreateProtocolSchema.extend({
  id: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
  archivedAt: z.date().nullable().optional(),
});
export type Protocol = z.infer<typeof ProtocolSchema>;

// Update protocol input
export const UpdateProtocolSchema = CreateProtocolSchema.partial();
export type UpdateProtocolInput = z.infer<typeof UpdateProtocolSchema>;

// Protocol filters
export const ProtocolFiltersSchema = z.object({
  category: IncidentCategorySchema.optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});
export type ProtocolFilters = z.infer<typeof ProtocolFiltersSchema>;

// Validation result
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Parse result
export interface ParseError {
  message: string;
  line?: number;
  column?: number;
  type: 'syntax' | 'validation' | 'io';
}

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: ParseError;
}
