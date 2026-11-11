import type {
  CreateProtocolInput,
  UpdateProtocolInput,
  ProtocolFilters,
  Protocol,
  ValidationResult,
  ValidationError,
  ProtocolStep,
} from './protocol.schema.js';
import { CreateProtocolSchema } from './protocol.schema.js';
import { protocolRepository } from './protocol.repository.js';

export class ProtocolManagerService {
  /**
   * Create a new protocol
   */
  async create(input: CreateProtocolInput): Promise<number> {
    // Validate input
    const validation = this.validate(input);
    if (!validation.isValid) {
      throw new Error(`Protocol validation failed: ${this.formatValidationErrors(validation.errors)}`);
    }

    const id = await protocolRepository.create(input);
    return id;
  }

  /**
   * Update an existing protocol
   */
  async update(id: number, input: UpdateProtocolInput): Promise<void> {
    // Check if protocol exists
    const exists = await protocolRepository.exists(id);
    if (!exists) {
      throw new Error(`Protocol with ID ${id} not found`);
    }

    // If updating the entire protocol, validate
    if (input.steps || input.category || input.version) {
      // Get current protocol to merge partial updates
      const current = await protocolRepository.findById(id);
      if (!current) {
        throw new Error(`Protocol with ID ${id} not found`);
      }

      const merged: CreateProtocolInput = {
        category: input.category ?? current.category,
        version: input.version ?? current.version,
        name: input.name ?? current.name,
        description: input.description ?? current.description,
        steps: input.steps ?? current.steps,
        conditions: input.conditions ?? current.conditions,
        isActive: input.isActive ?? current.isActive,
      };

      const validation = this.validate(merged);
      if (!validation.isValid) {
        throw new Error(`Protocol validation failed: ${this.formatValidationErrors(validation.errors)}`);
      }
    }

    await protocolRepository.update(id, input);
  }

  /**
   * Get protocol by ID
   */
  async getById(id: number): Promise<Protocol | null> {
    return protocolRepository.findById(id);
  }

  /**
   * Get most recent active protocol for a category, falling back to the
   * "other" catch-all protocol when the category has none of its own
   * (Property 4: debe recuperar un protocolo o el protocolo por defecto "other").
   */
  async getByCategory(category: string): Promise<Protocol | null> {
    const protocol = await protocolRepository.findByCategory(category);
    if (protocol) {
      return protocol;
    }
    if (category === 'other') {
      return null;
    }
    return protocolRepository.findByCategory('other');
  }

  /**
   * List protocols with optional filters
   */
  async list(filters?: ProtocolFilters): Promise<Protocol[]> {
    return protocolRepository.findAll(filters);
  }

  /**
   * Soft delete a protocol
   */
  async delete(id: number): Promise<void> {
    const exists = await protocolRepository.exists(id);
    if (!exists) {
      throw new Error(`Protocol with ID ${id} not found`);
    }
    await protocolRepository.softDelete(id);
  }

  /**
   * Validate protocol structure
   */
  validate(protocol: CreateProtocolInput): ValidationResult {
    const errors: ValidationError[] = [];

    // 1. Validate with Zod schema first
    const zodResult = CreateProtocolSchema.safeParse(protocol);
    if (!zodResult.success) {
      zodResult.error.errors.forEach((err) => {
        errors.push({
          field: err.path.join('.'),
          message: err.message,
          code: 'ZOD_VALIDATION_ERROR',
        });
      });
      return { isValid: false, errors };
    }

    // 2. Validate step orders are unique
    const stepOrders = new Set<number>();
    protocol.steps.forEach((step, index) => {
      if (stepOrders.has(step.order)) {
        errors.push({
          field: `steps[${index}].order`,
          message: `Duplicate step order: ${step.order}`,
          code: 'DUPLICATE_ORDER',
        });
      }
      stepOrders.add(step.order);
    });

    // 3. Validate action parameters based on action type
    protocol.steps.forEach((step, index) => {
      const paramErrors = this.validateActionParameters(step, index);
      errors.push(...paramErrors);
    });

    // 4. Validate dependencies
    protocol.steps.forEach((step, index) => {
      if (step.dependencies && step.dependencies.length > 0) {
        step.dependencies.forEach((depIndex) => {
          // Check if referenced step exists
          if (depIndex >= protocol.steps.length) {
            errors.push({
              field: `steps[${index}].dependencies`,
              message: `Referenced step index ${depIndex} does not exist`,
              code: 'INVALID_DEPENDENCY',
            });
          }
          // Check for circular dependencies (step cannot depend on itself or future steps)
          if (depIndex >= index) {
            errors.push({
              field: `steps[${index}].dependencies`,
              message: `Step cannot depend on itself or future steps (index ${depIndex})`,
              code: 'CIRCULAR_DEPENDENCY',
            });
          }
        });
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate action parameters based on action type
   */
  private validateActionParameters(step: ProtocolStep, stepIndex: number): ValidationError[] {
    const errors: ValidationError[] = [];

    switch (step.actionType) {
      case 'create_task':
        if (!step.parameters.priority) {
          errors.push({
            field: `steps[${stepIndex}].parameters.priority`,
            message: 'Priority is required for create_task action',
            code: 'MISSING_PARAMETER',
          });
        }
        break;

      case 'notify_consultant':
        if (!step.parameters.team) {
          errors.push({
            field: `steps[${stepIndex}].parameters.team`,
            message: 'Team is required for notify_consultant action',
            code: 'MISSING_PARAMETER',
          });
        }
        break;

      case 'restart_service':
        if (!step.parameters.serviceName) {
          errors.push({
            field: `steps[${stepIndex}].parameters.serviceName`,
            message: 'Service name is required for restart_service action',
            code: 'MISSING_PARAMETER',
          });
        }
        break;
    }

    return errors;
  }

  /**
   * Format validation errors into a readable string
   */
  private formatValidationErrors(errors: ValidationError[]): string {
    return errors.map((err) => `${err.field}: ${err.message}`).join('; ');
  }
}

// Singleton instance
export const protocolManager = new ProtocolManagerService();
