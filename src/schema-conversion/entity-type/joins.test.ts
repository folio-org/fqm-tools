import { DataTypeValue, EntityType, EntityTypeFieldJoinIntermediate } from '@/types';
import { describe, expect, it } from 'bun:test';
import { resolveEntityTypeJoins } from './joins';

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
