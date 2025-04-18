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
  if ('x-fqm-visibility' in propSchema) {
    switch (propSchema['x-fqm-visibility']) {
      case 'all':
        extraProperties.queryable = true;
        extraProperties.queryOnly = false;
        extraProperties.hidden = false;
        break;
      case 'query-only':
        extraProperties.queryable = true;
        extraProperties.queryOnly = true;
        extraProperties.hidden = false;
        break;
      case 'results-only':
        extraProperties.queryable = false;
        extraProperties.queryOnly = false;
        extraProperties.hidden = false;
        break;
      case 'hidden':
        extraProperties.hidden = true;
        break;
      default:
        throw new Error(`Invalid value for x-fqm-visibility: ${propSchema['x-fqm-visibility']}`);
    }
  }

  if ('x-fqm-visibility-by-default' in propSchema) {
    extraProperties.visibleByDefault = propSchema['x-fqm-visibility-by-default'] === true;
  }

  if ('x-fqm-essential' in propSchema) {
    extraProperties.essential = propSchema['x-fqm-essential'] === true;
  }

  return extraProperties;
}
