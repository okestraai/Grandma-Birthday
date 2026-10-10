import { ValidationError, ValidationPipe } from '@nestjs/common';
import { Errors } from './errors';

function flatten(errors: ValidationError[], parent = '', out: Record<string, string[]> = {}): Record<string, string[]> {
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) out[path] = Object.values(error.constraints);
    if (error.children?.length) flatten(error.children, path, out);
  }
  return out;
}

/** Strict DTO validation: unknown fields are rejected, types are converted, errors are keyed by field. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => Errors.validation(flatten(errors)),
  });
}
