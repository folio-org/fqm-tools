import { ErrorSerialized } from '@/src/schema-conversion/error';
import { mkdir, readdir, rm } from 'fs/promises';
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
    'base-dir': {
      type: 'string',
      short: 'f',
      default: 'external/mod-fqm-manager',
    },
    'generated-dir': {
      type: 'string',
      short: 'd',
      default: 'out',
    },
    'error-log': {
      type: 'string',
      short: 'i',
      default: '-',
    },
  },
  strict: true,
  allowPositionals: false,
});

if (args.positionals.length !== 0) {
  console.error("I don't want inputs :(");
  args.values.help = true; // prints help and exits
}

if (args.values.help) {
  console.log('Usage: bun 4-stage-changes.ts [options]');
  console.log('Stages changes from --generated-dir to --base-dir.');
  console.log('Options:');
  console.log('  -h, --help            Show this help message');
  console.log('  -f, --base-dir        mod-fqm-manager repository location (default: ../mod-fqm-manager)');
  console.log('  -o, --generated-dir   Output directory from create-entity-types.ts (default: out)');
  console.log('  -i, --error-log       Where create-entity-types.ts stddout is saved (default: -, for stdin)');
  process.exit(1);
}

const entityTypeDir = path.resolve(args.values['base-dir'], 'src', 'main', 'resources', 'entity-types', 'external');
const entityTypeGeneratedDir = path.resolve(args.values['generated-dir'], 'entity-types');

console.log('[Entity types] Deleting existing entity types in', entityTypeDir);
await rm(entityTypeDir, { recursive: true, force: true });
console.log('[Entity types] Creating new entity types directory', entityTypeDir);
await mkdir(entityTypeDir, { recursive: true });
console.log('[Entity types] Copying generated entity types from', entityTypeGeneratedDir, 'to', entityTypeDir);

for (const file of (await readdir(entityTypeGeneratedDir, { recursive: true }))
  .filter((f) => f.endsWith('.json') || f.endsWith('.json5'))
  .map((f) => path.resolve(entityTypeGeneratedDir, f))
  .map((f) => Bun.file(f))) {
  const targetFile = path.resolve(entityTypeDir, path.relative(entityTypeGeneratedDir, file.name!));
  await mkdir(path.dirname(targetFile), { recursive: true });
  Bun.write(targetFile, file);
  console.log('[Entity types] Copied', file.name, 'to', targetFile);
}

const translationDir = path.resolve(args.values['base-dir'], 'src', 'main', 'resources', 'external-translations');
const translationGeneratedDir = path.resolve(args.values['generated-dir'], 'translations');
console.log('[Translations] Deleting existing translations in', translationDir);
await rm(translationDir, { recursive: true, force: true });
console.log('[Translations] Creating new translations directory', translationDir);
await mkdir(translationDir, { recursive: true });
console.log('[Translations] Copying generated translations from', translationGeneratedDir, 'to', translationDir);

for (const file of (await readdir(translationGeneratedDir, { recursive: true }))
  .filter((f) => f.endsWith('.json'))
  .map((f) => path.resolve(translationGeneratedDir, f))
  .map((f) => Bun.file(f))) {
  const targetFile = path.resolve(translationDir, path.relative(translationGeneratedDir, file.name!));
  await mkdir(path.dirname(targetFile), { recursive: true });
  Bun.write(targetFile, file);
  console.log('[Translations] Copied', file.name, 'to', targetFile);
}

const sourceViewsDir = path.resolve(
  args.values['base-dir'],
  'src',
  'main',
  'resources',
  'db',
  'source-views',
  'external',
);
const sourceViewsGeneratedDir = path.resolve(args.values['generated-dir'], 'db');
console.log('[Source views] Deleting existing source view definitions in', sourceViewsDir);
await rm(sourceViewsDir, { recursive: true, force: true });
console.log('[Source views] Creating new source view definitions directory', sourceViewsDir);
await mkdir(sourceViewsDir, { recursive: true });
console.log('[Source views] Copying generated source view defs from', sourceViewsGeneratedDir, 'to', sourceViewsDir);

for (const file of (await readdir(sourceViewsGeneratedDir, { recursive: true }))
  .filter((f) => f.endsWith('.json5'))
  .map((f) => path.resolve(sourceViewsGeneratedDir, f))
  .map((f) => Bun.file(f))) {
  const targetFile = path.resolve(sourceViewsDir, path.relative(sourceViewsGeneratedDir, file.name!));
  await mkdir(path.dirname(targetFile), { recursive: true });
  Bun.write(targetFile, file);
  console.log('[Source views] Copied', file.name, 'to', targetFile);
}

const issueLogFile = args.values['error-log'] === '-' ? Bun.stdin : Bun.file(args.values['error-log']);
const issues = (await issueLogFile.text())
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l)) as ErrorSerialized[];
console.log('[Issues] Found', issues.length, 'issues in the error log:', args.values['error-log']);
const knownIssuesFile = path.resolve(
  args.values['base-dir'],
  'src',
  'main',
  'resources',
  'entity-type-generation-accepted-errors.json',
);
Bun.write(knownIssuesFile, JSON.stringify(issues, null, 2));
console.log('[Issues] Wrote issues to', knownIssuesFile);
