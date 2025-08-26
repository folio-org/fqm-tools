import { DataType, DataTypeValue, EntityType, EntityTypeField } from '@/types';
import { describe, expect, it, mock } from 'bun:test';
import entityTypeToCsv, { csvToMarkdownCompressed, getDataType, getOperators, getValues } from './csv';

mock.module('papaparse', () => ({
  unparse: mock((data) => JSON.stringify(data)), // saner testing
}));

describe('CSV generation', () => {
  const explodingFetchEntityType = mock(() => {
    throw new Error('Should not be called');
  });

  describe('entityTypeToCsv', () => {
    it('generates an empty CSV file for entity types with no columns', async () => {
      expect(
        await entityTypeToCsv(
          {
            id: '',
            name: '',
          },
          explodingFetchEntityType,
        ),
      ).toEqual('\ufeff[]');
    });

    it('generates a CSV string covering a majority of cases together', async () => {
      const mockEntityType: EntityType = {
        id: 'entity-id',
        name: 'test_entity',
        columns: [
          {
            name: 'column1',
            labelAlias: 'Column 1',
            dataType: { dataType: DataTypeValue.stringType },
            queryable: true,
            visibleByDefault: true,
            hidden: false,
            essential: true,
          },
          {
            name: 'nested.column2',
            labelAlias: 'Nested Column 2',
            dataType: {
              dataType: DataTypeValue.objectType,
              properties: [
                {
                  name: 'nestedProperty1',
                  labelAlias: 'Nested Property 1',
                  labelAliasFullyQualified: 'Nested Column 2 — Nested Property 1',
                  dataType: { dataType: DataTypeValue.integerType },
                  queryable: true,
                  visibleByDefault: false,
                  hidden: false,
                  essential: false,
                },
              ],
            },
            queryable: true,
            visibleByDefault: true,
            hidden: false,
            essential: false,
          },
          {
            name: 'recursive_column',
            labelAlias: 'Recursive Column',
            dataType: {
              dataType: DataTypeValue.arrayType,
              itemDataType: {
                dataType: DataTypeValue.objectType,
                properties: [
                  {
                    name: 'nestedProperty',
                    labelAlias: 'Nested Property',
                    labelAliasFullyQualified: 'Recursive Column > Nested Property',
                    dataType: {
                      dataType: DataTypeValue.objectType,
                      properties: [
                        {
                          name: 'deepNestedProperty',
                          labelAlias: 'Deep Nested Property',
                          labelAliasFullyQualified: 'Nested Property > Deep Nested Property',
                          dataType: { dataType: DataTypeValue.booleanType },
                          queryable: true,
                          visibleByDefault: true,
                          hidden: false,
                          essential: false,
                        },
                      ],
                    },
                    queryable: true,
                    visibleByDefault: true,
                    hidden: false,
                    essential: false,
                  },
                ],
              },
            },
            queryable: true,
            visibleByDefault: true,
            hidden: false,
            essential: false,
          },
        ],
      };

      const result = await entityTypeToCsv(mockEntityType, explodingFetchEntityType);

      const expectedData = [
        {
          'Entity ID': 'entity-id',
          'Base entity': 'test_entity',
          'Simple entity': '',
          Name: 'column1',
          Label: 'Column 1',
          'Table (nested)': '',
          Datatype: 'string',
          Values: '',
          Operators: '=, !=, contains, starts, empty',
          Queryable: true,
          'Visible by default': true,
          'API only': false,
          Essential: true,
          'Joins to': '',
        },
        {
          'Entity ID': 'entity-id',
          'Base entity': 'test_entity',
          'Simple entity': 'nested',
          Name: 'nested.column2',
          Label: 'Nested Column 2',
          'Table (nested)': '',
          Datatype: 'object',
          Values: '',
          Operators: '=, !=, >, >=, <, <=, empty',
          Queryable: true,
          'Visible by default': true,
          'API only': false,
          Essential: false,
          'Joins to': '',
        },
        {
          'Entity ID': 'entity-id',
          'Base entity': 'test_entity',
          'Simple entity': 'nested',
          Name: 'nested.column2[*]->nestedProperty1',
          Label: 'Nested Column 2 — Nested Property 1',
          'Table (nested)': 'Nested Column 2 > Nested Property 1',
          Datatype: 'integer',
          Values: '',
          Operators: '=, !=, >, >=, <, <=, empty',
          Queryable: true,
          'Visible by default': false,
          'API only': false,
          Essential: false,
          'Joins to': '',
        },
        {
          'API only': false,
          'Base entity': 'test_entity',
          Datatype: 'object[]',
          'Entity ID': 'entity-id',
          Essential: false,
          'Joins to': '',
          Label: 'Recursive Column',
          Name: 'recursive_column',
          Operators: 'contains all/any, not contains all/any, empty',
          Queryable: true,
          'Simple entity': '',
          'Table (nested)': '',
          Values: '',
          'Visible by default': true,
        },
        {
          'API only': false,
          'Base entity': 'test_entity',
          Datatype: 'object',
          'Entity ID': 'entity-id',
          Essential: false,
          'Joins to': '',
          Label: 'Recursive Column > Nested Property',
          Name: 'recursive_column[*]->nestedProperty',
          Operators: '=, !=, >, >=, <, <=, empty',
          Queryable: true,
          'Simple entity': '',
          'Table (nested)': 'Recursive Column > Nested Property',
          Values: '',
          'Visible by default': true,
        },
        {
          'API only': false,
          'Base entity': 'test_entity',
          Datatype: 'boolean',
          'Entity ID': 'entity-id',
          Essential: false,
          'Joins to': '',
          Label: 'Nested Property > Deep Nested Property',
          Name: 'nestedProperty[*]->deepNestedProperty',
          Operators: '=, !=, empty',
          Queryable: true,
          'Simple entity': '',
          'Table (nested)': 'Recursive Column > Nested Property > Deep Nested Property',
          Values: '',
          'Visible by default': true,
        },
      ];

      expect(JSON.parse(result.substring(1))).toEqual(expectedData);
    });

    it('handles joinsTo', async () => {
      const mockEntityType: EntityType = {
        id: 'entity-id',
        name: 'test_entity',
        columns: [
          {
            name: 'column1',
            labelAlias: 'Column 1',
            dataType: { dataType: DataTypeValue.stringType },
            queryable: true,
            visibleByDefault: true,
            hidden: false,
            essential: true,
            joinsTo: [{ type: 'equality-simple', targetId: 'target-id', targetField: 'target_field' }],
          },
        ],
      };

      const fetcher = mock(() => Promise.resolve({ name: 'other' } as EntityType));
      const result = JSON.parse((await entityTypeToCsv(mockEntityType, fetcher)).substring(1));

      expect(result[0]).toHaveProperty('Joins to', 'other.target_field');
    });
  });

  describe('getDataType', () => {
    it.each([
      [{ dataType: DataTypeValue.arrayType, itemDataType: { dataType: DataTypeValue.stringType } }, 'string[]'],
      [{ dataType: DataTypeValue.jsonbArrayType, itemDataType: { dataType: DataTypeValue.integerType } }, 'integer[]'],
      [{ dataType: DataTypeValue.arrayType }, 'unknown[]'],
      [{ dataType: DataTypeValue.booleanType }, 'boolean'],
      [{ dataType: DataTypeValue.dateType }, 'date'],
      [{ dataType: DataTypeValue.enumType }, 'enum'],
      [{ dataType: DataTypeValue.integerType }, 'integer'],
      [{ dataType: DataTypeValue.numberType }, 'number'],
      [{ dataType: DataTypeValue.objectType }, 'object'],
      [{ dataType: DataTypeValue.openUUIDType }, 'uuid'],
      [{ dataType: DataTypeValue.rangedUUIDType }, 'uuid'],
      [{ dataType: DataTypeValue.stringUUIDType }, 'uuid'],
      [{ dataType: DataTypeValue.stringType }, 'string'],
      [{ dataType: 'custom-type' as DataTypeValue }, 'custom-type'], // default case
    ])('returns correct data type for %o', (input: DataType, expected: string) => {
      expect(getDataType(input)).toBe(expected);
    });
  });

  describe('getOperators', () => {
    it.each([
      // Non-queryable column
      [{ queryable: false, dataType: { dataType: DataTypeValue.stringType } } as EntityTypeField, 'not queryable'],
      // Array data type
      [
        {
          queryable: true,
          dataType: { dataType: DataTypeValue.arrayType, itemDataType: { dataType: DataTypeValue.stringType } },
        } as EntityTypeField,
        'contains all/any, not contains all/any, empty',
      ],
      // String data type with no values
      [
        { queryable: true, dataType: { dataType: DataTypeValue.stringType }, values: undefined } as EntityTypeField,
        '=, !=, contains, starts, empty',
      ],
      // String data type with values
      [
        {
          queryable: true,
          dataType: { dataType: DataTypeValue.stringType },
          values: [{ value: 'a', label: 'A' }],
        } as EntityTypeField,
        '=, !=, in, not in, empty',
      ],
      // UUID data type
      [
        { queryable: true, dataType: { dataType: DataTypeValue.stringUUIDType } } as EntityTypeField,
        '=, !=, in, not in, empty',
      ],
      // Integer data type
      [
        { queryable: true, dataType: { dataType: DataTypeValue.integerType } } as EntityTypeField,
        '=, !=, >, >=, <, <=, empty',
      ],
      // Boolean data type
      [{ queryable: true, dataType: { dataType: DataTypeValue.booleanType } } as EntityTypeField, '=, !=, empty'],
      // Unknown data type
      [{ queryable: true, dataType: { dataType: 'unknown-type' as DataTypeValue } } as EntityTypeField, '?'],
    ])('returns correct operators for column: %o', async (column, expected) => {
      const result = await getOperators(column, explodingFetchEntityType);
      expect(result).toBe(expected);
    });
  });

  describe('getValues', () => {
    it('returns "dropdown from API" when valueSourceApi is defined', async () => {
      const column: EntityTypeField = {
        valueSourceApi: { path: '/api/path' },
      } as EntityTypeField;

      const result = await getValues(column, explodingFetchEntityType);
      expect(result).toBe('dropdown from API (/api/path)');
    });

    it('returns "true/false" when values are hardcoded as true and false', async () => {
      const column: EntityTypeField = {
        values: [
          { value: 'true', label: 'True' },
          { value: 'false', label: 'False' },
        ],
      } as EntityTypeField;

      const result = await getValues(column, explodingFetchEntityType);
      expect(result).toBe('true/false');
    });

    it('returns "dropdown hardcoded" with labels when values are hardcoded', async () => {
      const column: EntityTypeField = {
        values: [
          { value: '1', label: 'One' },
          { value: '2', label: 'Two' },
        ],
      } as EntityTypeField;

      const result = await getValues(column, explodingFetchEntityType);
      expect(result).toBe('dropdown hardcoded (One, Two)');
    });

    it('returns "dropdown from entity" when source is defined', async () => {
      const column: EntityTypeField = {
        source: { entityTypeId: 'entity-id', columnName: 'column-name' },
      } as EntityTypeField;

      const fetcher = mock(() => Promise.resolve({ id: 'id', name: 'entity-name' }));

      const result = await getValues(column, fetcher);
      expect(result).toBe('dropdown from entity (entity-name -> column-name)');
      expect(fetcher).toHaveBeenCalledWith('entity-id');
    });

    it('returns an empty string when no valueSourceApi, values, or source is defined', async () => {
      const column: EntityTypeField = {} as EntityTypeField;

      const result = await getValues(column, explodingFetchEntityType);
      expect(result).toBe('');
    });
  });
});

describe('csvToMarkdownCompressed', () => {
  it('should convert a simple CSV to markdown, skipping first 3 columns', () => {
    const csv = ['a,b,c,d,e', '1,2,3,4,5', 'x,y,z,w,v'].join('\n');

    const result = csvToMarkdownCompressed(csv);

    // Only columns d and e should remain
    expect(result).toBe('|d|e|\n|-|-|\n|4|5|\n|w|v|');
  });
});
