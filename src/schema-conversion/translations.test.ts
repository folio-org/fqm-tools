import { DataTypeValue, EntityTypeField } from '@/types';
import { inferTranslationsFromField, marshallExternalTranslations } from './translations';
import { describe, it, expect } from 'bun:test';

describe('inferTranslationsFromField', () => {
  const testCases = [
    [
      'handles simple string field',
      {
        name: 'field1',
        dataType: { dataType: DataTypeValue.stringType },
      } as EntityTypeField,
      {
        'entityType.parent_entity.field1': 'Field1',
      },
    ],
    [
      'handles rangedUUIDType, replaces "id" with "UUID"',
      {
        name: 'cool_id',
        dataType: { dataType: DataTypeValue.rangedUUIDType },
      } as EntityTypeField,
      {
        'entityType.parent_entity.cool_id': 'Cool UUID',
      },
    ],
    [
      'handles objects with nested properties',
      {
        name: 'object_field',
        dataType: {
          dataType: DataTypeValue.objectType,
          properties: [{ name: 'nested_field', dataType: { dataType: DataTypeValue.stringType } }],
        },
      } as EntityTypeField,
      {
        'entityType.parent_entity.object_field': 'Object field',
        'entityType.parent_entity.object_field.nested_field': 'Nested field',
        'entityType.parent_entity.object_field.nested_field._qualified': 'Object field nested field',
      },
    ],
    [
      'handles arrays',
      {
        name: 'array_field',
        dataType: {
          dataType: DataTypeValue.arrayType,
          itemDataType: { dataType: DataTypeValue.stringType },
        },
      } as EntityTypeField,
      {
        'entityType.parent_entity.array_field': 'Array field',
      },
    ],
    [
      'handles jsonb',
      {
        name: 'jsonb',
        dataType: { dataType: DataTypeValue.stringType },
      } as EntityTypeField,
      {
        'entityType.parent_entity.jsonb': 'JSONB',
      },
    ],
    ['returns empty object for undefined column', undefined, {}],
  ] as const;

  it.each(testCases)('%s', (_, column, expected) => {
    const result = inferTranslationsFromField(column, 'parent_entity');
    expect(result).toEqual(expected as Record<string, string>);
  });
});

describe('marshallExternalTranslations', () => {
  it('transforms translations to the expected format', () => {
    const translations = {
      'fqm.entityType.test_entity.field1': 'Field 1',
      'fqm.entityType.test_entity.field2': 'Field 2',
    };
    const moduleName = 'mod-test';

    const result = marshallExternalTranslations(translations, moduleName);

    expect(result).toEqual({
      'entityType.mod_test__test_entity.field1': 'Field 1',
      'entityType.mod_test__test_entity.field2': 'Field 2',
    });
  });

  it('ignores that do not start with "fqm."', () => {
    const translations = {
      'fqm.entityType.test_entity.field1': 'Field 1',
      'other.key': 'Other Value',
    };
    const moduleName = 'mod-test';

    const result = marshallExternalTranslations(translations, moduleName);

    expect(result).toEqual({
      'entityType.mod_test__test_entity.field1': 'Field 1',
    });
  });

  it('handles translations object', () => {
    const translations = {};
    const moduleName = 'mod-test';

    const result = marshallExternalTranslations(translations, moduleName);

    expect(result).toEqual({});
  });

  it('handles entity types correctly', () => {
    const translations = {
      'fqm.entityType.entity_one.field1': 'Field 1',
      'fqm.entityType.entity_two.field2': 'Field 2',
    };
    const moduleName = 'mod-test';

    const result = marshallExternalTranslations(translations, moduleName);

    expect(result).toEqual({
      'entityType.mod_test__entity_one.field1': 'Field 1',
      'entityType.mod_test__entity_two.field2': 'Field 2',
    });
  });
});
