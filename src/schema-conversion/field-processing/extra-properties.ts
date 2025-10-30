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

function getVisibilityProps(visibility: string) {
  switch (visibility) {
    case 'all':
      return {
        queryable: true,
        queryOnly: false,
        hidden: false,
      };
    case 'query-only':
      return {
        queryable: true,
        queryOnly: true,
        hidden: false,
      };
    case 'results-only':
      return {
        queryable: false,
        queryOnly: false,
        hidden: false,
      };
    case 'hidden':
      return {
        hidden: true,
      };
    default:
      throw new Error(`Invalid value for x-fqm-visibility: ${visibility}`);
  }
}

function getJoinsTo(input: unknown[], issues: string[]) {
  const joinsToIntermediate = [];

  for (const raw of input) {
    try {
      const intermediateJoin = EntityTypeFieldJoinIntermediateTemplate.parse(raw);
      joinsToIntermediate.push(intermediateJoin);
    } catch (e) {
      issues.push(...(e as ZodError).issues.map((issue) => `Error parsing x-fqm-joins-to: ${issue.message}`));
    }
  }

  return joinsToIntermediate;
}

function getJoinsToRaw(input: unknown[], issues: string[]) {
  const joinsTo = [];

  for (const raw of input) {
    try {
      const join = EntityTypeFieldJoinTemplate.parse(raw);
      joinsTo.push(join);
    } catch (e) {
      issues.push(...(e as ZodError).issues.map((issue) => `Error parsing x-fqm-joins-to-raw: ${issue.message}`));
    }
  }

  return joinsTo;
}

export function getExtraProperties(propSchema: JSONSchema7) {
  let extraProperties: Partial<EntityTypeField> = {};
  const issues: string[] = [];

  if ('x-fqm-name' in propSchema) {
    extraProperties.name = propSchema['x-fqm-name'] as EntityTypeField['name'];
  }

  if ('x-fqm-values' in propSchema) {
    extraProperties.values = propSchema['x-fqm-values'] as EntityTypeField['values'];
  }

  if ('x-fqm-value-source-api' in propSchema) {
    extraProperties.valueSourceApi = propSchema['x-fqm-value-source-api'] as EntityTypeField['valueSourceApi'];
  }

  if ('x-fqm-visibility' in propSchema) {
    extraProperties = { ...extraProperties, ...getVisibilityProps(propSchema['x-fqm-visibility'] as string) };
  }

  if ('x-fqm-visible-by-default' in propSchema) {
    extraProperties.visibleByDefault = propSchema['x-fqm-visible-by-default'] === true;
  }

  if ('x-fqm-essential' in propSchema) {
    extraProperties.essential = propSchema['x-fqm-essential'] === true;
  }

  if ('x-fqm-joins-to' in propSchema) {
    extraProperties.joinsToIntermediate = getJoinsTo(propSchema['x-fqm-joins-to'] as unknown[], issues);
  }

  if ('x-fqm-joins-to-raw' in propSchema) {
    extraProperties.joinsTo = getJoinsToRaw(propSchema['x-fqm-joins-to-raw'] as unknown[], issues);
  }

  if ('x-fqm-source' in propSchema) {
    extraProperties.source = propSchema['x-fqm-source'] as string;
  }

  return { extraProperties, issues };
}
