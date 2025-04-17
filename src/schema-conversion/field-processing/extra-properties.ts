import { EntityTypeField } from '@/types';
import { JSONSchema7 } from 'json-schema';

export function getIsIdColumn(name: string, propSchema: JSONSchema7) {
  if ('x-fqm-is-id-column' in propSchema) {
    return {
      isIdColumn: !!propSchema['x-fqm-is-id-column'],
    };
  }

  if (name === 'id') {
    return {
      isIdColumn: true,
    };
  }

  return {};
}

export function getExtraProperties(propSchema: JSONSchema7) {
  const extraProperties: Partial<EntityTypeField> = {};

  if ('x-fqm-value-source-api' in propSchema) {
    extraProperties.valueSourceApi = propSchema['x-fqm-value-source-api'] as EntityTypeField['valueSourceApi'];
  }

  return extraProperties;
}
