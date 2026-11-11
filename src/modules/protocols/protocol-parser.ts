import { promises as fs } from 'fs';
import type { CreateProtocolInput, ParseResult, Protocol } from './protocol.schema.js';
import { CreateProtocolSchema } from './protocol.schema.js';
import { protocolManager } from './protocol-manager.service.js';

export class ProtocolParser {
  /**
   * Parse JSON string into a Protocol object
   */
  parse(jsonString: string): ParseResult<CreateProtocolInput> {
    try {
      // 1. Parse JSON
      const rawObject = JSON.parse(jsonString);

      // 2. Validate structure with Zod schema
      const zodResult = CreateProtocolSchema.safeParse(rawObject);
      if (!zodResult.success) {
        return {
          success: false,
          error: {
            message: this.formatZodErrors(zodResult.error.errors),
            type: 'validation',
          },
        };
      }

      // 3. Validate with protocol manager
      const validation = protocolManager.validate(zodResult.data);
      if (!validation.isValid) {
        return {
          success: false,
          error: {
            message: validation.errors.map((e) => `${e.field}: ${e.message}`).join('; '),
            type: 'validation',
          },
        };
      }

      return {
        success: true,
        data: zodResult.data,
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        const { line, column } = this.extractLineAndColumn(error, jsonString);
        return {
          success: false,
          error: {
            message: error.message,
            line,
            column,
            type: 'syntax',
          },
        };
      }

      return {
        success: false,
        error: {
          message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
          type: 'validation',
        },
      };
    }
  }

  /**
   * Parse protocol from a file
   */
  async parseFile(filePath: string): Promise<ParseResult<CreateProtocolInput>> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          error: {
            message: `File not found: ${filePath}`,
            type: 'io',
          },
        };
      }

      return {
        success: false,
        error: {
          message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
          type: 'io',
        },
      };
    }
  }

  /**
   * Pretty print a Protocol object to JSON string with 2-space indentation
   */
  print(protocol: CreateProtocolInput | Protocol): string {
    const output: Record<string, unknown> = {
      category: protocol.category,
      version: protocol.version,
      name: protocol.name,
      description: protocol.description,
      steps: protocol.steps.map((step) => ({
        order: step.order,
        actionType: step.actionType,
        title: step.title,
        ...(step.description && { description: step.description }),
        parameters: step.parameters,
        ...(step.dependencies && step.dependencies.length > 0 && { dependencies: step.dependencies }),
      })),
      conditions: protocol.conditions,
      isActive: protocol.isActive,
    };

    return JSON.stringify(output, null, 2);
  }

  /**
   * Extract line and column number from JSON syntax error
   */
  private extractLineAndColumn(error: SyntaxError, jsonString: string): { line?: number; column?: number } {
    // Try to extract position from error message (format varies by JS engine)
    const positionMatch = error.message.match(/position (\d+)/i);
    if (positionMatch) {
      const position = parseInt(positionMatch[1], 10);
      return this.positionToLineColumn(jsonString, position);
    }

    // Try to extract from "at line X column Y" format
    const lineColMatch = error.message.match(/at line (\d+) column (\d+)/i);
    if (lineColMatch) {
      return {
        line: parseInt(lineColMatch[1], 10),
        column: parseInt(lineColMatch[2], 10),
      };
    }

    return {};
  }

  /**
   * Convert character position to line and column numbers
   */
  private positionToLineColumn(text: string, position: number): { line: number; column: number } {
    const lines = text.substring(0, position).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  /**
   * Format Zod validation errors into a readable message
   */
  private formatZodErrors(errors: Array<{ path: (string | number)[]; message: string }>): string {
    return errors.map((err) => {
      const path = err.path.length > 0 ? err.path.join('.') : 'root';
      return `${path}: ${err.message}`;
    }).join('; ');
  }
}

// Singleton instance
export const protocolParser = new ProtocolParser();
