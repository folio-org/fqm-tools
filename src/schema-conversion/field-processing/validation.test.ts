import { describe, expect, it } from 'bun:test';
import { JSONSchema7 } from 'json-schema';
import { validateField } from './validation';

describe('validateField', () => {
  it('returns no issues for a valid schema', () => {
    const schema = {
      'x-fqm-data-type': 'string',
      'x-fqm-visibility': 'all',
    };
    const result = validateField('test', schema as JSONSchema7);
    expect(result).toBeEmpty();
  });

  it('flags unknown properties', () => {
    const schema = {
      'x-fqm-invalid-property': 'value',
    };
    const result = validateField('test', schema as JSONSchema7);
    expect(result).toContain('Invalid custom properties found for property test: x-fqm-invalid-property');
  });

  it('returns an issue for invalid x-fqm-visibility value', () => {
    const schema = {
      'x-fqm-visibility': 'invalid-value',
    };
    const result = validateField('test', schema as JSONSchema7);
    expect(result).toContain('Invalid value for x-fqm-visibility in property test: invalid-value');
  });

  it('returns issues for both invalid custom properties and invalid x-fqm-visibility value', () => {
    const schema = {
      'x-fqm-invalid-property': 'value',
      'x-fqm-visibility': 'invalid-value',
    };
    const result = validateField('test', schema as JSONSchema7);
    expect(result).toContainAllValues([
      'Invalid custom properties found for property test: x-fqm-invalid-property',
      'Invalid value for x-fqm-visibility in property test: invalid-value',
    ]);
  });

  it.each(['all', 'query-only', 'results-only', 'hidden', 'hidden-non-queryable'])(
    'handles schemas with valid x-fqm-visibility value: %s',
    (visibility) => {
      const schema = {
        'x-fqm-visibility': visibility,
      };
      const result = validateField('test', schema as JSONSchema7);
      expect(result).toBeEmpty();
    },
  );
});
