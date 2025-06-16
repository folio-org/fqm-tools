import { mkdir } from 'fs/promises';
import { readdir } from 'fs/promises';
import { rm } from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';
import { readChangelogsFromDirectory } from './3-generate-report';
import YAML from 'yaml';
import { ErrorSerialized } from '@/src/schema-conversion/error';

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
      default: '../mod-fqm-manager',
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
  process.exit(0);
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

const liquibaseDir = path.resolve(
  args.values['base-dir'],
  'src',
  'main',
  'resources',
  'db',
  'changelog',
  'external',
  'changesets',
);
const liquibaseGeneratedDir = path.resolve(args.values['generated-dir'], 'liquibase');
console.log('[Liquibase] Deleting existing changesets in', liquibaseDir);
await rm(liquibaseDir, { recursive: true, force: true });
console.log('[Liquibase] Creating new changeset directory', liquibaseDir);
await mkdir(liquibaseDir, { recursive: true });
console.log('[Liquibase] Copying generated changesets from', liquibaseGeneratedDir, 'to', liquibaseDir);

for (const file of (await readdir(liquibaseGeneratedDir, { recursive: true }))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => path.resolve(liquibaseGeneratedDir, f))
  .map((f) => Bun.file(f))) {
  const targetFile = path.resolve(liquibaseDir, path.relative(liquibaseGeneratedDir, file.name!));
  await mkdir(path.dirname(targetFile), { recursive: true });
  Bun.write(targetFile, file);
  console.log('[Liquibase] Copied', file.name, 'to', targetFile);
}

const historicViewsPath = path.resolve(
  args.values['base-dir'],
  'src',
  'main',
  'resources',
  'db',
  'changelog',
  'external',
  'provided-views.json',
);
const historicViews = new Set<string>((await Bun.file(historicViewsPath).json()) as string[]);
const currentViews = Object.keys(await readChangelogsFromDirectory(liquibaseDir));
currentViews.forEach((v) => historicViews.add(v));

console.log('[Liquibase cleanup] Writing list of', historicViews.size, 'historic views to', historicViewsPath);
await Bun.write(historicViewsPath, JSON.stringify(Array.from(historicViews), null, 2));

const viewsRemoved = historicViews.difference(new Set(currentViews));
console.log('[Liquibase cleanup] Found', viewsRemoved.size, 'views that have been removed over time:', viewsRemoved);

const removedViewsChangesetPath = path.resolve(liquibaseDir, 'remove-old-views.yaml');
console.log('[Liquibase cleanup] Writing removed views to', removedViewsChangesetPath);
await Bun.write(
  removedViewsChangesetPath,
  YAML.stringify({
    databaseChangeLog: [
      {
        changeSet: {
          id: `drop_old_generated_views`,
          author: `generated-by-fqm-tools`,
          runAlways: true,
          changes: [...viewsRemoved].map((viewName) => ({
            dropView: {
              ifExists: true,
              viewName,
            },
          })),
        },
      },
    ],
  }),
);

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
