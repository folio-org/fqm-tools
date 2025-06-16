import { DataTypeValue, EntityType, EntityTypeFieldJoinIntermediate } from '@/types';
import { beforeEach, describe, expect, it, Mock, mock, spyOn } from 'bun:test';
import { resolveEntityTypeJoins } from './joins';
import * as ErrorModule from '../error';

spyOn(ErrorModule, 'warn').mockImplementation(mock(() => ({})));
spyOn(ErrorModule, 'error').mockImplementation(mock(() => ({})));

const { warn, error } = ErrorModule;

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
    metadata: {
      domain: 'circulation',
      module: 'mod-foo',
      team: 'team',
    } as const,
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
    metadata: {
      domain: 'circulation',
      module: 'mod-foo',
      team: 'team',
    } as const,
  });
  const getResultingJoins = (entityTypes: { entityType: EntityType }[]) =>
    entityTypes
      .flatMap((et) => et.entityType.columns!)
      .filter((c) => Boolean(c.joinsTo))
      .flatMap((c) => c.joinsTo);

  beforeEach(() => {
    (warn as Mock<typeof warn>).mockReset();
    (error as Mock<typeof error>).mockReset();
  });

  it('does nothing with no joins', () => {
    const input = [getSourceEntityType(), targetEntityType];
    const expected = JSON.parse(JSON.stringify(input));

    const result = resolveEntityTypeJoins(input, false);

    expect(result).toEqual(expected);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
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

    expect(getResultingJoins(result)).toEqual([
      {
        targetField: 'target_column',
        targetId: 'targetId',
        type: 'custom',
        sql: ':this.id = :that.id',
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
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

    expect(getResultingJoins(result)).toEqual([
      {
        targetField: 'target_column',
        targetId: 'targetId',
        type: 'equality-cast-uuid',
        direction: 'left',
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
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

    expect(getResultingJoins(result)).toEqual([
      {
        targetField: 'target_column',
        targetId: 'targetId',
        type: 'equality-simple',
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
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

    expect(getResultingJoins(result)).toBeEmpty();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      {
        domain: 'circulation',
        module: 'mod-foo',
        team: 'team',
      },
      'source_entity',
      {
        type: 'join',
        fieldName: 'source_column',
        targetModule: 'bad',
        targetEntity: 'worse',
        targetField: 'definitely_not_a_column',
        missing: 'entity',
      },
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

    expect(getResultingJoins(result)).toEqual([
      {
        targetId: 'deadbeef-dead-beef-dead-beefdeadbeef',
        targetField: 'definitely_not_a_column',
        type: 'equality-simple',
      },
    ]);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      {
        domain: 'circulation',
        module: 'mod-foo',
        team: 'team',
      },
      'source_entity',
      {
        type: 'join',
        fieldName: 'source_column',
        targetModule: 'bad',
        targetEntity: 'worse',
        targetField: 'definitely_not_a_column',
        missing: 'entity',
      },
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

    expect(getResultingJoins(result)).toBeEmpty();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      {
        domain: 'circulation',
        module: 'mod-foo',
        team: 'team',
      },
      'source_entity',
      {
        type: 'join',
        fieldName: 'source_column',
        targetModule: 'target_module',
        targetEntity: 'target_entity',
        targetField: 'definitely_not_a_column',
        missing: 'field',
      },
    );
  });
});
