import { DataType, DataTypeValue } from '@/types';
import { sentenceCase } from 'change-case';
import { JSONSchema7 } from 'json-schema';

export function getValues(dataType: DataType, schema: JSONSchema7) {
  if ('enum' in schema) {
    // todo: allow overriding these labels (although they should be handled in translations... see MODFQMMGR-756)
    return { values: (schema.enum as string[]).map((v) => ({ value: v, label: sentenceCase(v) })) };
  }

  if (dataType.dataType === DataTypeValue.booleanType) {
    return {
      values: [
        { value: 'true', label: 'True' },
        { value: 'false', label: 'False' },
      ],
    };
  }

  return {};
}
