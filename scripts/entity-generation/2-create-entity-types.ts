import entityTypeToCsv from '@/src/schema-conversion/csv';
import createEntityTypeFromConfig from '@/src/schema-conversion/entity-type/entity-type';
import { resolveEntityTypeJoins } from '@/src/schema-conversion/entity-type/joins';
import {
  EXPECTED_LOCALES,
  inferTranslationsFromEntityType,
  marshallExternalTranslations,
  unmarshallTranslationKey,
} from '@/src/schema-conversion/translations';
import createLiquibaseChangeset, { disambiguateSource } from '@/src/schema-conversion/liquibase/changeset';
import { EntityType, EntityTypeGenerationConfig, EntityTypeGenerationConfigTemplate } from '@/types';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { TOML } from 'bun';
import { readdir } from 'fs/promises';
import { mkdir } from 'fs/promises';
import json5 from 'json5';
import path from 'path';
import { parseArgs } from 'util';
import YAML from 'yaml';
import memoize from 'lodash.memoize';
import { error, warn } from '@/src/schema-conversion/error';

const args = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
    },
    out: {
      type: 'string',
      short: 'o',
      default: 'out',
    },
    'force-generate-joins': {
      type: 'boolean',
      default: false,
    },
  },
  strict: true,
  allowPositionals: true,
});

if (args.positionals.length === 0) {
  console.error('Error: No base directories provided.');
  args.values.help = true; // prints help and exits
}

if (args.values.help) {
  console.log('Usage: bun 2-create-entity-types.ts [options] <baseDir1> <baseDir2> ... <baseDirN>');
  console.log('Options:');
  console.log('  -h, --help              Show this help message');
  console.log('  -o, --out               Output directory (default: out)');
  console.log('  --force-generate-joins  [dev only] Force generation of joins even if no matching target is found.');
  console.log('                          Will fill dummy data in for target ET/fields, to enable result verification.');
  process.exit(1);
}

async function write(category: string, domain: string, module: string, filename: string, data: string) {
  const fullPath = path.resolve(args.values.out, category, domain, module, filename);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await Bun.write(Bun.file(fullPath), data);
  await Bun.write(Bun.stderr, `Wrote ${fullPath}\n`);
}

const configs: { dir: string; config: EntityTypeGenerationConfig }[] = [];

