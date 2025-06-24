import { DataTypeValue, EntityType, EntityTypeField, EntityTypeFieldJoin, EntityTypeGenerationConfig } from '@/types';
import { snakeCase } from 'change-case';
import { error, warn } from '../error';

export function resolveEntityTypeJoins(
  // bundled type only really used to make calling more convenient
  entityTypes: {
    entityType: EntityType;
    metadata: EntityTypeGenerationConfig['metadata'];
  }[],
  forceGenerateJoins: boolean,
) {
  const entityTypeMap = new Map<string, EntityType>();

  for (const { entityType } of entityTypes) {
    entityTypeMap.set(entityType.name, entityType);
  }

  for (const { entityType, metadata } of entityTypes) {
    for (const field of entityType.columns!) {
      field.joinsTo = resolveFieldJoins(entityTypeMap, metadata, entityType.name, field, forceGenerateJoins);

      delete field.joinsToIntermediate;
    }
  }

  return entityTypes;
}

function resolveFieldJoins(
  entityTypeMap: Map<string, EntityType>,
  metadata: EntityTypeGenerationConfig['metadata'],
  entityTypeName: string,
  field: EntityTypeField,
  forceGenerateJoins: boolean,
): EntityTypeField['joinsTo'] {
  const resolved = (field.joinsToIntermediate ?? [])
    .map(({ targetModule, targetEntity, targetField, ...join }): EntityTypeFieldJoin | null => {
      const targetEntityType = resolveFieldJoinTarget(
        entityTypeMap,
        targetModule,
        targetEntity,
        targetField,
        forceGenerateJoins,
        metadata,
        entityTypeName,
        field.name,
      );

      if (!targetEntityType) {
        return null;
      }

      field.joinsTo = field.joinsTo ?? [];
      // should be prettier, but TS gets mad when trying to coerce between joins with and without additional properties
      if (join.type) {
        return {
          targetId: targetEntityType.id,
          targetField: targetField,
          ...join,
        };
      } else {
        return {
          targetId: targetEntityType.id,
          targetField: targetField,
          ...join,
          type: field.dataType.dataType === DataTypeValue.rangedUUIDType ? 'equality-cast-uuid' : 'equality-simple',
        };
      }
    })
    .filter((j) => j !== null);

  if (resolved.length || field.joinsTo !== undefined) {
    return [...(field.joinsTo ?? []), ...resolved];
  }

  return undefined;
}

function resolveFieldJoinTarget(
  entityTypeMap: Map<string, EntityType>,
  targetModule: string,
  targetEntity: string,
  targetField: string,
  forceGenerateJoins: boolean,
  metadata: EntityTypeGenerationConfig['metadata'],
  entityTypeName: string,
  fieldName: string,
) {
  let targetEntityType: Pick<EntityType, 'id' | 'columns'> | undefined = entityTypeMap.get(
    `${snakeCase(targetModule)}__${targetEntity}`,
  );

  if (!targetEntityType && !forceGenerateJoins) {
    error(metadata, entityTypeName, {
      type: 'join',
      fieldName,
      targetModule,
      targetEntity,
      targetField,
      missing: 'entity',
    });
    return undefined;
  } else if (!targetEntityType) {
    targetEntityType = {
      id: 'deadbeef-dead-beef-dead-beefdeadbeef',
    };
    warn(metadata, entityTypeName, {
      type: 'join',
      fieldName,
      targetModule,
      targetEntity,
      targetField,
      missing: 'entity',
    });
  } else {
    const resolvedField = targetEntityType.columns?.find((f) => f.name === targetField);
    if (!resolvedField) {
      error(metadata, entityTypeName, {
        type: 'join',
        fieldName,
        targetModule,
        targetEntity,
        targetField,
        missing: 'field',
      });
      return undefined;
    }
  }

  return targetEntityType;
}
