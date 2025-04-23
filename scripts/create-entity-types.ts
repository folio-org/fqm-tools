import createEntityTypeFromConfig from '@/src/schema-conversion/entity-type/entity-type';
import { resolveEntityTypeJoins } from '@/src/schema-conversion/entity-type/joins';
import { EntityType, EntityTypeGenerationConfig, EntityTypeGenerationConfigTemplate } from '@/types';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { TOML } from 'bun';
import { mkdir } from 'fs/promises';
import json5 from 'json5';
import path from 'path';
import { parseArgs } from 'util';

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
  await mkdir(path.resolve(args.values.out, domain, module), { recursive: true });
  await Bun.write(
    Bun.file(path.resolve(args.values.out, domain, module, `${entityType.name}.json5`)),
    json5.stringify(entityType, null, 2),
  );
}
