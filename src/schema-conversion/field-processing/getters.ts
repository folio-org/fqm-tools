import { DataType, DataTypeValue } from '@/types';

export function getGetters(source: string, prop: string, dataType: DataType) {
  if (dataType.dataType === DataTypeValue.arrayType && dataType.itemDataType?.dataType !== DataTypeValue.objectType) {
    return {
      valueGetter: `( SELECT array_agg(elems.value::text) FROM jsonb_array_elements(:${source}.jsonb->'${prop}') AS elems)`,
      filterValueGetter: `( SELECT array_agg(lower(elems.value::text)) FROM jsonb_array_elements(:${source}.jsonb->'${prop}') AS elems)`,
    };
  }

  const fullPath = `->'${prop}'`.replace(/->([^>]+)$/, '->>$1');

  if (dataType.dataType === DataTypeValue.integerType) {
    return {
      valueGetter: `(:${source}.jsonb${fullPath})::integer`,
      valueFunction: '(:value)::integer',
    };
  }
  if (dataType.dataType === DataTypeValue.numberType) {
    return {
      valueGetter: `(:${source}.jsonb${fullPath})::float`,
      valueFunction: '(:value)::float',
    };
  }

  return {
    valueGetter: `:${source}.jsonb${fullPath}`,
  };
}

export function getNestedGetter(source: string, prop: string, path: string, innerDataType: DataType) {
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
