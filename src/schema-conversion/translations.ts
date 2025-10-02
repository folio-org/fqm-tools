import { EntityTypeField, DataTypeValue, EntityType, EntityTypeGenerationConfig } from '@/types';
import { sentenceCase } from 'change-case';
import { disambiguateName } from './entity-type/entity-type';
import { warn } from './error';

export const EXPECTED_LOCALES = [
  'ar',
  'ber',
  'ca',
  'cs_CZ',
  'da',
  'de',
  'en_GB',
  'en_SE',
  'en_US',
  'en',
  'es_419',
  'es_ES',
  'es',
  'fr_FR',
  'fr',
  'he',
  'hi_IN',
  'hu',
  'it_IT',
  'ja',
  'ko',
  'nb',
  'nl',
  'nn',
  'pl',
  'pt_BR',
  'pt_PT',
  'ru',
  'sk',
  'sv',
  'uk',
  'ur',
  'zh_CN',
  'zh_TW',
  'zu',
];

// we have a specific translation scheme for this very common fields
const METADATA_KEYS = {
  metadata_created_date: 'Created at',
  metadata_created_by_user_id: 'Created by user UUID',
  metadata_created_by_username: 'Created by username',
  metadata_updated_date: 'Updated at',
  metadata_updated_by_user_id: 'Updated by user UUID',
  metadata_updated_by_username: 'Updated by username',
};

export function inferTranslationsFromEntityType(entityType: EntityType): Record<string, string> {
  const translations: Record<string, string> = {};

  translations[`entityType.${entityType.name}`] = sentenceCase(entityType.name.split('__').pop()!);

  entityType.columns?.forEach((column) => {
    const columnTranslations = inferTranslationsFromField(column, entityType.name);
    Object.entries(columnTranslations).forEach(([key, value]) => {
      translations[key] = value;
    });
  });

  return translations;
}

export function inferTranslationsFromField(
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
    } else {
      translations[key] = translations[key].replace(/\bid\b/i, 'ID');
      translations[key] = translations[key].replace(/\bids\b/i, 'IDs');
    }
    if (name === 'jsonb') {
      translations[key] = 'JSONB';
    }
    if (name in METADATA_KEYS) {
      translations[key] = METADATA_KEYS[name as keyof typeof METADATA_KEYS];
    }

    if (dt.itemDataType?.properties) {
      dt.itemDataType.properties.forEach((prop) => {
        stack.push({ key: `${key}.${prop.name}._qualified`, name: `${name} ${prop.name}`, dt: prop.dataType });
        stack.push({ key: `${key}.${prop.name}`, name: prop.name, dt: prop.dataType });
      });
    } else if (dt.dataType === DataTypeValue.arrayType) {
      stack.push({ key, name, dt: dt.itemDataType! });
    }
  }

  return translations;
}

/** Takes external module translations of the form `fqm.entityType.etc` and turns them into our expected just `entityType.` and removes extra */
export function marshallExternalTranslations(
  translations: Record<string, string>,
  metadata: EntityTypeGenerationConfig['metadata'],
  expectedTranslationKeys: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  const extraTranslations: string[] = [];

  for (const [key, value] of Object.entries(translations)) {
    if (key.startsWith('fqm.')) {
      const entityTypeName = key.split('.')[2];
      const newEntityType = disambiguateName(metadata.module, entityTypeName);
      const newKey = key.replace(`fqm.entityType.${entityTypeName}`, `entityType.${newEntityType}`);

      if (expectedTranslationKeys.includes(newKey)) {
        result[newKey] = value;
      } else {
        extraTranslations.push(key);
      }
    }
  }

  if (extraTranslations.length > 0) {
    warn(metadata, undefined, {
      type: 'translations-extra',
      extraTranslations,
    });
  }

  return result;
}

export function unmarshallTranslationKey(key: string) {
  const split = key.split('.');
  split[1] = split[1].replace(/^.+__/, ''); // remove module name from prefix
  return 'fqm.' + split.join('.');
}
