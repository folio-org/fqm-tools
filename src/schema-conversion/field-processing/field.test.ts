import { DataTypeValue, EntityTypeGenerationConfig } from '@/types';
import { getGetters, getNestedGetters } from './getters';
import { describe, expect, it } from 'bun:test';
import { JSONSchema7 } from 'json-schema';

const entityTypeConfig = { source: 'sauce' } as EntityTypeGenerationConfig['entityTypes'][0];
const config = { metadata: { module: 'mod-foo' } } as EntityTypeGenerationConfig;

describe('getGetters', () => {
  it.each([
    [
      {},
      {
        valueGetter: "(:sauce.jsonb->>'prop')::integer",
        valueFunction: '(:value)::integer',
      },
    ],
    [
      { 'x-fqm-value-getter': 'get()' },
      {
        valueGetter: 'get()',
        valueFunction: '(:value)::integer',
      },
    ],
    [
      { 'x-fqm-filter-value-getter': 'getFiltered()' },
      {
        valueGetter: "(:sauce.jsonb->>'prop')::integer",
        filterValueGetter: 'getFiltered()',
        valueFunction: '(:value)::integer',
      },
    ],
    [
      {
        'x-fqm-value-getter': 'get()',
        'x-fqm-filter-value-getter': 'getFiltered()',
        'x-fqm-value-function': 'value()',
      },
      {
        valueGetter: 'get()',
        filterValueGetter: 'getFiltered()',
        valueFunction: 'value()',
      },
    ],
  ])('handles overrides in %o as expected', (schema, expected) => {
    expect(
      getGetters('prop', schema as JSONSchema7, { dataType: DataTypeValue.integerType }, entityTypeConfig, config),
    ).toEqual(expected);
  });

  it('handles array with no itemDataType', () => {
    expect(getGetters('prop', {}, { dataType: DataTypeValue.arrayType }, entityTypeConfig, config)).toEqual({
      filterValueGetter:
        "(SELECT array_agg(lower(elems.value::text)) FROM jsonb_array_elements(:sauce.jsonb->'prop') AS elems)",
      valueGetter: "(SELECT array_agg(elems.value::text) FROM jsonb_array_elements(:sauce.jsonb->'prop') AS elems)",
    });
  });

  it('handles array with non-object itemDataType', () => {
    expect(
      getGetters(
        'prop',
        {},
        { dataType: DataTypeValue.arrayType, itemDataType: { dataType: DataTypeValue.stringType } },
        entityTypeConfig,
        config,
      ),
    ).toEqual({
      filterValueGetter:
        "(SELECT array_agg(lower(elems.value::text)) FROM jsonb_array_elements(:sauce.jsonb->'prop') AS elems)",
      valueGetter: "(SELECT array_agg(elems.value::text) FROM jsonb_array_elements(:sauce.jsonb->'prop') AS elems)",
    });
  });

  it.each([
    [
      {
        dataType: DataTypeValue.integerType,
      },
      {
        valueGetter: "(:sauce.jsonb->>'prop')::integer",
        valueFunction: '(:value)::integer',
      },
    ],
    [
      {
        dataType: DataTypeValue.numberType,
      },
      {
        valueGetter: "(:sauce.jsonb->>'prop')::float",
        valueFunction: '(:value)::float',
      },
    ],
  ])('handles special data type %o', (dataType, expected) => {
    expect(getGetters('prop', {}, dataType, entityTypeConfig, config)).toEqual(expected);
  });

  it('handles regular string without RMB index style', () => {
    expect(getGetters('prop', {}, { dataType: DataTypeValue.stringType }, entityTypeConfig, config)).toEqual({
      valueGetter: ":sauce.jsonb->>'prop'",
    });
  });

  it('handles regular string with RMB index style', () => {
    expect(
      getGetters(
        'prop',
        {},
        { dataType: DataTypeValue.stringType },
        { ...entityTypeConfig, useRmbIndexStyle: true },
        config,
      ),
    ).toEqual({
      valueGetter: ":sauce.jsonb->>'prop'",
      filterValueGetter: "lower(${tenant_id}_mod_foo.f_unaccent(:sauce.jsonb->>'prop'::text))",
      valueFunction: 'lower(${tenant_id}_mod_foo.f_unaccent(:value))',
    });
  });
});

describe('getNestedGetters', () => {
  it.each([
    [
      { dataType: DataTypeValue.integerType },
      {
        valueGetter: `(SELECT array_agg((elems.value->>'prop')::integer) FROM jsonb_array_elements(:sauce.jsonb) AS elems)`,
        valueFunction: '(:value)::integer',
      },
    ],
    [
      { dataType: DataTypeValue.numberType },
      {
        valueGetter: `(SELECT array_agg((elems.value->>'prop')::float) FROM jsonb_array_elements(:sauce.jsonb) AS elems)`,
        valueFunction: '(:value)::float',
      },
    ],
    [
      { dataType: DataTypeValue.stringType },
      {
        valueGetter: `(SELECT array_agg(elems.value->>'prop') FROM jsonb_array_elements(:sauce.jsonb) AS elems)`,
        filterValueGetter: `(SELECT array_agg(lower(elems.value->>'prop')) FROM jsonb_array_elements(:sauce.jsonb) AS elems)`,
        valueFunction: 'lower(:value)',
      },
    ],
  ])('dataType %o yields %o in array context', (dataType, expected) => {
    expect(getNestedGetters('sauce', 'prop', '', dataType, true)).toEqual(expected);
  });

  it.each([
    [
      { dataType: DataTypeValue.integerType },
      {
        valueGetter: `(:sauce.jsonb->>'prop')::integer`,
        valueFunction: '(:value)::integer',
      },
    ],
    [
      { dataType: DataTypeValue.numberType },
      {
        valueGetter: `(:sauce.jsonb->>'prop')::float`,
        valueFunction: '(:value)::float',
      },
    ],
    [
      { dataType: DataTypeValue.stringType },
      {
        valueGetter: `:sauce.jsonb->>'prop'`,
      },
    ],
  ])('dataType %o yields %o in non-array context', (dataType, expected) => {
    expect(getNestedGetters('sauce', 'prop', '', dataType, false)).toEqual(expected);
  });
});
