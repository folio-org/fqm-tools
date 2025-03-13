import { DataTypeValue, EntityTypeField } from '@/types';
import { snakeCase } from 'change-case';
import debug from 'debug';
import { JSONSchema7 } from 'json-schema';
import { getDataType } from './data-type';
import { getGetters } from './getters';
import { getValues } from './values';

const log = {
  debug: debug('fqm-tools:field-processing:field:debug'),
  warn: debug('fqm-tools:field-processing:field:warn'),
};

export function inferFieldFromSchema(
  source: string,
  prop: string,
  propSchema: JSONSchema7,
): { issues: string[]; column?: EntityTypeField } {
  log.debug('Examining ', prop, propSchema);

  if ('folio:isVirtual' in propSchema && propSchema['folio:isVirtual']) {
    return {
      issues: ['It looks like this is a virtual property (folio:isVirtual=true); ignoring?'],
    };
  }

  const issues: string[] = [];

  const name = snakeCase(prop);

  const [dataType, dtIssues] = getDataType(source, propSchema, `->'${prop}'`);
  issues.push(...dtIssues);

  return {
    issues,
    column: {
      name,
      dataType,
      sourceAlias: source,
      queryable: ![DataTypeValue.arrayType, DataTypeValue.objectType].includes(dataType.dataType),
      visibleByDefault: false,
      isIdColumn: name === 'id',
      values: getValues(dataType, propSchema),
      ...getGetters(source, prop, dataType),
    },
  };
}
