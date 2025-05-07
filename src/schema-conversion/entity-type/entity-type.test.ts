import { DataTypeValue, EntityTypeGenerationConfig } from '@/types';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { describe, expect, it } from 'bun:test';
import { JSONSchema7 } from 'json-schema';
import path from 'path';
import createEntityTypeFromConfig from './entity-type';

describe('createEntityTypeFromConfig', () => {
  it('creates simple entity type with RMB-style index correctly', async () => {
    const inputConfig: EntityTypeGenerationConfig = {
      metadata: {
        team: 'corsair',
        domain: 'users',
        module: 'mod-users',
      },
      sources: [
        {
          name: 'department',
          table: 'marinara',
        },
      ],
      entityTypes: [
        {
          name: 'simple_department',
          source: 'department',
          schema: 'test/schemas/department.json',
          permissions: ['perm1', 'perm2'],
          sort: ['id', 'ASC'],
          private: true,
          useRmbIndexStyle: true,
        },
      ],
    };

    const schema = await $RefParser.dereference(path.resolve('test/schemas/department.json'));

    const result = createEntityTypeFromConfig(inputConfig.entityTypes[0], schema as JSONSchema7, inputConfig);
    const expected = await Bun.file('test/entity-types/simple_department.json').json();

    expect(result.entityType).toEqual(expected);
    expect(result.issues).toBeEmpty();
  });

  it('fails on non-object schema', () => {
    expect(() => {
      createEntityTypeFromConfig(
        {} as EntityTypeGenerationConfig['entityTypes'][number],
        { type: 'string' } as JSONSchema7,
        {} as EntityTypeGenerationConfig,
      );
    }).toThrowError(/Schema .+ must be an object with properties!/);
  });

  it('fails on empty object schema', () => {
    expect(() => {
      createEntityTypeFromConfig(
        {} as EntityTypeGenerationConfig['entityTypes'][number],
        { type: 'object' } as JSONSchema7,
        {} as EntityTypeGenerationConfig,
      );
    }).toThrowError(/Schema .+ must be an object with properties!/);
  });

  it('fails on missing source', async () => {
    const schema = await $RefParser.dereference(path.resolve('test/schemas/department.json'));

    expect(() =>
      createEntityTypeFromConfig(
        {
          name: 'simple_department',
          source: 'department',
          schema: 'test/schemas/department.json',
          permissions: ['perm1', 'perm2'],
          sort: ['id', 'ASC'],
          private: true,
        } as EntityTypeGenerationConfig['entityTypes'][number],
        schema as JSONSchema7,
        { metadata: { module: 'foo' }, sources: [] } as unknown as EntityTypeGenerationConfig,
      ),
    ).toThrowError(/Source department not found in source list/);
  });

  it('properly handles mapped source on missing source', async () => {
    const schema = await $RefParser.dereference(path.resolve('test/schemas/department.json'));

    expect(
      createEntityTypeFromConfig(
        {
          name: 'simple_department',
          source: 'department',
          schema: 'test/schemas/department.json',
          permissions: ['perm1', 'perm2'],
          sort: ['id', 'ASC'],
          private: true,
        } as EntityTypeGenerationConfig['entityTypes'][number],
        schema as JSONSchema7,
        {
          metadata: { module: 'foo' },
          sources: [
            {
              name: 'other-source',
              table: 'table',
            },
          ],
          sourceMap: { department: 'other-source' },
        } as unknown as EntityTypeGenerationConfig,
      ).entityType.sources![0].target,
    ).toBe('other-source');
  });

  it('generates jsonb field by default', async () => {
    expect(
      createEntityTypeFromConfig(
        {
          name: 'simple_department',
          source: 'department',
          schema: 'test/schemas/department.json',
          permissions: ['perm1', 'perm2'],
          sort: ['id', 'ASC'],
          private: true,
        } as EntityTypeGenerationConfig['entityTypes'][number],
        { type: 'object', properties: {} } as JSONSchema7,
        {
          metadata: { module: 'foo' },
          sources: [
            {
              name: 'department',
              view: 'marinara',
            },
          ],
        } as unknown as EntityTypeGenerationConfig,
      ).entityType.columns![0],
    ).toHaveProperty('name', 'jsonb');
  });

  it('does not generate jsonb if disabled', async () => {
    expect(
      createEntityTypeFromConfig(
        {
          name: 'simple_department',
          source: 'department',
          schema: 'test/schemas/department.json',
          permissions: ['perm1', 'perm2'],
          sort: ['id', 'ASC'],
          private: true,
          includeJsonbField: false,
        } as EntityTypeGenerationConfig['entityTypes'][number],
        { type: 'object', properties: {} } as JSONSchema7,
        {
          metadata: { module: 'foo' },
          sources: [
            {
              name: 'department',
              view: 'marinara',
            },
          ],
        } as unknown as EntityTypeGenerationConfig,
      ).entityType.columns,
    ).toBeEmpty();
  });

  it('excludes fields if requested', async () => {
    expect(
      createEntityTypeFromConfig(
        {
          name: 'simple_department',
          source: 'department',
          schema: 'test/schemas/department.json',
          permissions: ['perm1', 'perm2'],
          sort: ['id', 'ASC'],
          private: true,
          fieldExclusions: ['jsonb'],
        } as EntityTypeGenerationConfig['entityTypes'][number],
        { type: 'object', properties: {} } as JSONSchema7,
        {
          metadata: { module: 'foo' },
          sources: [
            {
              name: 'department',
              view: 'marinara',
            },
          ],
        } as unknown as EntityTypeGenerationConfig,
      ).entityType.columns,
    ).toBeEmpty();
  });

  it('overrides add and update fields as applicable', async () => {
    expect(
      createEntityTypeFromConfig(
        {
          name: 'simple_department',
          source: 'department',
          schema: 'test/schemas/department.json',
          permissions: ['perm1', 'perm2'],
          sort: ['id', 'ASC'],
          private: true,
          fieldOverrides: [
            {
              name: 'jsonb',
              dataType: { dataType: DataTypeValue.stringType },
              valueGetter: 'overridden',
            },
            {
              name: 'test',
              dataType: { dataType: DataTypeValue.stringType },
              valueGetter: 'new field',
            },
          ],
        } as EntityTypeGenerationConfig['entityTypes'][number],
        { type: 'object', properties: {} } as JSONSchema7,
        {
          metadata: { module: 'foo' },
          sources: [
            {
              name: 'department',
              view: 'marinara',
            },
          ],
        } as unknown as EntityTypeGenerationConfig,
      ).entityType.columns,
    ).toEqual([
      {
        name: 'jsonb',
        dataType: { dataType: DataTypeValue.stringType },
        valueGetter: 'overridden',
      },
      {
        name: 'test',
        dataType: { dataType: DataTypeValue.stringType },
        valueGetter: 'new field',
      },
    ]);
  });
});
