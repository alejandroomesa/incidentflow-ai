import { describe, expect, it } from 'vitest';
import { maskPII } from '../src/anonymization/pii-mask.js';

describe('maskPII', () => {
  it('masks an email address', () => {
    const result = maskPII('Contact juan.perez@example.com for details.');
    expect(result).toContain('[EMAIL_REDACTED]');
    expect(result).not.toContain('juan.perez@example.com');
  });

  it('masks a phone number with country code and separators', () => {
    const result = maskPII('Call +34 600 123 456 now.');
    expect(result).toContain('[PHONE_REDACTED]');
    expect(result).not.toContain('600 123 456');
  });

  it('masks a phone number with no separators', () => {
    const result = maskPII('Number: 600123456');
    expect(result).toContain('[PHONE_REDACTED]');
  });

  it('masks multiple PII items in the same string', () => {
    const result = maskPII('Email juan@example.com or call 600123456.');
    expect(result).toContain('[EMAIL_REDACTED]');
    expect(result).toContain('[PHONE_REDACTED]');
  });

  it('leaves non-PII text untouched', () => {
    const text = 'An employee sent a spreadsheet to the wrong department.';
    expect(maskPII(text)).toBe(text);
  });

  it('does not redact short numeric sequences like a year', () => {
    const result = maskPII('The incident occurred in 2026.');
    expect(result).toBe('The incident occurred in 2026.');
  });
});
