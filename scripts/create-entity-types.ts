import entityTypeToCsv from '@/src/schema-conversion/csv';
import createEntityTypeFromConfig from '@/src/schema-conversion/entity-type/entity-type';
import { resolveEntityTypeJoins } from '@/src/schema-conversion/entity-type/joins';
import {
  EXPECTED_LOCALES,
  inferTranslationsFromEntityType,
  marshallExternalTranslations,
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
  console.log('Usage: bun create-entity-type.ts [options] <baseDir1> <baseDir2> ... <baseDirN>');
  console.log('Options:');
  console.log('  -h, --help              Show this help message');
  console.log('  -o, --out               Output directory (default: out)');
  console.log('  --force-generate-joins  [dev only] Force generation of joins even if no matching target is found.');
  console.log('                          Will fill dummy data in for target ET/fields, to enable result verification.');
  process.exit(0);
}

async function write(category: string, domain: string, module: string, filename: string, data: string) {
  const fullPath = path.resolve(args.values.out, category, domain, module, filename);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await Bun.write(Bun.file(fullPath), data);
  console.log(`Wrote ${fullPath}`);
}

const configs: { dir: string; config: EntityTypeGenerationConfig }[] = [];

for (const dir of args.positionals) {
  const file = Bun.file(path.resolve(dir, 'fqm-config.toml'));
  if (!(await file.exists())) {
    console.error(`::error title=Unable to open config::${file.name} does not exist.`);
    continue;
  }

  const raw = TOML.parse(await file.text());

  try {
    const config = EntityTypeGenerationConfigTemplate.parse(raw);
    configs.push({ dir, config });
  } catch (e) {
    console.error(
      `::error title=Unable to parse config::${file.name} does not match the expected schema: ${JSON.stringify(e)}`,
    );
  }
}

if (configs.length === 0) {
  console.error('No valid configs found. Exiting.');
  process.exit(1);
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
  domain: string;
  module: string;
}[] = [];

for (const { dir, config } of configs) {
  console.log(
    `[stage 1] Processing ${config.metadata.domain}->${config.metadata.module} (team ${config.metadata.team}) from ${dir}`,
  );
  for (const entityType of config.entityTypes) {
    console.log(`[stage 1] - Processing ${entityType.name}`);

    try {
      const result = createEntityTypeFromConfig(
        entityType,
        await $RefParser.dereference(path.resolve(dir, entityType.schema)),
        config,
      );

      for (const issue of result.issues) {
        console.warn(
          `::warning title=${config.metadata.domain}->${config.metadata.module} (team ${config.metadata.team})::⚠️ ${issue}`,
        );
      }

      intermediateResults.push({
        entityType: result.entityType,
        domain: config.metadata.domain,
        module: config.metadata.module,
      });
    } catch (e) {
      // critical errors like schema not existing/object, etc., that cannot be recovered from/skipped
      console.error(
        `::error title=${config.metadata.domain}->${config.metadata.module} (team ${config.metadata.team})::❌ ${e}`,
      );
      continue;
    }
  }
}

const { entityTypes: results, issues } = resolveEntityTypeJoins(
  intermediateResults,
  args.values['force-generate-joins'],
);
issues.forEach((issue) => console.warn(issue));

for (const { entityType, domain, module } of results) {
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
      ...marshallExternalTranslations(incoming, config.metadata.module),
    });
  }
}

const missingTranslations = new Map<string, Record<string, string>>();

for (const { entityType, module } of results) {
  const inferredTranslations = inferTranslationsFromEntityType(entityType);
  const missingKeys = Object.keys(inferredTranslations).filter((key) => !translationsByLocale.get('en')?.[key]);
  if (missingKeys.length > 0) {
    missingTranslations.set(module, {
      ...missingTranslations.get(module),
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

for (const [module, translations] of missingTranslations.entries()) {
  console.warn(
    `::warning title=Missing translations::⚠️ Missing translations for module ${module}: Please see full job run summary for details and a pasteable snippet to add to \`${module}\`'s \`translations/${module}/en.json\`.  ${Object.keys(translations).join(', ')}.`,
  );
}

for (const [locale, translations] of translationsByLocale.entries()) {
  await write('translations', '', 'mod-fqm-manager', `${locale}.json`, JSON.stringify(translations, null, 2));
}
