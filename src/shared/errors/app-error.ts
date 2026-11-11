// Este archivo define clases de error personalizadas para la aplicación.
// Estas clases extienden la clase base Error y proporcionan códigos de estado HTTP
// y códigos de error específicos para diferentes tipos de errores que 
// pueden ocurrir en la aplicación.
export class AppError extends Error {
  constructor(message: string, public statusCode: number, public code: string) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'not_found');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400, 'validation_error');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'unauthorized');
  }
}

export class AIProviderError extends AppError {
  constructor(message: string, statusCode = 502) {
    super(message, statusCode, 'ai_provider_error');
  }
}
