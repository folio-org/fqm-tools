import { DataType, DataTypeValue } from '@/types';
import { sentenceCase } from 'change-case';
import { Schema } from 'genson-js/dist';

export function getValues(dataType: DataType, schema: Schema) {
  if ('enum' in schema) {
    return (schema.enum as string[]).map((v) => ({ value: v, label: sentenceCase(v) }));
  }

  if (dataType.dataType === DataTypeValue.booleanType) {
    return [
      { value: 'true', label: 'True' },
      { value: 'false', label: 'False' },
    ];
  }

  return undefined;
}
