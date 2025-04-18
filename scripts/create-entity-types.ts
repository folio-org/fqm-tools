import createEntityTypeFromConfig from '@/src/schema-conversion/entity-type/entity-type';
import { EntityTypeGenerationConfig } from '@/types';
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
  console.log('  -h, --help       Show this help message');
  console.log('  -o, --out        Output directory (default: out)');
  process.exit(0);
}

const configs: { dir: string; config: EntityTypeGenerationConfig }[] = [];

for (const dir of args.positionals) {
  const file = Bun.file(path.resolve(dir, 'fqm-config.toml'));
  if (!(await file.exists())) {
    console.error(`::error title=Unable to open config::${file.name} does not exist.`);
    continue;
  }

  configs.push({ dir, config: TOML.parse(await file.text()) as EntityTypeGenerationConfig });
}

for (const { dir, config } of configs) {
  console.log(
    `Processing ${config.metadata.domain}::${config.metadata.module} (team ${config.metadata.team}) from ${dir}`,
  );
  for (const entityType of config.entityTypes) {
    console.log(`- Processing ${entityType.name}`);

    try {
      const result = createEntityTypeFromConfig(
        entityType,
        await $RefParser.dereference(path.resolve(dir, entityType.schema)),
        config,
      );

      for (const issue of result.issues) {
        console.warn(
          `::warning title=${config.metadata.domain}::${config.metadata.module} (team ${config.metadata.team})::⚠️ ${issue}`,
        );
      }

      await mkdir(path.resolve(args.values.out, config.metadata.domain, config.metadata.module), { recursive: true });
      await Bun.write(
        Bun.file(
          path.resolve(args.values.out, config.metadata.domain, config.metadata.module, `${entityType.name}.json`),
        ),
        json5.stringify(result.entityType, null, 2),
      );
    } catch (e) {
      // critical errors like schema not existing/object, etc., that cannot be recovered from/skipped
      console.error(
        `::error title=${config.metadata.domain}::${config.metadata.module} (team ${config.metadata.team})::❌ ${e}`,
      );
      continue;
    }
  }
}
