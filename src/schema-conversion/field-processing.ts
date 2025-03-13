import { DataType, DataTypeValue, EntityType, EntityTypeField } from '@/types';
import { sentenceCase, snakeCase } from 'change-case';
import { Schema } from 'genson-js/dist';
import debug from 'debug';

const log = {
  debug: debug('fqm-tools:field-processing:debug'),
  warn: debug('fqm-tools:field-processing:warn'),
};

enum SimpleGuessedType {
  STRING = 'string',
  DATE = 'date',
  UUID = 'uuid',
  BOOLEAN = 'boolean',
  NUMBER = 'number',
  INTEGER = 'integer',
  ARRAY = 'array',
  OBJECT = 'object',
  UNKNOWN = 'unknown',
  UNKNOWN_REF = 'unknown-ref',
  // via x-fqm-datatype
  OVERRIDDEN = 'overridden',
}

export function getSimpleTypeOf(schema: Schema): SimpleGuessedType {
  log.debug('Getting simple type of %o', schema);

  if ('x-fqm-datatype' in schema) {
    log.debug('Found custom datatype', schema['x-fqm-datatype']);

    // these get special handling, so we want to use our simple types instead
    // everything else, we will let getDataType handle.
    if (schema['x-fqm-datatype'] === 'arrayType') {
      return SimpleGuessedType.ARRAY;
    } else if (schema['x-fqm-datatype'] === 'objectType') {
      return SimpleGuessedType.OBJECT;
    }

    return SimpleGuessedType.OVERRIDDEN;
  } else if ('$ref' in schema) {
    log.debug('We are a reference!');
    const ref = schema.$ref as string;

    if (RegExp(/\buuid\b/i).exec(ref)) {
      return SimpleGuessedType.UUID;
    } else {
      return SimpleGuessedType.UNKNOWN_REF;
    }
  } else {
    switch (Array.isArray(schema.type) ? schema.type.join(',') : schema.type) {
      case 'string,null':
      case 'string':
        if ('format' in schema && schema.format === 'date-time') {
          return SimpleGuessedType.DATE;
        } else if ('format' in schema && schema.format === 'date') {
          return SimpleGuessedType.DATE;
        } else if ('format' in schema && schema.format === 'uuid') {
          return SimpleGuessedType.UUID;
        } else if (
          'pattern' in schema &&
          (schema.pattern === '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' ||
            schema.pattern ===
              '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' ||
            schema.pattern === '^[a-f0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$')
        ) {
          return SimpleGuessedType.UUID;
        } else {
          return SimpleGuessedType.STRING;
        }
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
}

export function getDataType(schema: Schema, path: string): [DataType, string[]] {
  const resolvedType = getSimpleTypeOf(schema);
  const issues: string[] = [];

  if (resolvedType === SimpleGuessedType.UNKNOWN_REF) {
    issues.push(`Unknown reference type: ${(schema as Record<string, unknown>).$ref}`);
  } else if (resolvedType === SimpleGuessedType.UNKNOWN) {
    issues.push(`Unknown type: ${schema.type}`);
  } else if ('x-fqm-datatype' in schema) {
    return [{ dataType: DataTypeValue[schema['x-fqm-datatype'] as DataTypeValue] }, issues];
  }

  switch (resolvedType) {
    case SimpleGuessedType.STRING:
    case SimpleGuessedType.UNKNOWN:
    case SimpleGuessedType.UNKNOWN_REF:
      return [{ dataType: DataTypeValue.stringType }, issues];
    case SimpleGuessedType.DATE:
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
      if (!schema.items) {
        issues.push('Array type with unknown item type; defaulting to string');
        log.warn('Array type with unknown item type; defaulting to string', schema);
        return [{ dataType: DataTypeValue.arrayType, itemDataType: { dataType: DataTypeValue.stringType } }, issues];
      }
      const [innerDataType, innerErrors] = getDataType(schema.items, path);
      issues.push(...innerErrors.map((e) => `in array: ${e}`));
      return [{ dataType: DataTypeValue.arrayType, itemDataType: innerDataType }, issues];
    }
    case SimpleGuessedType.OBJECT: {
      const properties: EntityTypeField[] = Object.entries(schema.properties ?? {}).map(([prop, propSchema]) => {
        const [innerDataType, innerIssues] = getDataType(propSchema, `${path}->'${prop}'`);
        issues.push(...innerIssues.map((e) => `in object property ${prop}: ${e}`));
        return {
          name: snakeCase(prop),
          property: prop,
          dataType: innerDataType,
          queryable: false,
          values: getValues(innerDataType, (propSchema as { enum?: string[] }).enum),
          ...getNestedGetter(prop, path, innerDataType),
        };
      });
      return [{ dataType: DataTypeValue.objectType, properties }, issues];
    }
    default:
      log.warn('Unknown type', resolvedType, schema);
      issues.push(`Unknown type: ${resolvedType}`);
      return [{ dataType: DataTypeValue.stringType }, issues];
  }
}

export function getNestedGetter(prop: string, path: string, innerDataType: DataType) {
  if (innerDataType.dataType === DataTypeValue.integerType) {
    return {
      valueGetter: `( SELECT array_agg((elems.value->>'${prop}')::integer) FROM jsonb_array_elements(:sourceAlias.jsonb${path}) AS elems)`,
      valueFunction: '(:value)::integer',
    };
  }
  if (innerDataType.dataType === DataTypeValue.numberType) {
    return {
      valueGetter: `( SELECT array_agg((elems.value->>'${prop}')::float) FROM jsonb_array_elements(:sourceAlias.jsonb${path}) AS elems)`,
      valueFunction: '(:value)::float',
    };
  }
  return {
    valueGetter: `( SELECT array_agg(elems.value->>'${prop}') FROM jsonb_array_elements(:sourceAlias.jsonb${path}) AS elems)`,
    filterValueGetter: `( SELECT array_agg(lower(elems.value->>'${prop}')) FROM jsonb_array_elements(:sourceAlias.jsonb${path}) AS elems)`,
    valueFunction: 'lower(:value)',
  };
}

export function getValues(dataType: DataType, enumValues?: string[]): { value: string; label: string }[] | undefined {
  if (enumValues) {
    return enumValues.map((v) => ({ value: v, label: sentenceCase(v) }));
  } else if (dataType.dataType === DataTypeValue.booleanType) {
    return [
      { value: 'true', label: 'True' },
      { value: 'false', label: 'False' },
    ];
  } else {
    return undefined;
  }
}

export function inferColumnFromSchema(
  entityType: EntityType,
  source: string,
  prop: string,
  propSchema: Schema,
): { issues: string[]; column?: EntityTypeField } {
  log.debug('Examining ', prop, propSchema);

  if ('folio:isVirtual' in propSchema && propSchema['folio:isVirtual']) {
    return {
      issues: ['It looks like this is a virtual property (folio:isVirtual=true); ignoring?'],
    };
  }

  const issues: string[] = [];

  const name = snakeCase(prop);

  if (entityType.columns?.find((f) => f.name === name)) {
    return {
      issues: [
        `This appears to be a duplicate of an already existing column name ${name}. If you want to import this column, rename the existing column first.`,
      ],
    };
  }

  const [dataType, dtIssues] = getDataType(propSchema, `->'${prop}'`);
  issues.push(...dtIssues);

  return {
    issues,
    column: {
      name,
      dataType,
      sourceAlias: source,
      queryable: ![DataTypeValue.arrayType, DataTypeValue.objectType].includes(dataType.dataType),
      visibleByDefault: false,
      isIdColumn: name === 'id',
      values: getValues(dataType, (propSchema as { enum?: string[] }).enum),
      ...getGetters(prop, dataType),
    },
  };
}

export function getGetters(prop: string, dataType: DataType) {
  if (dataType.dataType === DataTypeValue.arrayType && dataType.itemDataType?.dataType !== DataTypeValue.objectType) {
    return {
      valueGetter: `( SELECT array_agg(elems.value::text) FROM jsonb_array_elements(:sourceAlias.jsonb->'${prop}') AS elems)`,
      filterValueGetter: `( SELECT array_agg(lower(elems.value::text)) FROM jsonb_array_elements(:sourceAlias.jsonb->'${prop}') AS elems)`,
    };
  }

  const fullPath = `->'${prop}'`.replace(/->([^>]+)$/, '->>$1');

  if (dataType.dataType === DataTypeValue.integerType) {
    return {
      valueGetter: `(:sourceAlias.jsonb${fullPath})::integer`,
      valueFunction: '(:value)::integer',
    };
  }
  if (dataType.dataType === DataTypeValue.numberType) {
    return {
      valueGetter: `(:sourceAlias.jsonb${fullPath})::float`,
      valueFunction: '(:value)::float',
    };
  }

  return {
    valueGetter: `:sourceAlias.jsonb${fullPath}`,
  };
}

export function inferTranslationsFromColumn(
  column: EntityTypeField | undefined,
  parentName: string,
): Record<string, string> {
  if (!column) {
    return {};
  }

  const translations: Record<string, string> = {};

  const stack = [{ key: `entityType.${parentName}.${column.name}`, name: column.name, dt: column.dataType }];
  while (stack.length) {
    const { key, name, dt } = stack.pop()!;

    translations[key] = sentenceCase(name);
    if (dt.dataType === DataTypeValue.rangedUUIDType) {
      translations[key] = translations[key].replace(/\bid\b/i, 'UUID');
    }

    if (dt.dataType === DataTypeValue.objectType) {
      dt.properties?.forEach((prop) => {
        stack.push({ key: `${key}.${prop.name}`, name: prop.name, dt: prop.dataType });
        stack.push({ key: `${key}.${prop.name}._qualified`, name: `${name} ${prop.name}`, dt: prop.dataType });
      });
    } else if (dt.dataType === DataTypeValue.arrayType) {
      stack.push({ key, name, dt: dt.itemDataType! });
    }
  }

  return translations;
}
