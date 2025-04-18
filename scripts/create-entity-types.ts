import createEntityTypeFromConfig from '@/src/schema-conversion/entity-type/entity-type';
import { EntityTypeGenerationConfig } from '@/types';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { TOML } from 'bun';
import path from 'path';
import { exit } from 'process';
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

for (const dir of args.positionals) {
  const file = Bun.file(path.resolve(dir, 'fqm-config.toml'));
  if (!(await file.exists())) {
    console.error(`::error title=Unable to open config::${file.name} does not exist.`);
  }
}

exit(1);

// const config = TOML.parse(
//   await .text(),
// ) as EntityTypeGenerationConfig;

const results = await Promise.all(
  config.entityTypes.map(async (entityType) =>
    createEntityTypeFromConfig(
      entityType,
      await $RefParser.dereference(path.resolve(baseDir, entityType.schema)),
      config,
    ),
  ),
);
