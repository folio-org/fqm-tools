import { EntityType, EntityTypeField, EntityTypeGenerationConfig, EntityTypeSource } from '@/types';
import { snakeCase } from 'change-case';
import { JSONSchema7 } from 'json-schema';
import { v5 } from 'uuid';
import {
  ensureNestedObjectsAreProperForm,
  getJsonbField,
  inferFieldFromSchema,
  removeNestedFieldDisallowedProperties,
  unpackObjectColumns,
} from '../field-processing/field';

export const NAMESPACE_UUID = 'dac5ff9d-28e2-4ce8-b498-958f5d2ad3da';

export default function createEntityTypeFromConfig(
  entityType: EntityTypeGenerationConfig['entityTypes'][number],
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

  const completedColumns = applyOverrides(
    ensureNestedObjectsAreProperForm(
      removeNestedFieldDisallowedProperties(unpackObjectColumns([...baseColumns, ...getJsonbField(entityType)])),
    ),
    entityType['fieldOverrides'],
  );

  const [columns, exclusionIssues] = applyExclusions(completedColumns, entityType['fieldExclusions']);
  issues.push(...exclusionIssues);

  return {
    entityType: {
      // ensures the same entity type gets to keep the same UUID across runs
      id: v5(`${config.metadata.module}/${entityType.name}`, NAMESPACE_UUID),
      name: disambiguateName(config.metadata.module, entityType.name),
      private: entityType.private ?? false,
      sources: [getSourceDefinition(entityType.source, config.sources)],
      requiredPermissions: entityType.permissions,
      defaultSort: [getSort(entityType.sort)],
      columns,
    },
    issues,
  };
}

export function disambiguateName(moduleName: string, entityTypeName: string): string {
  return `${snakeCase(moduleName)}__${entityTypeName}`;
}

function getSourceDefinition(key: string, sources: EntityTypeGenerationConfig['sources']): EntityTypeSource {
  const source = sources.find((s) => s.name === key);

  if (!source) {
    throw new Error(`Source ${key} not found in source list`);
  }

  return {
    type: 'db',
    alias: key,
    target: source.name,
  };
}

function getSort(sort: [string, string]): NonNullable<EntityType['defaultSort']>[0] {
  return {
    columnName: sort[0],
    direction: sort[1],
  };
}

function applyOverrides(
  fields: EntityTypeField[],
  overrides?: EntityTypeGenerationConfig['entityTypes'][number]['fieldOverrides'],
): EntityTypeField[] {
  const withOverrides = [...fields, ...(overrides || [])];

  // map will take later values if the key already exists
  return Array.from(new Map(withOverrides.map((field) => [field.name, field])).values());
}

function applyExclusions(fields: EntityTypeField[], exclusions?: string[]): [EntityTypeField[], string[]] {
  const issues: string[] = [];
  const fieldMap = new Map(fields.map((field) => [field.name, field]));

  exclusions?.forEach((exclusion) => {
    if (fieldMap.has(exclusion)) {
      fieldMap.delete(exclusion);
    } else {
      issues.push(`Excluded field ${exclusion} does not exist in the entity type`);
    }
  });

  return [Array.from(fieldMap.values()), issues];
}
