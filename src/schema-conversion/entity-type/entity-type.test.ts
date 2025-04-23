import { DataTypeValue, EntityType, EntityTypeFieldJoinIntermediate, EntityTypeGenerationConfig } from '@/types';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { describe, expect, it } from 'bun:test';
import { JSONSchema7 } from 'json-schema';
import path from 'path';
import createEntityTypeFromConfig, { resolveEntityTypeJoins } from './entity-type';

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
          view: 'marinara',
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
        {} as EntityTypeGenerationConfig['entityTypes'][0],
        { type: 'string' } as JSONSchema7,
        {} as EntityTypeGenerationConfig,
      );
    }).toThrowError(/Schema .+ must be an object with properties!/);
  });

  it('fails on empty object schema', () => {
    expect(() => {
      createEntityTypeFromConfig(
        {} as EntityTypeGenerationConfig['entityTypes'][0],
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
        } as EntityTypeGenerationConfig['entityTypes'][0],
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
        } as EntityTypeGenerationConfig['entityTypes'][0],
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
        } as EntityTypeGenerationConfig['entityTypes'][0],
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
});

describe('resolveEntityTypeJoins', () => {
  const targetEntityType = {
    entityType: {
      id: 'targetId',
      name: 'target_module__target_entity',
      columns: [
        {
          name: 'target_column',
          dataType: { dataType: DataTypeValue.stringType },
        },
      ],
    },
    domain: 'other',
    module: 'mod-foo',
  };
  const getSourceEntityType = (
    joins?: EntityTypeFieldJoinIntermediate[],
    dataType: DataTypeValue = DataTypeValue.stringType,
  ) => ({
    entityType: {
      id: 'sourceId',
      name: 'source_entity',
      columns: [
        {
          name: 'source_column',
          dataType: { dataType },
          joinsToIntermediate: joins,
        },
      ],
    },
    domain: 'foo',
    module: 'mod-foo',
  });
  const getResultingJoins = (entityTypes: { entityType: EntityType }[]) =>
    entityTypes
      .flatMap((et) => et.entityType.columns!)
      .filter((c) => Boolean(c.joinsTo))
      .flatMap((c) => c.joinsTo);

  it('does nothing with no joins', () => {
    const input = [getSourceEntityType(), targetEntityType];
    const expected = JSON.parse(JSON.stringify(input));

    const result = resolveEntityTypeJoins(input, false);

    expect(result.entityTypes).toEqual(expected);
    expect(result.issues).toBeEmpty();
  });

  it('resolves join to existing column with explicit type', () => {
    const result = resolveEntityTypeJoins(
      [
        getSourceEntityType([
          {
            targetModule: 'target_module',
            targetEntity: 'target_entity',
            targetField: 'target_column',
            type: 'custom',
            sql: ':this.id = :that.id',
          },
        ]),
        targetEntityType,
      ],
      false,
    );

    expect(getResultingJoins(result.entityTypes)).toEqual([
      {
        targetField: 'target_column',
        targetId: 'targetId',
        type: 'custom',
        sql: ':this.id = :that.id',
      },
    ]);
    expect(result.issues).toBeEmpty();
  });

  it('resolves join to existing column without explicit join type (UUID datatype)', () => {
    const result = resolveEntityTypeJoins(
      [
        getSourceEntityType(
          [
            {
              targetModule: 'target_module',
              targetEntity: 'target_entity',
              targetField: 'target_column',
              direction: 'left',
            },
          ],
          DataTypeValue.rangedUUIDType,
        ),
        targetEntityType,
      ],
      false,
    );

    expect(getResultingJoins(result.entityTypes)).toEqual([
      {
        targetField: 'target_column',
        targetId: 'targetId',
        type: 'equality-cast-uuid',
        direction: 'left',
      },
    ]);
    expect(result.issues).toBeEmpty();
  });

  it('resolves join to existing column without explicit join type (non-UUID datatype)', () => {
    const result = resolveEntityTypeJoins(
      [
        getSourceEntityType(
          [
            {
              targetModule: 'target_module',
              targetEntity: 'target_entity',
              targetField: 'target_column',
            },
          ],
          DataTypeValue.numberType,
        ),
        targetEntityType,
      ],
      false,
    );

    expect(getResultingJoins(result.entityTypes)).toEqual([
      {
        targetField: 'target_column',
        targetId: 'targetId',
        type: 'equality-simple',
      },
    ]);
    expect(result.issues).toBeEmpty();
  });

  it('abandons join if no target entity type is found', () => {
    const result = resolveEntityTypeJoins(
      [
        getSourceEntityType([
          {
            targetModule: 'bad',
            targetEntity: 'worse',
            targetField: 'definitely_not_a_column',
          },
        ]),
      ],
      false,
    );

    expect(getResultingJoins(result.entityTypes)).toBeEmpty();
    expect(result.issues).toContain(
      '::error title=Unable to resolve join::Entity type source_entity field source_column has a join to entity bad__worse, but it does not exist.',
    );
  });

  it('still resolves join if no target entity type is found when forceGenerateJoins=true', () => {
    const result = resolveEntityTypeJoins(
      [
        getSourceEntityType([
          {
            targetModule: 'bad',
            targetEntity: 'worse',
            targetField: 'definitely_not_a_column',
          },
        ]),
      ],
      true,
    );

    expect(getResultingJoins(result.entityTypes)).toEqual([
      {
        targetId: 'deadbeef-dead-beef-dead-beefdeadbeef',
        targetField: 'definitely_not_a_column',
        type: 'equality-simple',
      },
    ]);
    expect(result.issues).toContain(
      '::warn title=Unable to resolve join::Entity type source_entity field source_column has a join to entity bad__worse, but it does not exist.',
    );
  });

  it('abandons join if no target field is found', () => {
    const result = resolveEntityTypeJoins(
      [
        targetEntityType,
        getSourceEntityType([
          {
            targetModule: 'target_module',
            targetEntity: 'target_entity',
            targetField: 'definitely_not_a_column',
          },
        ]),
      ],
      false,
    );

    expect(getResultingJoins(result.entityTypes)).toBeEmpty();
    expect(result.issues).toContain(
      '::error title=Unable to resolve join::Entity type source_entity field source_column has a join to field definitely_not_a_column in entity target_module__target_entity, but no such field exists.',
    );
  });
});
