import { DataTypeValue, EntityType, EntityTypeField, EntityTypeFieldJoin } from '@/types';
import { snakeCase } from 'change-case';

export function resolveEntityTypeJoins(
  // bundled type only really used to make calling more convenient
  entityTypes: {
    entityType: EntityType;
    domain: string;
    module: string;
  }[],
  forceGenerateJoins: boolean,
) {
  const entityTypeMap = new Map<string, EntityType>();
  const issues: string[] = [];

  for (const { entityType } of entityTypes) {
    entityTypeMap.set(entityType.name, entityType);
  }

  for (const { entityType } of entityTypes) {
    for (const field of entityType.columns!) {
      const result = resolveFieldJoins(entityTypeMap, entityType.name, field, forceGenerateJoins);
      field.joinsTo = result.joins;
      issues.push(...result.issues);

      delete field.joinsToIntermediate;
    }
  }

  return { entityTypes, issues };
}

function resolveFieldJoins(
  entityTypeMap: Map<string, EntityType>,
  entityTypeName: string,
  field: EntityTypeField,
  forceGenerateJoins: boolean,
): { joins: EntityTypeField['joinsTo']; issues: string[] } {
  const issues: string[] = [];

  return {
    joins: field.joinsToIntermediate
      ?.map(({ targetModule, targetEntity, targetField, ...join }): EntityTypeFieldJoin | null => {
        const { targetEntityType, issues: resolutionIssues } = resolveFieldJoinTarget(
          entityTypeMap,
          targetModule,
          targetEntity,
          targetField,
          forceGenerateJoins,
          entityTypeName,
          field.name,
        );
        issues.push(...resolutionIssues);
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
      .filter((j) => j !== null),
    issues,
  };
}

function resolveFieldJoinTarget(
  entityTypeMap: Map<string, EntityType>,
  targetModule: string,
  targetEntity: string,
  targetField: string,
  forceGenerateJoins: boolean,
  entityTypeName: string,
  fieldName: string,
) {
  const issues: string[] = [];
  let targetEntityType: Pick<EntityType, 'id' | 'columns'> | undefined = entityTypeMap.get(
    `${snakeCase(targetModule)}__${targetEntity}`,
  );

  if (!targetEntityType && !forceGenerateJoins) {
    issues.push(
      `::error title=Unable to resolve join::Entity type ${entityTypeName} field ${fieldName} has a join to entity ${targetModule}__${targetEntity}, but it does not exist.`,
    );
    return { issues };
  } else if (!targetEntityType) {
    targetEntityType = {
      id: 'deadbeef-dead-beef-dead-beefdeadbeef',
    };
    issues.push(
      `::warn title=Unable to resolve join::Entity type ${entityTypeName} field ${fieldName} has a join to entity ${targetModule}__${targetEntity}, but it does not exist.`,
    );
  } else {
    const resolvedField = targetEntityType.columns?.find((f) => f.name === targetField);
    if (!resolvedField) {
      issues.push(
        `::error title=Unable to resolve join::Entity type ${entityTypeName} field ${fieldName} has a join to field ${targetField} in entity ${targetModule}__${targetEntity}, but no such field exists.`,
      );
      return { issues };
    }
  }

  return {
    targetEntityType,
    issues,
  };
}
