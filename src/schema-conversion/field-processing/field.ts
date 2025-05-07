import { DataType, DataTypeValue, EntityTypeField, EntityTypeGenerationConfig } from '@/types';
import { snakeCase } from 'change-case';
import debug from 'debug';
import { JSONSchema7 } from 'json-schema';
import { getDataType } from './data-type';
import { getGetters } from './getters';
import { getValues } from './values';
import { getIsIdColumn, getExtraProperties } from './extra-properties';
import { validateField } from './validation';

const log = {
  debug: debug('fqm-tools:field-processing:field:debug'),
  warn: debug('fqm-tools:field-processing:field:warn'),
};

export function inferFieldFromSchema(
  prop: string,
  propSchema: JSONSchema7,
  entityType: EntityTypeGenerationConfig['entityTypes'][number],
  config: EntityTypeGenerationConfig,
): { issues: string[]; field?: EntityTypeField } {
  log.debug('Examining', prop, propSchema);

  if ('x-fqm-ignore' in propSchema) {
    if (propSchema['x-fqm-ignore']) {
      return {
        issues: [],
      };
    }
  } else if ('folio:isVirtual' in propSchema && propSchema['folio:isVirtual']) {
    return {
      issues: [
        'It looks like this is a virtual property (folio:isVirtual=true); ignoring? Set `x-fqm-ignore`' +
          ' to true to specify if this field should be included or not and silence this warning.',
      ],
    };
  }

  const issues: string[] = [];

  const name = snakeCase(prop);

  issues.push(...validateField(prop, propSchema));

  const [dataType, dtIssues] = getDataType(propSchema, `->'${prop}'`, entityType, config);
  issues.push(...dtIssues.map((i) => `${prop}: ${i}`));

  const { extraProperties, issues: extraIssues } = getExtraProperties(propSchema);
  issues.push(...extraIssues.map((i) => `${prop}: ${i}`));

  return {
    issues,
    field: {
      name,
      dataType,
      queryable: DataTypeValue.objectType !== dataType.dataType,
      visibleByDefault: false,
      ...getIsIdColumn(name, propSchema),
      ...getGetters(prop, propSchema, dataType, entityType, config),
      ...getValues(dataType, propSchema),
      ...extraProperties,
    },
  };
}

export function unpackObjectColumns(columns: EntityTypeField[]): EntityTypeField[] {
  let anyChanges = false;

  const unpackedColumns = columns.flatMap((column) => {
    if (column.dataType.dataType !== DataTypeValue.objectType || !column.dataType.properties) {
      return column;
    }

    anyChanges = true;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return column.dataType.properties.map(({ property, ...prop }) => ({
      ...prop,
      name: `${column.name}_${snakeCase(prop.name)}`,
    }));
  });

  if (anyChanges) {
    return unpackObjectColumns(unpackedColumns);
  } else {
    return columns;
  }
}

function recursiveFieldApplier(
  dataType: DataType,
  path: ('array' | 'object')[],
  func: (field: EntityTypeField, path: ('array' | 'object')[]) => EntityTypeField,
): DataType {
  const result = { ...dataType };

  if ('properties' in dataType && dataType.properties) {
    result.properties = dataType.properties
      .map((field) => func(field, [...path, 'object']))
      .map(({ dataType, ...f }) => ({ ...f, dataType: recursiveFieldApplier(dataType, [...path, 'object'], func) }));
  }
  if ('itemDataType' in dataType && dataType.itemDataType) {
    result.itemDataType = recursiveFieldApplier(dataType.itemDataType, [...path, 'array'], func);
  }

  return result;
}

export function markNestedArrayOfObjectsNonQueryable(columns: EntityTypeField[]): EntityTypeField[] {
  // temporarily mark all nested array of objects as non-queryable; see MODFQMMGR-740
  return columns.map((column) => ({
    ...column,
    dataType: recursiveFieldApplier(column.dataType, [], (field, path) => {
      // this will always be array->object as object->array gets flattened in unpackObjectColumns
      if (path.includes('array') && path.includes('object')) {
        return {
          ...field,
          queryable: false,
        };
      } else {
        return field;
      }
    }),
  }));
}

export function getJsonbField(entityType: EntityTypeGenerationConfig['entityTypes'][number]) {
  if (entityType.includeJsonbField === false) {
    return [];
  }

  return [
    {
      name: 'jsonb',
      dataType: { dataType: DataTypeValue.stringType },
      queryable: false,
      visibleByDefault: false,
      valueGetter: `:${entityType.source}.jsonb::text`,
    },
  ];
}
