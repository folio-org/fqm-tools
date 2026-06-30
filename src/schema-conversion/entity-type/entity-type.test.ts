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

  it('reports an issue if a field to be excluded does not exist', async () => {
    const { entityType, issues } = createEntityTypeFromConfig(
      {
        name: 'simple_department',
        source: 'department',
        schema: 'test/schemas/department.json',
        permissions: ['perm1', 'perm2'],
        sort: ['id', 'ASC'],
        private: true,
        fieldExclusions: ['test'],
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
    );

    expect(entityType.columns).toHaveLength(1);
    expect(entityType.columns![0].name).toBe('jsonb');
    expect(issues).toContainEqual('Excluded field test does not exist in the entity type');
  });

  const SOURCE = { columnName: 'foo', entityTypeId: '00000000-0000-0000-0000-000000000000' };
  const VALUE_SOURCE_API = { path: 'p', valueJsonPath: '$.id', labelJsonPath: '$.name' };

  function generateWithFieldAdditions(fieldAdditions: object[]) {
    return createEntityTypeFromConfig(
      {
        name: 'simple_department',
        source: 'department',
        schema: 'test/schemas/department.json',
        permissions: ['perm1', 'perm2'],
        sort: ['id', 'ASC'],
        private: true,
        includeJsonbField: false,
        fieldAdditions,
      } as EntityTypeGenerationConfig['entityTypes'][number],
      { type: 'object', properties: {} } as JSONSchema7,
      {
        metadata: { module: 'foo' },
        sources: [{ name: 'department', view: 'marinara' }],
      } as unknown as EntityTypeGenerationConfig,
    );
  }

  it('fails when a top-level field defines both source and valueSourceApi', () => {
    expect(() =>
      generateWithFieldAdditions([
        {
          name: 'conflicting',
          dataType: { dataType: DataTypeValue.stringType },
          source: SOURCE,
          valueSourceApi: VALUE_SOURCE_API,
        },
      ]),
    ).toThrowError(/simple_department.*\bconflicting\b/);
  });

  it('fails when a nested field defines both, reporting the full path', () => {
    expect(() =>
      generateWithFieldAdditions([
        {
          name: 'parent',
          dataType: {
            dataType: DataTypeValue.arrayType,
            itemDataType: {
              dataType: DataTypeValue.objectType,
              properties: [
                {
                  name: 'child',
                  dataType: { dataType: DataTypeValue.stringType },
                  source: SOURCE,
                  valueSourceApi: VALUE_SOURCE_API,
                },
              ],
            },
          },
        },
      ]),
    ).toThrowError(/simple_department.*\bparent\.child\b/);
  });

  it('passes when fields define only source or only valueSourceApi', () => {
    expect(() =>
      generateWithFieldAdditions([
        { name: 'only_source', dataType: { dataType: DataTypeValue.stringType }, source: SOURCE },
        { name: 'only_api', dataType: { dataType: DataTypeValue.stringType }, valueSourceApi: VALUE_SOURCE_API },
      ]),
    ).not.toThrow();
  });

  it('fails when a schema property defines both x-fqm-source and x-fqm-value-source-api', () => {
    const schema = {
      type: 'object',
      properties: {
        conflicting: { type: 'string', 'x-fqm-source': SOURCE, 'x-fqm-value-source-api': VALUE_SOURCE_API },
      },
    } as JSONSchema7;

    const entityType = {
      name: 'simple_department',
      source: 'department',
      schema: 'inline',
      permissions: ['perm1', 'perm2'],
      sort: ['id', 'ASC'],
      private: true,
    } satisfies EntityTypeGenerationConfig['entityTypes'][number];

    const config = {
      metadata: { team: 'corsair', domain: 'users', module: 'foo' },
      sources: [{ name: 'department', table: 'marinara' }],
      entityTypes: [entityType],
    } satisfies EntityTypeGenerationConfig;

    expect(() => createEntityTypeFromConfig(entityType, schema, config)).toThrowError(
      /simple_department.*\bconflicting\b/,
    );
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
          fieldAdditions: [
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
