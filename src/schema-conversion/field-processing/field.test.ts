import { DataTypeValue, EntityTypeField, EntityTypeGenerationConfig } from '@/types';
import { getGetters, getNestedGetters } from './getters';
import { describe, expect, it } from 'bun:test';
import { JSONSchema7 } from 'json-schema';
import { ensureNestedObjectsAreProperForm, inferFieldFromSchema, markNestedArrayOfObjectsNonQueryable } from './field';

const entityTypeConfig = { source: 'sauce' } as EntityTypeGenerationConfig['entityTypes'][number];
const config = { metadata: { module: 'mod-foo' } } as EntityTypeGenerationConfig;

describe('inferFieldFromSchema', () => {
  it.each([false, true])(
    'treats x-fqm-ignore=true and folio:isVirtual=%s as a signal to ignore the field with no warning',
    (virtual) => {
      const propSchema = { 'x-fqm-ignore': true, 'folio:isVirtual': virtual } as JSONSchema7;
      const result = inferFieldFromSchema('prop', propSchema, entityTypeConfig, config);
      expect(result.issues).toBeEmpty();
      expect(result.field).toBeFalsy();
    },
  );

  it.each([false, true])(
    'treats x-fqm-ignore=false and folio:isVirtual=%s as a signal to NOT ignore the field with no warning',
    (virtual) => {
      const propSchema = { 'x-fqm-ignore': false, 'folio:isVirtual': virtual, type: 'string' } as JSONSchema7;
      const result = inferFieldFromSchema('prop', propSchema, entityTypeConfig, config);
      expect(result.issues).toBeEmpty();
      expect(result.field).toBeTruthy();
    },
  );

  it('warns and returns nothing for folio:isVirtual=true and x-fqm-ignore not set', () => {
    const propSchema = { 'folio:isVirtual': true } as JSONSchema7;
    const result = inferFieldFromSchema('prop', propSchema, entityTypeConfig, config);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatch(/virtual property.+x-fqm-ignore.+silence/);
    expect(result.field).toBeFalsy();
  });
});

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
    [
      {
        'x-fqm-value-getter': 'get(${source})',
        'x-fqm-filter-value-getter': 'getFiltered(${source})',
        'x-fqm-value-function': 'value(${source})',
      },
      {
        valueGetter: 'get(:sauce)',
        filterValueGetter: 'getFiltered(:sauce)',
        valueFunction: 'value(:sauce)',
      },
    ],
  ])('handles overrides in %o as expected', (schema, expected) => {
    expect(
      getGetters('prop', schema as JSONSchema7, { dataType: DataTypeValue.integerType }, entityTypeConfig, config),
    ).toEqual({ ...expected, sourceAlias: 'sauce' });
  });

  it('handles array with no itemDataType', () => {
    expect(getGetters('prop', {}, { dataType: DataTypeValue.arrayType }, entityTypeConfig, config)).toEqual({
      sourceAlias: 'sauce',
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
      sourceAlias: 'sauce',
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
    expect(getGetters('prop', {}, dataType, entityTypeConfig, config)).toEqual({ ...expected, sourceAlias: 'sauce' });
  });

  it('handles regular string without RMB index style', () => {
    expect(getGetters('prop', {}, { dataType: DataTypeValue.stringType }, entityTypeConfig, config)).toEqual({
      sourceAlias: 'sauce',
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
      sourceAlias: 'sauce',
      valueGetter: ":sauce.jsonb->>'prop'",
      filterValueGetter: "lower(${tenant_id}_mod_foo.f_unaccent(:sauce.jsonb->>'prop'::text))",
      valueFunction: 'lower(${tenant_id}_mod_foo.f_unaccent(:value))',
    });
  });
});

