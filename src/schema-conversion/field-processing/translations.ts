import { EntityTypeField, DataTypeValue } from '@/types';
import { sentenceCase } from 'change-case';

export function inferTranslationsFromColumn(
  column: EntityTypeField | undefined,
  parentName: string,
): Record<string, string> {
  if (!column) {
    return {};
  }

  const translations: Record<string, string> = {};

  const stack = [{ key: `entityType.${parentName}.${column.name}`, name: column.name, dt: column.dataType }];
  while (stack.length) {
    const { key, name, dt } = stack.pop()!;

    translations[key] = sentenceCase(name);
    if (dt.dataType === DataTypeValue.rangedUUIDType) {
      translations[key] = translations[key].replace(/\bid\b/i, 'UUID');
    }

    if (dt.dataType === DataTypeValue.objectType) {
      dt.properties?.forEach((prop) => {
        stack.push({ key: `${key}.${prop.name}`, name: prop.name, dt: prop.dataType });
        stack.push({ key: `${key}.${prop.name}._qualified`, name: `${name} ${prop.name}`, dt: prop.dataType });
      });
    } else if (dt.dataType === DataTypeValue.arrayType) {
      stack.push({ key, name, dt: dt.itemDataType! });
    }
  }

  return translations;
}
