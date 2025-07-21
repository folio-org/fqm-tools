import { JSONSchema7 } from 'json-schema';

const ALLOWED_CUSTOM_PROPERTIES = [
  'x-fqm-name',
  'x-fqm-ignore',
  'x-fqm-data-type',
  'x-fqm-value-getter',
  'x-fqm-filter-value-getter',
  'x-fqm-value-function',
  'x-fqm-is-id-column',
  'x-fqm-value-source-api',
  'x-fqm-values',
  'x-fqm-visible-by-default',
  'x-fqm-visibility',
  'x-fqm-essential',
  'x-fqm-joins-to',
  'x-fqm-joins-to-raw',
];

export function validateField(name: string, schema: JSONSchema7): string[] {
  const rawSchema = schema as Record<string, string>;

  const issues: string[] = [];

  const customProperties = Object.keys(schema).filter((key) => key.startsWith('x-fqm-'));
  const invalidProperties = customProperties.filter((key) => !ALLOWED_CUSTOM_PROPERTIES.includes(key));

  if (invalidProperties.length > 0) {
    issues.push(`Invalid custom properties found for property ${name}: ${invalidProperties.join(', ')}`);
  }

  if (
    rawSchema['x-fqm-visibility'] &&
    !['all', 'query-only', 'results-only', 'hidden'].includes(rawSchema['x-fqm-visibility'])
  ) {
    issues.push(`Invalid value for x-fqm-visibility in property ${name}: ${rawSchema['x-fqm-visibility']}`);
  }

  return issues;
}
