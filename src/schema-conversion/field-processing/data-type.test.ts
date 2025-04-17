import { DataTypeValue, EntityTypeGenerationConfig } from '@/types';
import { describe, expect, it } from 'bun:test';
import { JSONSchema7 } from 'json-schema';
import { getDataType } from './data-type';

const entityTypeConfig = { source: 'sauce' } as EntityTypeGenerationConfig['entityTypes'][0];
const config = { metadata: { module: 'mod-foo' } } as EntityTypeGenerationConfig;

describe('getDataType', () => {
  it.each([
    ['string', DataTypeValue.stringType],
    [['string', 'null'], DataTypeValue.stringType],
    ['boolean', DataTypeValue.booleanType],
    ['integer', DataTypeValue.integerType],
    ['number', DataTypeValue.numberType],
  ] as [string | string[], DataTypeValue][])('converts primitive %s to %s', (type, expected) => {
    const [dataType, issues] = getDataType({ type } as JSONSchema7, 'outer', entityTypeConfig, config);

    expect(issues).toBeEmpty();
    expect(dataType.dataType).toBe(expected);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it.each([
    { $ref: '../../shared/raml-common/uuid.json' },
    { $ref: 'special-uuid.yaml' },
    { $ref: '#/components/schemas/Cool UUID.yaml' },
    { type: 'string', format: 'uuid' },
    { type: 'string', pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' },
    {
      type: 'string',
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
    },
    { type: 'string', pattern: '^[a-f0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' },
  ])('converts %o to rangedUUIDType', (schema) => {
    const [dataType, issues] = getDataType(schema as JSONSchema7, 'outer', entityTypeConfig, config);

    expect(issues.filter((s) => !s.startsWith('Unknown reference type'))).toBeEmpty();
    expect(dataType.dataType).toBe(DataTypeValue.rangedUUIDType);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it.each([
    { type: 'string', format: 'date-time' },
    { type: 'string', format: 'date' },
  ])('converts %o to dateType', (schema) => {
    const [dataType, issues] = getDataType(schema as JSONSchema7, 'outer', entityTypeConfig, config);

    expect(issues).toBeEmpty();
    expect(dataType.dataType).toBe(DataTypeValue.dateType);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it('ignores unknown pattern/format', () => {
    const [dataType, issues] = getDataType(
      { type: 'string', format: 'something funky', pattern: '{[]$[][^}[][//' } as JSONSchema7,
      'outer',
      entityTypeConfig,
      config,
    );

    expect(issues).toBeEmpty();
    expect(dataType.dataType).toBe(DataTypeValue.stringType);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it('safely fails on unknown type', () => {
    const [dataType, issues] = getDataType(
      { type: 'unknown' } as unknown as JSONSchema7,
      'outer',
      entityTypeConfig,
      config,
    );

    expect(issues).toEqual(['Unknown type: unknown']);
    expect(dataType.dataType).toBe(DataTypeValue.stringType);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it('safely fails on unknown ref', () => {
    const [dataType, issues] = getDataType(
      { $ref: 'unknown' } as unknown as JSONSchema7,
      'outer',
      entityTypeConfig,
      config,
    );

    expect(issues).toEqual(['Unknown reference: "unknown"']);
    expect(dataType.dataType).toBe(DataTypeValue.stringType);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it.each([
    [{ type: 'string', 'x-fqm-data-type': 'integerType' }, DataTypeValue.integerType],
    [{ type: 'array', 'x-fqm-data-type': 'integerType' }, DataTypeValue.integerType],
    [{ type: 'object', 'x-fqm-data-type': 'integerType' }, DataTypeValue.integerType],
  ])('handles overrides to primitive on %o', (schema, expected) => {
    const [dataType, issues] = getDataType(schema as JSONSchema7, 'outer', entityTypeConfig, config);

    expect(issues).toBeEmpty();
    expect(dataType.dataType).toBe(expected);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it.each([
    [{ type: 'array' }, DataTypeValue.jsonbArrayType],
    [{ type: 'string', 'x-fqm-data-type': 'arrayType' }, DataTypeValue.arrayType],
    [{ type: 'string', 'x-fqm-data-type': 'jsonbArrayType' }, DataTypeValue.jsonbArrayType],
  ])('handles empty arrays and equivalent overrides on %o', (schema, expected) => {
    const [dataType, issues] = getDataType(schema as JSONSchema7, 'outer', entityTypeConfig, config);

    expect(issues).toEqual(['Array type with unknown item type; defaulting to string']);
    expect(dataType.dataType).toBe(expected);
    expect(dataType.itemDataType).toEqual({ dataType: DataTypeValue.stringType });
    expect(dataType.properties).toBeUndefined();
  });

  it.each([{ type: 'object' }, { type: 'string', 'x-fqm-data-type': 'objectType' }])(
    'handles empty object types and equivalent overrides on %o',
    (schema) => {
      const [dataType, issues] = getDataType(schema as JSONSchema7, 'outer', entityTypeConfig, config);

      expect(issues).toBeEmpty();
      expect(dataType.dataType).toBe(DataTypeValue.objectType);
      expect(dataType.itemDataType).toBeUndefined();
      expect(dataType.properties).toEqual([]);
    },
  );

  it('handles nested array-object properties', () => {
    const [dataType, issues] = getDataType(
      {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            foo: { type: 'string' },
            bar: { type: 'string', format: 'uuid' },
            bad: { 'folio:isVirtual': true } as unknown as JSONSchema7,
          },
        },
      },
      '',
      entityTypeConfig,
      config,
    );

    expect(issues).toContain(
      'in array: in object property bad: It looks like this is a virtual property (folio:isVirtual=true); ignoring?',
    );
    expect(dataType as object).toEqual({
      dataType: 'jsonbArrayType',
      itemDataType: {
        dataType: 'objectType',
        properties: [
          {
            dataType: {
              dataType: 'stringType',
            },
            filterValueGetter:
              "(SELECT array_agg(lower(elems.value->>'foo')) FROM jsonb_array_elements(:sauce.jsonb) AS elems)",
            name: 'foo',
            property: 'foo',
            queryable: true,
            valueFunction: 'lower(:value)',
            valueGetter: "(SELECT array_agg(elems.value->>'foo') FROM jsonb_array_elements(:sauce.jsonb) AS elems)",
            visibleByDefault: false,
          },
          {
            dataType: {
              dataType: 'rangedUUIDType',
            },
            filterValueGetter:
              "(SELECT array_agg(lower(elems.value->>'bar')) FROM jsonb_array_elements(:sauce.jsonb) AS elems)",
            name: 'bar',
            property: 'bar',
            queryable: true,
            valueFunction: 'lower(:value)',
            valueGetter: "(SELECT array_agg(elems.value->>'bar') FROM jsonb_array_elements(:sauce.jsonb) AS elems)",
            visibleByDefault: false,
          },
        ],
      },
    });
  });
});
