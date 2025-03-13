import { DataTypeValue } from '@/types';
import { describe, expect, it } from 'bun:test';
import { Schema } from 'genson-js/dist';
import { getDataType } from './data-type';

describe('getDataType', () => {
  it.each([
    ['string', DataTypeValue.stringType],
    [['string', 'null'], DataTypeValue.stringType],
    ['boolean', DataTypeValue.booleanType],
    ['integer', DataTypeValue.integerType],
    ['number', DataTypeValue.numberType],
  ] as [string | string[], DataTypeValue][])('converts primitive %s to %s', (type, expected) => {
    const [dataType, issues] = getDataType('source', { type } as Schema, 'outer');

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
    const [dataType, issues] = getDataType('source', schema as Schema, 'outer');

    expect(issues.filter((s) => !s.startsWith('Unknown reference type'))).toBeEmpty();
    expect(dataType.dataType).toBe(DataTypeValue.rangedUUIDType);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it.each([
    { type: 'string', format: 'date-time' },
    { type: 'string', format: 'date' },
  ])('converts %o to dateType', (schema) => {
    const [dataType, issues] = getDataType('source', schema as Schema, 'outer');

    expect(issues).toBeEmpty();
    expect(dataType.dataType).toBe(DataTypeValue.dateType);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it('ignores unknown pattern/format', () => {
    const [dataType, issues] = getDataType(
      'source',
      { type: 'string', format: 'something funky', pattern: '{[]$[][^}[][//' } as Schema,
      'outer',
    );

    expect(issues).toBeEmpty();
    expect(dataType.dataType).toBe(DataTypeValue.stringType);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it('safely fails on unknown type', () => {
    const [dataType, issues] = getDataType('source', { type: 'unknown' } as unknown as Schema, 'outer');

    expect(issues).toEqual(['Unknown type: unknown']);
    expect(dataType.dataType).toBe(DataTypeValue.stringType);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it('safely fails on unknown ref', () => {
    const [dataType, issues] = getDataType('source', { $ref: 'unknown' } as unknown as Schema, 'outer');

    expect(issues).toEqual(['Unknown reference: "unknown"']);
    expect(dataType.dataType).toBe(DataTypeValue.stringType);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it.each([
    [{ type: 'string', 'x-fqm-datatype': 'integerType' }, DataTypeValue.integerType],
    [{ type: 'array', 'x-fqm-datatype': 'integerType' }, DataTypeValue.integerType],
    [{ type: 'object', 'x-fqm-datatype': 'integerType' }, DataTypeValue.integerType],
  ])('handles overrides to primitive on %o', (schema, expected) => {
    const [dataType, issues] = getDataType('source', schema as Schema, 'outer');

    expect(issues).toBeEmpty();
    expect(dataType.dataType).toBe(expected);
    expect(dataType.itemDataType).toBeUndefined();
    expect(dataType.properties).toBeUndefined();
  });

  it.each([
    [{ type: 'array' }, DataTypeValue.jsonbArrayType],
    [{ type: 'string', 'x-fqm-datatype': 'arrayType' }, DataTypeValue.arrayType],
    [{ type: 'string', 'x-fqm-datatype': 'jsonbArrayType' }, DataTypeValue.jsonbArrayType],
  ])('handles empty arrays and equivalent overrides on %o', (schema, expected) => {
    const [dataType, issues] = getDataType('source', schema as Schema, 'outer');

    expect(issues).toEqual(['Array type with unknown item type; defaulting to string']);
    expect(dataType.dataType).toBe(expected);
    expect(dataType.itemDataType).toEqual({ dataType: DataTypeValue.stringType });
    expect(dataType.properties).toBeUndefined();
  });

  it.each([{ type: 'object' }, { type: 'string', 'x-fqm-datatype': 'objectType' }])(
    'handles empty object types and equivalent overrides on %o',
    (schema) => {
      const [dataType, issues] = getDataType('source', schema as Schema, 'outer');

      expect(issues).toBeEmpty();
      expect(dataType.dataType).toBe(DataTypeValue.objectType);
      expect(dataType.itemDataType).toBeUndefined();
      expect(dataType.properties).toEqual([]);
    },
  );
});
