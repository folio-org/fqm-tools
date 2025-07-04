import { EntityTypeField, EntityTypeFieldJoinIntermediateTemplate, EntityTypeFieldJoinTemplate } from '@/types';
import { JSONSchema7 } from 'json-schema';
import { ZodError } from 'zod';

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
  const issues: string[] = [];

  if ('x-fqm-name' in propSchema) {
    extraProperties.name = propSchema['x-fqm-name'] as EntityTypeField['name'];
  }

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

  if ('x-fqm-joins-to' in propSchema) {
    extraProperties.joinsToIntermediate = [];

    for (const raw of propSchema['x-fqm-joins-to'] as unknown[]) {
      try {
        const intermediateJoin = EntityTypeFieldJoinIntermediateTemplate.parse(raw);
        extraProperties.joinsToIntermediate.push(intermediateJoin);
      } catch (e) {
        issues.push(...(e as ZodError).issues.map((issue) => `Error parsing x-fqm-joins-to: ${issue.message}`));
      }
    }
  }

  if ('x-fqm-joins-to-raw' in propSchema) {
    extraProperties.joinsTo = [];

    for (const raw of propSchema['x-fqm-joins-to-raw'] as unknown[]) {
      try {
        const join = EntityTypeFieldJoinTemplate.parse(raw);
        extraProperties.joinsTo.push(join);
      } catch (e) {
        issues.push(...(e as ZodError).issues.map((issue) => `Error parsing x-fqm-joins-to-raw: ${issue.message}`));
      }
    }
  }

  return { extraProperties, issues };
}
