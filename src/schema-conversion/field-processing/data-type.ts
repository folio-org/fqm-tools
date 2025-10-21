import { DataType, DataTypeValue, EntityTypeField, EntityTypeGenerationConfig } from '@/types';
import { snakeCase } from 'change-case';
import debug from 'debug';
import { JSONSchema7 } from 'json-schema';
import { inferFieldFromSchema } from './field';
import { getNestedGetters, stripGetters } from './getters';

const log = {
  debug: debug('fqm-tools:field-processing:data-type:debug'),
  warn: debug('fqm-tools:field-processing:data-type:warn'),
};

enum SimpleGuessedType {
  STRING = 'string',
  DATETIME = 'datetime',
  UUID = 'uuid',
  BOOLEAN = 'boolean',
  NUMBER = 'number',
  INTEGER = 'integer',
  ARRAY = 'array',
  OBJECT = 'object',
  UNKNOWN = 'unknown',
  UNKNOWN_REF = 'unknown-ref',
  // via x-fqm-data-type
  OVERRIDDEN = 'overridden',
}

// found from other modules, commonly used instead of format: uuid or $ref to a uuid
const UUID_PATTERNS = [
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
  '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-5][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$',
  '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
  '^[a-f0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
];

/** Schema must not be a $ref, overridden, or anything else fancy to use this */
function getSimpleTypeFromSimpleSchema(schema: JSONSchema7): SimpleGuessedType {
  switch (Array.isArray(schema.type) ? schema.type.join(',') : schema.type) {
    case 'string,null':
    case 'string':
      if ('format' in schema) {
        if (schema.format === 'date-time' || schema.format === 'date') {
          return SimpleGuessedType.DATETIME;
        } else if (schema.format === 'uuid') {
          return SimpleGuessedType.UUID;
        }
      }

      if ('pattern' in schema && UUID_PATTERNS.includes(schema.pattern as string)) {
        return SimpleGuessedType.UUID;
      }

      return SimpleGuessedType.STRING;
    case 'boolean':
      return SimpleGuessedType.BOOLEAN;
    case 'number':
      return SimpleGuessedType.NUMBER;
    case 'integer':
      return SimpleGuessedType.INTEGER;
    case 'array':
      return SimpleGuessedType.ARRAY;
    case 'object':
      return SimpleGuessedType.OBJECT;
    default:
      log.warn('Unknown type', schema);
      return SimpleGuessedType.UNKNOWN;
  }
}

function getSimpleTypeOf(schema: JSONSchema7): SimpleGuessedType {
  log.debug('Getting simple type of %o', schema);

  if ('x-fqm-data-type' in schema) {
    log.debug('Found custom datatype', schema['x-fqm-data-type']);

    // these get special handling, so we want to use our simple types instead
    // everything else, we will let getDataType handle.
    if (
      schema['x-fqm-data-type'] === DataTypeValue.arrayType ||
      schema['x-fqm-data-type'] === DataTypeValue.jsonbArrayType
    ) {
      return SimpleGuessedType.ARRAY;
    } else if (schema['x-fqm-data-type'] === DataTypeValue.objectType) {
      return SimpleGuessedType.OBJECT;
    }

    return SimpleGuessedType.OVERRIDDEN;
  }

  if ('$ref' in schema) {
    log.debug('We are a reference!');
    const ref = schema.$ref as string;

    if (/\buuid\b/i.exec(ref)) {
      return SimpleGuessedType.UUID;
    } else {
      return SimpleGuessedType.UNKNOWN_REF;
    }
  }

  return getSimpleTypeFromSimpleSchema(schema);
}

export function getDataType(
  schema: JSONSchema7,
  path: string,
  entityType: EntityTypeGenerationConfig['entityTypes'][number],
  config: EntityTypeGenerationConfig,
  parentIsArrayType = false,
): [DataType, string[]] {
  const resolvedType = getSimpleTypeOf(schema);
  const issues: string[] = [];

  if (resolvedType === SimpleGuessedType.UNKNOWN_REF) {
    issues.push(`Unknown reference: "${(schema as Record<string, unknown>).$ref}"`);
  } else if (resolvedType === SimpleGuessedType.UNKNOWN) {
    issues.push(`Unknown type: ${schema.type}`);
  } else if (resolvedType === SimpleGuessedType.OVERRIDDEN) {
    return [
      { dataType: DataTypeValue[(schema as { 'x-fqm-data-type': string })['x-fqm-data-type'] as DataTypeValue] },
      issues,
    ];
  }

  switch (resolvedType) {
    case SimpleGuessedType.STRING:
    case SimpleGuessedType.UNKNOWN:
    case SimpleGuessedType.UNKNOWN_REF:
      return [{ dataType: DataTypeValue.stringType }, issues];
    case SimpleGuessedType.DATETIME:
      return [{ dataType: DataTypeValue.dateType }, issues];
    case SimpleGuessedType.UUID:
      return [{ dataType: DataTypeValue.rangedUUIDType }, issues];
    case SimpleGuessedType.BOOLEAN:
      return [{ dataType: DataTypeValue.booleanType }, issues];
    case SimpleGuessedType.NUMBER:
      return [{ dataType: DataTypeValue.numberType }, issues];
    case SimpleGuessedType.INTEGER:
      return [{ dataType: DataTypeValue.integerType }, issues];
    case SimpleGuessedType.ARRAY: {
      let dataType = DataTypeValue.jsonbArrayType;
      if ('x-fqm-data-type' in schema) {
        dataType = schema['x-fqm-data-type'] as DataTypeValue;
      }

      if (!schema.items) {
        issues.push('Array type with unknown item type; defaulting to string');
        log.warn('Array type with unknown item type; defaulting to string', schema);

        return [{ dataType, itemDataType: { dataType: DataTypeValue.stringType } }, issues];
      }

      const [innerDataType, innerErrors] = getDataType(schema.items as JSONSchema7, path, entityType, config, true);
      issues.push(...innerErrors.map((e) => `in array: ${e}`));

      return [{ dataType, itemDataType: innerDataType }, issues];
    }
    case SimpleGuessedType.OBJECT: {
      const properties: EntityTypeField[] = Object.entries(schema.properties ?? {})
        .map(([prop, propSchema]) => {
          const { issues: innerIssues, field: result } = inferFieldFromSchema(
            `${path}->'${prop}'`,
            propSchema as JSONSchema7,
            entityType,
            config,
          );

          issues.push(...innerIssues.map((e) => `in object property ${prop}: ${e}`));

          if (!result) {
            issues.push(`in object property ${prop}: unable to generate field`);
            return null;
          }

          return {
            ...stripGetters(result),
            ...getNestedGetters(entityType.source, prop, path, result.dataType, parentIsArrayType),
            name: snakeCase(prop),
            property: prop,
          };
        })
        .filter((f) => f !== null);
      return [{ dataType: DataTypeValue.objectType, properties }, issues];
    }
  }
}
