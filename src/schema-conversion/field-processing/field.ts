import { DataTypeValue, EntityTypeField, EntityTypeGenerationConfig } from '@/types';
import { snakeCase } from 'change-case';
import debug from 'debug';
import { JSONSchema7 } from 'json-schema';
import { getDataType } from './data-type';
import { getGetters } from './getters';
import { getValues } from './values';
import { getIsIdColumn, getExtraProperties } from './extra-properties';

const log = {
  debug: debug('fqm-tools:field-processing:field:debug'),
  warn: debug('fqm-tools:field-processing:field:warn'),
};

export function inferFieldFromSchema(
  prop: string,
  propSchema: JSONSchema7,
  entityType: EntityTypeGenerationConfig['entityTypes'][0],
  config: EntityTypeGenerationConfig,
): { issues: string[]; field?: EntityTypeField } {
  log.debug('Examining ', prop, propSchema);

  if ('folio:isVirtual' in propSchema && propSchema['folio:isVirtual']) {
    return {
      issues: ['It looks like this is a virtual property (folio:isVirtual=true); ignoring?'],
    };
  }

  const issues: string[] = [];

  const name = snakeCase(prop);

  const [dataType, dtIssues] = getDataType(propSchema, `->'${prop}'`, entityType, config);
  issues.push(...dtIssues);

  return {
    issues,
    field: {
      name,
      dataType,
      queryable: ![DataTypeValue.arrayType, DataTypeValue.objectType].includes(dataType.dataType),
      visibleByDefault: false,
      ...getIsIdColumn(name, propSchema),
      ...getGetters(prop, propSchema, dataType, entityType, config),
      ...getValues(dataType, propSchema),
      ...getExtraProperties(propSchema),
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

export function getJsonbField(entityType: EntityTypeGenerationConfig['entityTypes'][0]) {
  if (entityType.includeJsonbField === false) {
    return [];
  }

  return [
    {
      dataType: { dataType: DataTypeValue.stringType },
      name: 'jsonb',
      queryable: false,
      visibleByDefault: false,
      valueGetter: `:${entityType.source}.jsonb::text`,
    },
  ];
}
