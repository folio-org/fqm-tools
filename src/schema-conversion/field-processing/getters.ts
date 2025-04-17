import { DataType, DataTypeValue, EntityTypeField, EntityTypeGenerationConfig } from '@/types';
import { snakeCase } from 'change-case';
import { JSONSchema7 } from 'json-schema';

interface GetterOverrides {
  valueGetter?: string | null;
  filterValueGetter?: string | null;
  valueFunction?: string | null;
}

function handleGetterOverrides(getters: Partial<EntityTypeField>, overrides: GetterOverrides) {
  const result = { ...getters };

  for (const [key, value] of Object.entries(overrides) as [keyof GetterOverrides, string | null][]) {
    if (value === null) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }

  return result;
}

export function getGetters(
  prop: string,
  schema: JSONSchema7,
  dataType: DataType,
  entityType: EntityTypeGenerationConfig['entityTypes'][0],
  config: EntityTypeGenerationConfig,
): Partial<EntityTypeField> {
  let overrides: GetterOverrides = {};

  if ('x-fqm-value-getter' in schema) {
    overrides.valueGetter = schema['x-fqm-value-getter'] as string | null;
  }
  if ('x-fqm-filter-value-getter' in schema) {
    overrides.filterValueGetter = schema['x-fqm-filter-value-getter'] as string | null;
  }
  if ('x-fqm-value-function' in schema) {
    overrides.valueFunction = schema['x-fqm-value-function'] as string | null;
  }

  if (dataType.dataType === DataTypeValue.arrayType && dataType.itemDataType?.dataType !== DataTypeValue.objectType) {
    return handleGetterOverrides(
      {
        valueGetter: `(SELECT array_agg(elems.value::text) FROM jsonb_array_elements(:${entityType.source}.jsonb->'${prop}') AS elems)`,
        filterValueGetter: `(SELECT array_agg(lower(elems.value::text)) FROM jsonb_array_elements(:${entityType.source}.jsonb->'${prop}') AS elems)`,
      },
      overrides,
    );
  }

  const fullPath = `->'${prop}'`.replace(/->([^>]+)$/, '->>$1');

  if (dataType.dataType === DataTypeValue.integerType) {
    return handleGetterOverrides(
      {
        valueGetter: `(:${entityType.source}.jsonb${fullPath})::integer`,
        valueFunction: '(:value)::integer',
      },
      overrides,
    );
  }
  if (dataType.dataType === DataTypeValue.numberType) {
    return handleGetterOverrides(
      {
        valueGetter: `(:${entityType.source}.jsonb${fullPath})::float`,
        valueFunction: '(:value)::float',
      },
      overrides,
    );
  }

  // we should only add this mess iff there are no overrides
  // if the schema overrides one of our properties, we let them handle all this
  if (entityType.useRmbIndexStyle && Object.keys(overrides).length === 0) {
    overrides = {
      filterValueGetter: `lower($\{tenant_id}_${snakeCase(config.metadata.module)}.f_unaccent(:${entityType.source}.jsonb${fullPath}::text))`,
      valueFunction: `lower($\{tenant_id}_${snakeCase(config.metadata.module)}.f_unaccent(:value))`,
    };
  }

  return handleGetterOverrides(
    {
      valueGetter: `:${entityType.source}.jsonb${fullPath}`,
    },
    overrides,
  );
}

export function getNestedGetter(
  source: string,
  prop: string,
  path: string,
  innerDataType: DataType,
  parentIsArrayType: boolean,
) {
  if (!parentIsArrayType) {
    return {
      valueGetter: `:${source}.jsonb${path}->>'${prop}'`,
    };
  }

  if (innerDataType.dataType === DataTypeValue.integerType) {
    return {
      valueGetter: `( SELECT array_agg((elems.value->>'${prop}')::integer) FROM jsonb_array_elements(:${source}.jsonb${path}) AS elems)`,
      valueFunction: '(:value)::integer',
    };
  }
  if (innerDataType.dataType === DataTypeValue.numberType) {
    return {
      valueGetter: `( SELECT array_agg((elems.value->>'${prop}')::float) FROM jsonb_array_elements(:${source}.jsonb${path}) AS elems)`,
      valueFunction: '(:value)::float',
    };
  }
  return {
    valueGetter: `( SELECT array_agg(elems.value->>'${prop}') FROM jsonb_array_elements(:${source}.jsonb${path}) AS elems)`,
    filterValueGetter: `( SELECT array_agg(lower(elems.value->>'${prop}')) FROM jsonb_array_elements(:${source}.jsonb${path}) AS elems)`,
    valueFunction: 'lower(:value)',
  };
}

export function stripGetters(field: EntityTypeField): Omit<EntityTypeField, keyof GetterOverrides> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { valueGetter, filterValueGetter, valueFunction, ...rest } = field;

  return rest;
}
