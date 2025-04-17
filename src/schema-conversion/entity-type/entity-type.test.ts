import { EntityTypeGenerationConfig } from '@/types';
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
        domain: 'everything',
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

    expect(result).toEqual(expected);
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
});
