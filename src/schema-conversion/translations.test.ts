import { DataTypeValue, EntityTypeField } from '@/types';
import { beforeEach, describe, expect, it, Mock, mock, test } from 'bun:test';
import { error, warn } from './error';
import {
  inferTranslationsFromEntityType,
  inferTranslationsFromField,
  marshallExternalTranslations,
  unmarshallTranslationKey,
} from './translations';

mock.module('./error', () => ({
  error: mock(() => ({})),
  warn: mock(() => ({})),
}));

describe('inferTranslationsFromEntityType', () => {
  it('infers translations for entity type and fields together', () => {
    const result = inferTranslationsFromEntityType({
      id: 'zzz',
      name: 'test_entity',
      columns: [
        { name: 'my_date', dataType: { dataType: DataTypeValue.stringType } },
        { name: 'cool_id', dataType: { dataType: DataTypeValue.rangedUUIDType } },
      ],
    });

    expect(result).toEqual({
      'entityType.test_entity': 'Test entity',
      'entityType.test_entity.my_date': 'My date',
      'entityType.test_entity.cool_id': 'Cool UUID',
    });
  });
});

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
          dataType: DataTypeValue.arrayType,
          itemDataType: {
            dataType: DataTypeValue.objectType,
            properties: [{ name: 'nested_field', dataType: { dataType: DataTypeValue.stringType } }],
          },
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
  beforeEach(async () => {
    (error as Mock<typeof error>).mockReset();
    (warn as Mock<typeof warn>).mockReset();
    mock.restore();
  });

  it('transforms translations to the expected format', () => {
    const translations = {
      'fqm.entityType.test_entity.field1': 'Field 1',
      'fqm.entityType.test_entity.field2': 'Field 2',
    };
    const metadata = { module: 'mod-test', team: 'foo', domain: 'circulation' } as const;

    const result = marshallExternalTranslations(translations, metadata, [
      'entityType.mod_test__test_entity.field1',
      'entityType.mod_test__test_entity.field2',
    ]);

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
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
    const metadata = { module: 'mod-test', team: 'foo', domain: 'circulation' } as const;

    const result = marshallExternalTranslations(translations, metadata, ['entityType.mod_test__test_entity.field1']);

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(result).toEqual({
      'entityType.mod_test__test_entity.field1': 'Field 1',
    });
  });

  it('handles empty translations object', () => {
    const translations = {};
    const metadata = { module: 'mod-test', team: 'foo', domain: 'circulation' } as const;

    const result = marshallExternalTranslations(translations, metadata, []);

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it('handles multiple entity types correctly', () => {
    const translations = {
      'fqm.entityType.entity_one.field1': 'Field 1',
      'fqm.entityType.entity_two.field2': 'Field 2',
    };
    const metadata = { module: 'mod-test', team: 'foo', domain: 'circulation' } as const;

    const result = marshallExternalTranslations(translations, metadata, [
      'entityType.mod_test__entity_one.field1',
      'entityType.mod_test__entity_two.field2',
    ]);

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(result).toEqual({
      'entityType.mod_test__entity_one.field1': 'Field 1',
      'entityType.mod_test__entity_two.field2': 'Field 2',
    });
  });

  it('warns if extra translations are found', () => {
    const translations = {
      'fqm.entityType.test_entity.field1': 'Field 1',
      'fqm.entityType.test_entity.field2': 'Field 2',
      'fqm.entityType.extra_entity.field3': 'Extra Field',
    };
    const metadata = { module: 'mod-test', team: 'foo', domain: 'circulation' } as const;

    const result = marshallExternalTranslations(translations, metadata, [
      'entityType.mod_test__test_entity.field1',
      'entityType.mod_test__test_entity.field2',
    ]);

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(metadata, undefined, {
      type: 'translations-extra',
      extraTranslations: ['fqm.entityType.extra_entity.field3'],
    });
    expect(result).toEqual({
      'entityType.mod_test__test_entity.field1': 'Field 1',
      'entityType.mod_test__test_entity.field2': 'Field 2',
    });
  });
});

test.each([
  ['entityType.mod_foo__entity', 'fqm.entityType.entity'],
  ['entityType.entity', 'fqm.entityType.entity'],
  ['entityType.mod_foo__entity.field', 'fqm.entityType.entity.field'],
  ['entityType.entity.field', 'fqm.entityType.entity.field'],
])('unmarshallTranslationKey removes module prefix', (input, expected) =>
  expect(unmarshallTranslationKey(input)).toEqual(expected),
);
