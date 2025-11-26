import { EntityTypeGenerationConfig, EntityTypeGenerationConfigSource } from '@/types';
import debug from 'debug';

const log = {
  debug: debug('fqm-tools:source-views:debug'),
  warn: debug('fqm-tools:source-views:warn'),
};

export default function createSourceViewDefinition(
  source: EntityTypeGenerationConfigSource,
  config: EntityTypeGenerationConfig,
) {
  const schemaName = `$\{tenant_id}_${config.metadata.module}`.replaceAll('-', '_');

  const dependsOn = [];
  let sql = '';

  if ('table' in source) {
    sql = `SELECT * FROM ${schemaName}.${source.table}`;
    dependsOn.push([schemaName, source.table]);
  } else {
    sql = source.sql;
    dependsOn.push(...source.deps.map((t) => [schemaName, t]));
  }

  return {
    name: source.name,
    dependsOn,
    sql,
  };
}

export function disambiguateSource(source: EntityTypeGenerationConfigSource, config: EntityTypeGenerationConfig) {
  const table = 'table' in source ? source.table : source.name;
  const { module, domain } = config.metadata;

  const shortenedModuleName = module.replace('mod-', '');
  const disambiguatedName = `src__${domain}__${shortenedModuleName}__${table}`.replaceAll('-', '_');

  log.debug('mapped module %o source %o to %o', config.metadata.module, source.name, disambiguatedName);

  return {
    ...source,
    name: disambiguatedName,
  };
}