for (const dir of args.positionals) {
  const file = Bun.file(path.resolve(dir, 'fqm-config.toml'));
  if (!(await file.exists())) {
    error(undefined, undefined, { type: 'config-does-not-exist', file: file.name! });
    continue;
  }

  const raw = TOML.parse(await file.text());

  try {
    const config = EntityTypeGenerationConfigTemplate.parse(raw);
    configs.push({ dir, config });
  } catch (e) {
    error(undefined, undefined, {
      type: 'config-schema',
      file: file.name!,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

if (configs.length === 0) {
  console.error('No valid configs found. Exiting.');
  process.exit(2);
}

for (const { config } of configs) {
  config.sourceMap = { ...config.sourceMap };
  config.sources = await Promise.all(
    config.sources.map(async (source) => {
      const disambiguated = disambiguateSource(source, config);

      config.sourceMap![source.name] = disambiguated.name;

      const changeset = createLiquibaseChangeset(disambiguated, config);

      await write(
        'liquibase',
        config.metadata.domain,
        config.metadata.module,
        `${disambiguated.name}.yaml`,
        YAML.stringify(changeset),
      );

      return disambiguated;
    }),
  );
}

const intermediateResults: {
  entityType: EntityType;
  metadata: EntityTypeGenerationConfig['metadata'];
}[] = [];

for (const { dir, config } of configs) {
  await Bun.write(
    Bun.stderr,
    `Processing ${config.metadata.domain}->${config.metadata.module} (team ${config.metadata.team}) from ${dir}\n`,
  );
  for (const entityType of config.entityTypes) {
    await Bun.write(Bun.stderr, `- Processing ${entityType.name}\n`);

    try {
      const result = createEntityTypeFromConfig(
        entityType,
        await $RefParser.dereference(path.resolve(dir, entityType.schema)),
        config,
      );

      result.issues.forEach((message) => warn(config.metadata, entityType.name, { type: 'schema', message }));

      intermediateResults.push({
        entityType: result.entityType,
        metadata: config.metadata,
      });
    } catch (e) {
      // critical errors like schema not existing/object, etc., that cannot be recovered from/skipped
      error(config.metadata, entityType.name, { type: 'schema', message: e instanceof Error ? e.message : String(e) });

      continue;
    }
  }
}

const results = resolveEntityTypeJoins(intermediateResults, args.values['force-generate-joins']);

for (const {
  entityType,
  metadata: { domain, module },
} of results) {
  await mkdir(path.resolve(args.values.out, 'entity-types', domain, module), { recursive: true });
  await write('entity-types', domain, module, `${entityType.name}.json5`, json5.stringify(entityType, null, 2));
  await write(
    'csv',
    domain,
    module,
    `${entityType.name}.csv`,
    await entityTypeToCsv(
      entityType,
      memoize((searchId) =>
        Promise.resolve(results.map((r) => r.entityType).find((et) => et.id === searchId) ?? ({} as EntityType)),
      ),
    ),
  );
}

const translationsByLocale = new Map<string, Record<string, string>>();
for (const locale of EXPECTED_LOCALES) {
  translationsByLocale.set(locale, {});
}

const expectedTranslationKeys = results
  .map(({ entityType }) => inferTranslationsFromEntityType(entityType))
  .flatMap(Object.keys);

for (const { dir, config } of configs) {
  const translationFiles = (await readdir(path.resolve(dir, 'translations'), { recursive: true })).filter((p) =>
    p.endsWith('.json'),
  );

  for (const file of translationFiles) {
    const locale = path.basename(file, '.json');
    const filePath = path.resolve(dir, 'translations', file);
    const incoming = await Bun.file(filePath).json();

    translationsByLocale.set(locale, {
      ...translationsByLocale.get(locale),
      ...marshallExternalTranslations(incoming, config.metadata, expectedTranslationKeys),
    });
  }
}

const missingTranslations = new Map<EntityTypeGenerationConfig['metadata'], Record<string, string>>();

for (const { entityType, metadata } of results) {
  const inferredTranslations = inferTranslationsFromEntityType(entityType);
  const missingKeys = Object.keys(inferredTranslations).filter((key) => !translationsByLocale.get('en')?.[key]);
  if (missingKeys.length > 0) {
    missingTranslations.set(metadata, {
      ...missingTranslations.get(metadata),
      ...Object.entries(inferredTranslations)
        .filter(([key]) => missingKeys.includes(key))
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
    });
  }
  for (const [locale, translations] of translationsByLocale.entries()) {
    translationsByLocale.set(locale, {
      ...inferredTranslations,
      ...translations,
    });
  }
}

for (const [metadata, translations] of missingTranslations.entries()) {
  warn(metadata, undefined, {
    type: 'translations',
    missingTranslations: Object.fromEntries(
      Object.entries(translations).map(([key, value]) => [unmarshallTranslationKey(key), value]),
    ),
  });
}

for (const [locale, translations] of translationsByLocale.entries()) {
  await write('translations', '', 'mod-fqm-manager', `${locale}.json`, JSON.stringify(translations, null, 2));
}

const teamInfo = await Bun.file(path.resolve(__dirname, '../../team-info.yaml'))
  .text()
  .then((t) => YAML.parse(t) as Record<string, { github: string; slack: string }>);

const teams = new Set(configs.map(({ config }) => config.metadata.team));
for (const team of teams) {
  if (!(team in teamInfo)) {
    error(undefined, undefined, {
      type: 'unknown-team',
      teamName: team,
    });
  }
}

write(
  '',
  '',
  '',
  'module-team-map.json',
  JSON.stringify(Object.fromEntries(configs.map(({ config }) => [config.metadata.module, config.metadata.team]))),
);
