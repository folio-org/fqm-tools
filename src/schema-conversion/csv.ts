import { DataType, DataTypeValue, EntityType, EntityTypeField } from '@/types';
import { markdownTable } from 'markdown-table';
import { parse, unparse } from 'papaparse';

export interface ResultRow {
  baseEntity: string;
  simpleEntity: string;
  id: string;
  label: string;
  table: string;
  dataType: string;
  values: string;
  operators: string;
  queryable: boolean;
  visibleByDefault: boolean;
  apiOnly: boolean;
  essential: boolean;
  joinsTo: string[];
}

export interface ResultRowPretty {
  'Entity ID': string;
  'Base entity': string;
  'Simple entity': string;
  Name: string;
  Label: string;
  'Table (nested)': string;
  Datatype: string;
  Values: string;
  Operators: string;
  Queryable: string;
  'Showable in results': string;
  'API Only': string;
  Essential: string;
  'Joins to': string;
}

async function resolveJoins(
  field: EntityTypeField,
  fetcher: (entityTypeId: string) => Promise<EntityType>,
): Promise<string[]> {
  return Promise.all(
    field.joinsTo?.map(async (join) => {
      const target = await fetcher(join.targetId);

      return `${target.name}.${join.targetField}`;
    }) ?? [],
  );
}

export default async function entityTypeToCsv(
  entityType: EntityType,
  fetchEntityType: (entityTypeId: string) => Promise<EntityType>,
): Promise<string> {
  const data: ResultRow[] = [];

  for (const column of entityType.columns ?? []) {
    const columnNameParts = column.name.split('.');
    data.push({
      baseEntity: entityType.name,
      simpleEntity: columnNameParts.length > 1 ? columnNameParts[0] : '',
      id: column.name,
      label: column.labelAlias!,
      table: '',
      dataType: getDataType(column.dataType),
      values: await getValues(column, fetchEntityType),
      operators: await getOperators(column, fetchEntityType),
      queryable: column.queryable === true,
      visibleByDefault: column.visibleByDefault === true,
      apiOnly: column.hidden === true,
      essential: column.essential === true,
      joinsTo: await resolveJoins(column, fetchEntityType),
    });

    if (getProperties(column.dataType)) {
      const addRecursiveProperties = async (parent: EntityTypeField, property: EntityTypeField) => {
        data.push({
          baseEntity: entityType.name,
          simpleEntity: columnNameParts.length > 1 ? columnNameParts[0] : '',
          id: `${parent.name}[*]->${property.name}`,
          label: property.labelAliasFullyQualified!,
          table: `${parent.labelAlias} > ${property.labelAlias}`,
          dataType: getDataType(property.dataType),
          values: await getValues(property, fetchEntityType),
          operators: await getOperators(property, fetchEntityType),
          queryable: property.queryable === true,
          visibleByDefault: property.visibleByDefault === true,
          apiOnly: property.hidden === true,
          essential: property.essential === true,
          joinsTo: await resolveJoins(property, fetchEntityType),
        });

        await Promise.all(
          getProperties(property.dataType).map((inner) =>
            addRecursiveProperties({ ...property, labelAlias: `${parent.labelAlias} > ${property.labelAlias}` }, inner),
          ),
        );
      };

      await Promise.all(getProperties(column.dataType).map((property) => addRecursiveProperties(column, property)));
    }
  }

  return (
    '\ufeff' +
    unparse(
      data.map((r) => ({
        'Entity ID': entityType.id,
        'Base entity': r.baseEntity,
        'Simple entity': r.simpleEntity,
        Name: r.id,
        Label: r.label,
        'Table (nested)': r.table,
        Datatype: r.dataType,
        Values: r.values,
        Operators: r.operators,
        Queryable: r.queryable,
        'Visible by default': r.visibleByDefault,
        'API only': r.apiOnly,
        Essential: r.essential,
        'Joins to': r.joinsTo.join(', '),
      })),
    )
  );
}

function getProperties(dataType: DataType): EntityTypeField[] {
  if (dataType.properties) {
    return dataType.properties;
  } else if (dataType.itemDataType) {
    return getProperties(dataType.itemDataType);
  } else {
    return [];
  }
}

export function getDataType(dataType: DataType): string {
  switch (dataType.dataType) {
    case DataTypeValue.arrayType:
    case DataTypeValue.jsonbArrayType:
      if (!dataType.itemDataType) {
        return 'unknown[]';
      }
      return getDataType(dataType.itemDataType) + '[]';
    case DataTypeValue.booleanType:
      return 'boolean';
    case DataTypeValue.dateType:
      return 'date';
    case DataTypeValue.dateTimeType:
      return 'datetime';
    case DataTypeValue.enumType:
      return 'enum';
    case DataTypeValue.integerType:
      return 'integer';
    case DataTypeValue.numberType:
      return 'number';
    case DataTypeValue.objectType:
      return 'object';
    case DataTypeValue.openUUIDType:
    case DataTypeValue.rangedUUIDType:
    case DataTypeValue.stringUUIDType:
      return 'uuid';
    case DataTypeValue.stringType:
      return 'string';
    default:
      return dataType.dataType;
  }
}

export async function getValues(
  column: EntityTypeField,
  fetchEntityType: (entityTypeId: string) => Promise<EntityType>,
): Promise<string> {
  if (column.valueSourceApi) {
    return `dropdown from API (${column.valueSourceApi.path})`;
  } else if (column.values) {
    if (column.values.length === 2 && column.values[0].value === 'true' && column.values[1].value === 'false') {
      return 'true/false';
    } else {
      return `dropdown hardcoded (${column.values.map((v) => v.label).join(', ')})`;
    }
  } else if (column.source) {
    return `dropdown from entity (${(await fetchEntityType(column.source.entityTypeId)).name} -> ${column.source.columnName})`;
  }

  return '';
}

export async function getOperators(
  column: EntityTypeField,
  fetchEntityType: (entityTypeId: string) => Promise<EntityType>,
): Promise<string> {
  if (!column.queryable) {
    return 'not queryable';
  }
  if (getDataType(column.dataType).endsWith('[]')) {
    return 'contains all/any, not contains all/any, empty';
  }
  switch (getDataType(column.dataType)) {
    case 'string':
      if ((await getValues(column, fetchEntityType)) === '') {
        return '=, !=, contains, starts, empty';
      } else {
        return '=, !=, in, not in, empty';
      }
    case 'uuid':
    case 'enum':
      return '=, !=, in, not in, empty';
    case 'integer':
    case 'number':
    case 'date':
    case 'object':
      return '=, !=, >, >=, <, <=, empty';
    case 'boolean':
      return '=, !=, empty';
    default:
      return '?';
  }
}

export function csvToMarkdownCompressed(csv: string) {
  const data = parse(csv, {
    delimiter: ',',
    header: false,
  }).data as string[][];

  return markdownTable(
    data.map((r) => r.slice(3)),
    {
      padding: false,
      alignDelimiters: false,
    },
  );
}
