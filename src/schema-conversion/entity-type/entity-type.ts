import { EntityType, EntityTypeField, EntityTypeGenerationConfig, EntityTypeSource } from '@/types';
import { JSONSchema7 } from 'json-schema';
import { v5 } from 'uuid';
import {
  getJsonbField,
  inferFieldFromSchema,
  markNestedArrayOfObjectsNonQueryable,
  unpackObjectColumns,
} from '../field-processing/field';

export const NAMESPACE_UUID = 'dac5ff9d-28e2-4ce8-b498-958f5d2ad3da';

export default function createEntityTypeFromConfig(
  entityType: EntityTypeGenerationConfig['entityTypes'][0],
  schema: JSONSchema7,
  config: EntityTypeGenerationConfig,
): EntityType {
  if (schema.type !== 'object' || !schema.properties) {
    throw new Error(`Schema ${entityType.schema} must be an object with properties!`);
  }

  return {
    // ensures the same entity type gets to keep the same UUID across runs
    id: v5(`${config.metadata.module}/${entityType.name}`, NAMESPACE_UUID),
    name: entityType.name,
    private: entityType.private ?? false,
    sources: [getSourceDefinition(entityType.source, config.sources)],
    requiredPermissions: entityType.permissions,
    defaultSort: [getSort(entityType.sort)],
    columns: markNestedArrayOfObjectsNonQueryable(
      unpackObjectColumns([
        ...Object.entries(schema.properties)
          .map(([name, prop]) => inferFieldFromSchema(name, prop as JSONSchema7, entityType, config).field)
          .filter((f): f is NonNullable<EntityTypeField> => !!f),
        ...getJsonbField(entityType),
      ]),
    ),
  };
}

function getSourceDefinition(key: string, sources: EntityTypeGenerationConfig['sources']): EntityTypeSource {
  const source = sources.find((s) => s.name === key);

  if (!source) {
    throw new Error(`Source ${key} not found in source list`);
  }

  return {
    type: 'db',
    alias: source.name,
    target: source.view,
  };
}

function getSort(sort: [string, string]): NonNullable<EntityType['defaultSort']>[0] {
  return {
    columnName: sort[0],
    direction: sort[1],
  };
}
