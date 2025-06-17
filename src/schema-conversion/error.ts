import { EntityTypeGenerationConfig } from '@/types';

export type Error =
  | {
      type: 'translations';
      missingTranslations: Record<string, string>;
    }
  | {
      type: 'translations-extra';
      extraTranslations: string[];
    }
  | {
      type: 'join';
      fieldName: string;
      targetModule: string;
      targetEntity: string;
      targetField: string;
      missing: 'field' | 'entity';
    }
  | {
      type: 'schema';
      message: string;
    }
  | {
      type: 'config-does-not-exist';
      file: string;
    }
  | {
      type: 'config-schema';
      file: string;
      error: string;
    }
  | {
      type: 'unknown-team';
      teamName: string;
    };

export type ErrorSerialized = {
  severity: 'error' | 'warning';
  metadata: EntityTypeGenerationConfig['metadata'] | null;
  entityTypeName?: string;
} & Error;

export function getTitle(error: Error): string {
  switch (error.type) {
    case 'translations':
      return 'Missing translations';
    case 'translations-extra':
      return 'Extra translations found';
    case 'join':
      return `Join issue`;
    case 'schema':
      return 'Schema issue';
    case 'config-does-not-exist':
      return `Configuration file does not exist`;
    case 'config-schema':
      return `Configuration schema error`;
    case 'unknown-team':
      return `Unknown team`;
  }
}

export function getDescription(error: Error, entityTypeName?: string): string {
  switch (error.type) {
    case 'translations':
      return `The following translations are missing from the module's \`en.json\`: \`${Object.keys(error.missingTranslations).join('`, `')}\`. See the rich output for a pasteable snippet to get started.`;
    case 'translations-extra':
      return `The following translations are unused in the module's en.json and no longer referenced by your entity types: \`${error.extraTranslations.join('`, `')}\`. These should be removed from the module's \`en.json\`.`;
    case 'join':
      return `The field \`${error.fieldName}\` in entity type \`${entityTypeName!}\` is trying to join to \`${error.targetModule}\` (\`${error.targetEntity}\`) but the ${error.missing} does not exist.`;
    case 'schema':
      return error.message;
    case 'config-does-not-exist':
      return `The configuration file \`${error.file}\` does not exist.`;
    case 'config-schema':
      return `Configuration schema error in \`${error.file}\`: ${error.error}`;
    case 'unknown-team':
      return `The team \`${error.teamName}\` is not known in \`team-info.yaml\`. Please add it to ensure reviews and notifications are delivered correctly.`;
  }
}

export function warn(
  metadata: EntityTypeGenerationConfig['metadata'] | undefined,
  entityTypeName: string | undefined,
  error: Error,
) {
  let title = getTitle(error);
  if (metadata) {
    title = `[${metadata.domain}->${metadata.module} (team ${metadata.team})] ${title}`;
  }

  console.warn(`::error title=${title}::⚠️ ${getDescription(error, entityTypeName)}`);
  console.log(JSON.stringify({ severity: 'warning', metadata, entityTypeName, ...error } as ErrorSerialized)); // for consumption downstream
}

export function error(
  metadata: EntityTypeGenerationConfig['metadata'] | undefined,
  entityTypeName: string | undefined,
  error: Error,
) {
  let title = getTitle(error);
  if (metadata) {
    title = `[${metadata.domain}->${metadata.module} (team ${metadata.team})] ${title}`;
  }

  console.error(`::error title=${title}::❌ ${getDescription(error, entityTypeName)}`);
  console.log(JSON.stringify({ severity: 'error', metadata, entityTypeName, ...error } as ErrorSerialized)); // for consumption downstream
}
