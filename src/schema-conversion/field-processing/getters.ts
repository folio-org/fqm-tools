import { DataType, DataTypeValue, EntityTypeField, EntityTypeGenerationConfig } from '@/types';
import { snakeCase } from 'change-case';
import { JSONSchema7 } from 'json-schema';

interface GetterOverrides {
  valueGetter?: string | null;
  filterValueGetter?: string | null;
  valueFunction?: string | null;
}

export function handleGetterOverrides(getters: Partial<EntityTypeField>, overrides: GetterOverrides, source: string) {
  const result = { ...getters, sourceAlias: source };

  for (const [key, value] of Object.entries(overrides) as [keyof GetterOverrides, string | null][]) {
    if (value === null) {
      delete result[key];
    } else {
      result[key] = value.replaceAll('${source}', ':' + source);
    }
  }

  return result;
}

export function getGetterOverrides(schema: JSONSchema7): GetterOverrides {
  const overrides: GetterOverrides = {};

  if ('x-fqm-value-getter' in schema) {
    overrides.valueGetter = schema['x-fqm-value-getter'] as string | null;
  }
  if ('x-fqm-filter-value-getter' in schema) {
    overrides.filterValueGetter = schema['x-fqm-filter-value-getter'] as string | null;
  }
  if ('x-fqm-value-function' in schema) {
    overrides.valueFunction = schema['x-fqm-value-function'] as string | null;
  }

  return overrides;
}

const CAST_OPTIONS = {
  [DataTypeValue.integerType]: 'integer',
  [DataTypeValue.numberType]: 'float',
  [DataTypeValue.rangedUUIDType]: 'uuid',
} as Record<DataTypeValue, string | undefined>;

function getCast(dataType: DataTypeValue) {
  return CAST_OPTIONS[dataType];
}

export function getGetters(
  prop: string,
  schema: JSONSchema7,
  dataType: DataType,
  entityType: EntityTypeGenerationConfig['entityTypes'][number],
  config: EntityTypeGenerationConfig,
): Partial<EntityTypeField> {
  let overrides: GetterOverrides = getGetterOverrides(schema);

  if (dataType.dataType === DataTypeValue.arrayType && dataType.itemDataType?.dataType !== DataTypeValue.objectType) {
    return handleGetterOverrides(
      {
        valueGetter: `(SELECT array_agg(elems.value::text) FROM jsonb_array_elements(:${entityType.source}.jsonb->'${prop}') AS elems)`,
        filterValueGetter: `(SELECT array_agg(lower(elems.value::text)) FROM jsonb_array_elements(:${entityType.source}.jsonb->'${prop}') AS elems)`,
      },
      overrides,
      entityType.source,
    );
  }

  const fullPath = `->'${prop}'`.replace(/->([^>]+)$/, '->>$1');

  const cast = getCast(dataType.dataType);
  if (cast) {
    return handleGetterOverrides(
      {
        valueGetter: `(:${entityType.source}.jsonb${fullPath})::${cast}`,
        valueFunction: `(:value)::${cast}`,
      },
      overrides,
      entityType.source,
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
    entityType.source,
  );
}

export function getNestedGetters(
  source: string,
  prop: string,
  path: string,
  innerDataType: DataType,
  parentIsArrayType: boolean,
) {
  const cast = getCast(innerDataType.dataType);

  if (cast) {
    if (!parentIsArrayType) {
      return {
        valueGetter: `(:${source}.jsonb${path}->>'${prop}')::${cast}`,
        valueFunction: `(:value)::${cast}`,
      };
    }

    return {
      valueGetter: `(SELECT array_agg((elems.value->>'${prop}')::${cast}) FROM jsonb_array_elements(:${source}.jsonb${path}) AS elems)`,
      valueFunction: `(:value)::${cast}`,
    };
  }

  // todo: we might want the lower from the array case?
  if (!parentIsArrayType) {
    return {
      valueGetter: `:${source}.jsonb${path}->>'${prop}'`,
    };
  }

  return {
    valueGetter: `(SELECT array_agg(elems.value->>'${prop}') FROM jsonb_array_elements(:${source}.jsonb${path}) AS elems)`,
    filterValueGetter: `(SELECT array_agg(lower(elems.value->>'${prop}')) FROM jsonb_array_elements(:${source}.jsonb${path}) AS elems)`,
    valueFunction: 'lower(:value)',
  };
}

export function stripGetters(field: EntityTypeField): Omit<EntityTypeField, keyof GetterOverrides> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { valueGetter, filterValueGetter, valueFunction, sourceAlias, ...rest } = field;

  return rest;
}
