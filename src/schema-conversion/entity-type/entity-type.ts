import { DataTypeValue, EntityType, EntityTypeField, EntityTypeGenerationConfig, EntityTypeSource } from '@/types';
import { JSONSchema7 } from 'json-schema';
import { v5 } from 'uuid';
import {
  getJsonbField,
  inferFieldFromSchema,
  markNestedArrayOfObjectsNonQueryable,
  unpackObjectColumns,
} from '../field-processing/field';
import { snakeCase } from 'change-case';

export const NAMESPACE_UUID = 'dac5ff9d-28e2-4ce8-b498-958f5d2ad3da';

export default function createEntityTypeFromConfig(
  entityType: EntityTypeGenerationConfig['entityTypes'][0],
  schema: JSONSchema7,
  config: EntityTypeGenerationConfig,
): { entityType: EntityType; issues: string[] } {
  if (schema.type !== 'object' || !schema.properties) {
    throw new Error(`Schema ${entityType.schema} must be an object with properties!`);
  }

  const issues: string[] = [];

  const baseColumns = Object.entries(schema.properties)
    .map(([name, prop]) => {
      const result = inferFieldFromSchema(name, prop as JSONSchema7, entityType, config);
      issues.push(...result.issues);
      return result.field;
    })
    .filter((f): f is NonNullable<EntityTypeField> => !!f);

  return {
    entityType: {
      // ensures the same entity type gets to keep the same UUID across runs
      id: v5(`${config.metadata.module}/${entityType.name}`, NAMESPACE_UUID),
      name: `${snakeCase(config.metadata.module)}__${entityType.name}`,
      private: entityType.private ?? false,
      sources: [getSourceDefinition(entityType.source, config.sources)],
      requiredPermissions: entityType.permissions,
      defaultSort: [getSort(entityType.sort)],
      columns: markNestedArrayOfObjectsNonQueryable(
        unpackObjectColumns([...baseColumns, ...getJsonbField(entityType)]),
      ),
    },
    issues,
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

export function resolveEntityTypeJoins(
  entityTypes: {
    entityType: EntityType;
    domain: string;
    module: string;
  }[],
  forceGenerateJoins: boolean,
) {
  const entityTypeMap = new Map<string, EntityType>();

  for (const { entityType } of entityTypes) {
    entityTypeMap.set(entityType.name, entityType);
  }

  for (const { entityType } of entityTypes) {
    for (const field of entityType.columns!) {
      for (const { targetModule, targetEntity, targetField, ...join } of field.joinsToIntermediate ?? []) {
        let targetEntityType: Pick<EntityType, 'id' | 'columns'> | undefined = entityTypeMap.get(
          `${snakeCase(targetModule)}__${targetEntity}`,
        );

        if (!targetEntityType && !forceGenerateJoins) {
          console.error(
            `::error title=Unable to resolve join::Entity type ${entityType.name} field ${field} has a join to entity ${targetModule}__${targetEntity}, but it does not exist.`,
          );
          continue;
        } else if (!targetEntityType) {
          targetEntityType = {
            id: 'deadbeef-dead-beef-dead-beefdeadbeef',
          };
          console.warn(
            `::warn title=Unable to resolve join::Entity type ${entityType.name} field ${field} has a join to entity ${targetModule}__${targetEntity}, but it does not exist.`,
          );
        } else {
          const resolvedField = targetEntityType.columns?.find((f) => f.name === targetField);
          if (!resolvedField) {
            console.error(
              `::error title=Unable to resolve join::Entity type ${entityType.name} field ${field} has a join to field ${targetField} in entity ${targetModule}__${targetEntity}, but no such field exists.`,
            );
            continue;
          }
        }

        const joinType =
          (join.type ?? field.dataType.dataType === DataTypeValue.rangedUUIDType)
            ? 'equality-cast-uuid'
            : 'equality-simple';

        field.joinsTo = field.joinsTo ?? [];
        field.joinsTo.push({
          targetId: targetEntityType.id,
          targetField: targetField,
          ...join,
          type: joinType,
        });
      }
      delete field.joinsToIntermediate;
    }
  }

  return entityTypes;
}