describe('markNestedArrayOfObjectsNonQueryable', () => {
  it('marks nested array of objects as non-queryable', () => {
    const columns: EntityTypeField[] = [
      {
        name: 'column1',
        dataType: {
          dataType: DataTypeValue.arrayType,
          itemDataType: {
            dataType: DataTypeValue.objectType,
            properties: [
              {
                name: 'nestedField',
                dataType: { dataType: DataTypeValue.stringType },
                queryable: true,
              },
            ],
          },
        },
        queryable: true,
      },
    ];

    const result = markNestedArrayOfObjectsNonQueryable(columns);

    expect(result[0].dataType.itemDataType?.properties?.[0].queryable).toBe(false);
  });

  it('does not modify non-array or non-object fields', () => {
    const columns: EntityTypeField[] = [
      {
        name: 'column1',
        dataType: { dataType: DataTypeValue.stringType },
        queryable: true,
      },
    ];

    const result = markNestedArrayOfObjectsNonQueryable(columns);

    expect(result).toEqual(columns);
  });

  it('handles deeply nested array->object structures', () => {
    const columns: EntityTypeField[] = [
      {
        name: 'column1',
        dataType: {
          dataType: DataTypeValue.arrayType,
          itemDataType: {
            dataType: DataTypeValue.objectType,
            properties: [
              {
                name: 'nestedArray',
                dataType: {
                  dataType: DataTypeValue.arrayType,
                  itemDataType: {
                    dataType: DataTypeValue.objectType,
                    properties: [
                      {
                        name: 'deepField',
                        dataType: { dataType: DataTypeValue.stringType },
                        queryable: true,
                      },
                    ],
                  },
                },
                queryable: true,
              },
            ],
          },
        },
        queryable: true,
      },
    ];

    const result = markNestedArrayOfObjectsNonQueryable(columns);

    expect(result[0].dataType.itemDataType?.properties?.[0].dataType.itemDataType?.properties?.[0].queryable).toBe(
      false,
    );
  });

  it('does not modify fields without array->object structure', () => {
    const columns: EntityTypeField[] = [
      {
        name: 'column1',
        dataType: {
          dataType: DataTypeValue.objectType,
          properties: [
            {
              name: 'nestedField',
              dataType: { dataType: DataTypeValue.stringType },
              queryable: true,
            },
          ],
        },
        queryable: true,
      },
    ];

    const result = markNestedArrayOfObjectsNonQueryable(columns);

    expect(result).toEqual(columns);
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

describe('ensureNestedObjectsAreProperForm', () => {
  it('converts jsonbArrayType to arrayType for nested objects', () => {
    const columns: EntityTypeField[] = [
      {
        name: 'column1',
        dataType: {
          dataType: DataTypeValue.jsonbArrayType,
          itemDataType: {
            dataType: DataTypeValue.objectType,
            properties: [
              {
                name: 'nestedField',
                dataType: { dataType: DataTypeValue.stringType },
              },
            ],
          },
        },
      },
    ];

    const result = ensureNestedObjectsAreProperForm(columns);

    expect(result[0].dataType.dataType).toBe(DataTypeValue.arrayType);
    expect(result[0].queryable).toBeFalse();
    expect(result[0].dataType.itemDataType?.dataType).toBe(DataTypeValue.objectType);
  });

  it('does not modify non-jsonbArrayType->object fields', () => {
    const columns: EntityTypeField[] = [
      {
        name: 'column1',
        dataType: { dataType: DataTypeValue.stringType },
      },
      {
        name: 'column2',
        dataType: {
          dataType: DataTypeValue.arrayType,
          itemDataType: {
            dataType: DataTypeValue.stringType,
          },
        },
      },
      {
        name: 'column3',
        dataType: {
          dataType: DataTypeValue.arrayType,
          itemDataType: {
            dataType: DataTypeValue.objectType,
            properties: [
              {
                name: 'nestedField',
                dataType: { dataType: DataTypeValue.stringType },
              },
            ],
          },
        },
      },
    ];

    const result = ensureNestedObjectsAreProperForm(columns);

    expect(result).toEqual(columns);
  });
});
