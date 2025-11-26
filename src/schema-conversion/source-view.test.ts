import { EntityTypeGenerationConfig, EntityTypeGenerationConfigSource } from '@/types';
import { describe, expect, it } from 'bun:test';
import createSourceViewDefinition, { disambiguateSource } from './source-view';

describe('createSourceViewDefinition', () => {
  it('generates a valid source view definition for a table', () => {
    const source: EntityTypeGenerationConfigSource = {
      name: 'test_view',
      table: 'test_table',
    };

    const config = {
      metadata: {
        module: 'mod-test',
        team: 'test-team',
        domain: 'erm',
      },
    } as EntityTypeGenerationConfig;

    const result = createSourceViewDefinition(source, config);

    expect(result).toEqual({
      name: 'test_view',
      dependsOn: [['$\{tenant_id}_mod_test', 'test_table']],
      sql: 'SELECT * FROM $\{tenant_id}_mod_test.test_table',
    });
  });

  it('generates a valid source view definition for custom sql', () => {
    const source: EntityTypeGenerationConfigSource = {
      name: 'test_view',
      sql: 'select 1=1',
      deps: ['foo', 'bar'],
    };

    const config = {
      metadata: {
        module: 'mod-test',
        team: 'test-team',
        domain: 'erm',
      },
    } as EntityTypeGenerationConfig;

    const result = createSourceViewDefinition(source, config);

    expect(result).toEqual({
      name: 'test_view',
      sql: 'select 1=1',
      dependsOn: [
        ['${tenant_id}_mod_test', 'foo'],
        ['${tenant_id}_mod_test', 'bar'],
      ],
    });
  });
});

describe('disambiguateSource', () => {
  it('disambiguates source name with metadata/table name', () => {
    const source: EntityTypeGenerationConfigSource = {
      name: 'test_view',
      table: 'test_table',
    };

    const config = {
      metadata: {
        module: 'mod-test-storage',
        team: 'test-team',
        domain: 'erm',
      },
    } as EntityTypeGenerationConfig;

    const result = disambiguateSource(source, config);

    expect(result).toEqual({
      name: 'src__erm__test_storage__test_table',
      table: 'test_table',
    });
  });

  it('disambiguates source name with source name', () => {
    const source: EntityTypeGenerationConfigSource = {
      name: 'cool_view',
      sql: 'select 1=1',
      deps: [],
    };

    const config = {
      metadata: {
        module: 'mod-test-storage',
        team: 'test-team',
        domain: 'erm',
      },
    } as EntityTypeGenerationConfig;

    const result = disambiguateSource(source, config);

    expect(result).toEqual({
      name: 'src__erm__test_storage__cool_view',
      sql: 'select 1=1',
      deps: [],
    });
  });
});
