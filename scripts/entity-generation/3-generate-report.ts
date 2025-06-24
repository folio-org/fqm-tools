import { ErrorSerialized, getDescription, getTitle } from '@/src/schema-conversion/error';
import { EntityType } from '@/types';
import { WebClient } from '@slack/web-api';
import { AsciiTable3 } from 'ascii-table3';
import { $ } from 'bun';
import { readdir } from 'fs/promises';
import json5 from 'json5';
import diff from 'microdiff';
import path from 'path';
import pluralize from 'pluralize';
import { parseArgs } from 'util';
import YAML from 'yaml';

const DIFF_EMOJI = {
  CREATE: '➕',
  CHANGE: '✏️',
  REMOVE: '❌',
} as const;
const DIFF_SORT = {
  CREATE: 0,
  CHANGE: 1,
  REMOVE: 2,
} as const;

const ISSUE_EMOJI = {
  zzz: '🙈',
  error: '❌',
  warning: '⚠️',
} as const;

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
    'pr-number': {
      type: 'string',
      short: 'n',
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
  console.log('Usage: bun 3-generate-report.ts [options]');
  console.log(
    'Generates a summary and error report based on the changes to entity types, liquibase changelogs, and translations.',
  );
  console.log('Options:');
  console.log('  -h, --help            Show this help message');
  console.log('  -f, --base-dir        mod-fqm-manager repository location (default: ../mod-fqm-manager)');
  console.log('  -o, --generated-dir   Output directory from create-entity-types.ts (default: out)');
  console.log('  -i, --error-log       Where create-entity-types.ts stddout is saved (default: -, for stdin)');
  console.log('  -n, --pr-number       Send Slack notifications about this report and the provided PR number');
  process.exit(1);
}

const moduleToTeamMap = (await Bun.file(
  path.resolve(args.values['generated-dir'], 'module-team-map.json'),
).json()) as Record<string, string>;
const teamInfo = await Bun.file(path.resolve(__dirname, '../../team-info.yaml'))
  .text()
  .then((t) => YAML.parse(t) as Record<string, { github: string; slack: string }>);

const affectedTeams = new Set<string>(['corsair']);

// liquibase and translations are sufficient to determine summary ± across versions, as all ETs and their fields are catalogued via translation keys
async function readChangelogsFromDirectory(
  dir: string,
): Promise<Record<string, { module: string; selectQuery: string }>> {
  return Object.fromEntries(
    (
      await Promise.all(
        (
          await readdir(dir, { recursive: true }).catch((e) => {
            console.error(`Failed to read directory ${dir}:`, e);
            return [];
          })
        )
          .filter((f) => f.endsWith('.yaml'))
          .map((f) => path.resolve(dir, f))
          .map((f) =>
            Bun.file(f)
              .text()
              .then(YAML.parse)
              .then((c): [string, { module: string; selectQuery: string }] | [null, null] => {
                if (!('createView' in (c.databaseChangeLog[0].changeSet.changes[0] ?? {}))) {
                  return [null, null];
                }
                return [
                  c.databaseChangeLog[0].changeSet.changes[0].createView.viewName,
                  {
                    module: c.databaseChangeLog[0].changeSet.author.split('--').slice(-1)[0].trim(),
                    selectQuery: c.databaseChangeLog[0].changeSet.changes[0].createView.selectQuery,
                  },
                ];
              }),
          ),
      )
    ).filter((c) => c[0] !== null),
  );
}

async function readEntityTypesFromDirectory(dir: string): Promise<Record<string, EntityType>> {
  return Object.fromEntries(
    await Promise.all(
      (
        await readdir(dir, { recursive: true }).catch((e) => {
          console.error(`Failed to read directory ${dir}:`, e);
          return [];
        })
      )
        .filter((f) => f.endsWith('.json') || f.endsWith('.json5'))
        .map((f) => path.resolve(dir, f))
        .map((f) =>
          Bun.file(f)
            .text()
            .then(json5.parse)
            .then((et: EntityType) => [et.name, et]),
        ),
    ),
  );
}

const originalViews = await readChangelogsFromDirectory(
  path.resolve(args.values['base-dir'], 'src', 'main', 'resources', 'db', 'changelog', 'external', 'changesets'),
);
const newViews = await readChangelogsFromDirectory(path.resolve(args.values['generated-dir'], 'liquibase'));

const liquibaseDiff = diff(originalViews, newViews, {
  cyclesFix: false,
}).toSorted((a, b) => DIFF_SORT[a.type] - DIFF_SORT[b.type]);

liquibaseDiff.forEach((change) => {
  const key = change.path[0] as string;
  if (key in newViews) {
    affectedTeams.add(moduleToTeamMap[newViews[key].module] || 'corsair');
  } else if (key in originalViews) {
    affectedTeams.add(moduleToTeamMap[originalViews[key].module] || 'corsair');
  }
});

const oldTranslations = await Bun.file(
  path.resolve(
    args.values['base-dir'],
    'src',
    'main',
    'resources',
    'external-translations',
    'mod-fqm-manager',
    'en.json',
  ),
)
  .json()
  .catch((e) => {
    console.error('Failed to read old translations:', e);
    return {};
  });
const newTranslations = await Bun.file(
  path.resolve(args.values['generated-dir'], 'translations', 'mod-fqm-manager', 'en.json'),
).json();

// all fields will have generated translations, so we can guarantee all ± of fields are reflected here
const fieldDiffRaw = diff(oldTranslations, newTranslations, { cyclesFix: false })
  .toSorted((a, b) => DIFF_SORT[a.type] - DIFF_SORT[b.type])
  .filter(({ type }) => type !== 'CHANGE') // we don't care about field changes, only added/removed
  .reduce(
    (acc, change) => {
      const [, entityType, ...rest] = (change.path[0] as string).split('.');

      const moduleName = entityType.split('__')[0];
      affectedTeams.add(moduleToTeamMap[moduleName] || 'corsair');

      if (!acc[entityType]) {
        acc[entityType] = {};
      }
      acc[entityType][rest.join('.')] = change.type as 'CREATE' | 'REMOVE';

      return acc;
    },
    {} as Record<string, Record<string, 'CREATE' | 'REMOVE'>>,
  );

// get entity types added/removed
const entityTypeDiff = Object.fromEntries(
  Object.entries(fieldDiffRaw)
    .map(([key, changes]) => [key, changes['']] as const)
    .filter((entry) => entry[1] !== undefined),
);

// we don't need to report field changes for added/removed entity types
for (const entityType of Object.keys(entityTypeDiff)) {
  delete fieldDiffRaw[entityType];
}

const fieldDiff: Record<
  string,
  Record<
    string,
    'CREATE' | 'REMOVE' | { path: string; type: 'CREATE' | 'CHANGE' | 'REMOVE'; oldValue?: unknown; value?: unknown }[]
  >
> = fieldDiffRaw;

const oldEntityTypes = await readEntityTypesFromDirectory(
  path.resolve(args.values['base-dir'], 'src', 'main', 'resources', 'entity-types', 'external'),
);
const newEntityTypes = await readEntityTypesFromDirectory(path.resolve(args.values['generated-dir'], 'entity-types'));

// all fields will have generated translations (which are checked above),
// so we can do not need to worry about ± of fields, only changes within them
for (const [name, newEt] of Object.entries(newEntityTypes)) {
  if (!oldEntityTypes[name]) {
    continue;
  }

  const moduleName = name.split('__')[0];
  affectedTeams.add(moduleToTeamMap[moduleName] || 'corsair');

  const oldEt = oldEntityTypes[name];

  for (const newField of newEt.columns ?? []) {
    const oldField = oldEt.columns?.find((f) => f.name === newField.name);
    if (!oldField) {
      continue;
    }

    const fieldChange = diff(oldField, newField, { cyclesFix: false });
    if (fieldChange.length > 0) {
      if (!fieldDiff[name]) {
        fieldDiff[name] = {};
      }
      fieldDiff[name][newField.name] = fieldChange.map((c) => ({
        ...c,
        path: c.path.join('->'),
      }));
    }
  }
}

const issueLogFile = args.values['error-log'] === '-' ? Bun.stdin : Bun.file(args.values['error-log']);
const issues = (await issueLogFile.text())
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l)) as ErrorSerialized[];
const knownIssues: ErrorSerialized[] = await Bun.file(
  path.resolve(args.values['base-dir'], 'src', 'main', 'resources', 'entity-type-generation-accepted-errors.json'),
).json();

const aliveAndKnownIssues = issues.filter((i) =>
  knownIssues.some((ki) => diff(i, ki, { cyclesFix: false }).length === 0),
);
const newIssues = issues.filter(
  (i) => !aliveAndKnownIssues.some((ki) => diff(i, ki, { cyclesFix: false }).length === 0),
);

const issuesByTeam = issues.reduce(
  (acc, issue) => {
    const team = issue.metadata?.team || '';
    if (!acc[team]) {
      acc[team] = [];
      affectedTeams.add(team || 'corsair');
    }
    acc[team].push(issue);
    return acc;
  },
  {} as Record<string, ErrorSerialized[]>,
);

async function logCollapsable(
  title: string,
  content: (printer: (s: string) => void) => void | Promise<void>,
  indent = 0,
) {
  const baseIndent = '> '.repeat(Math.max(0, indent - 1));

  console.log(`${baseIndent}<details>`);
  console.log(`${baseIndent}<summary>${title}</summary>`);
  console.log(baseIndent); // lists won't work without padding before/after
  await content((s) => console.log('> '.repeat(indent) + s));
  console.log(baseIndent);
  console.log(`${baseIndent}</details>`);
  console.log(baseIndent);
}

function diffSummary(changes: ('CREATE' | 'CHANGE' | 'REMOVE')[]): string {
  return changes.length === 0 ? 'no changes' : changes.map((c) => DIFF_EMOJI[c]).join('');
}

/***** START REPORT PRINTING *****/
if (
  Object.values(entityTypeDiff).includes('REMOVE') ||
  Object.values(fieldDiff).some((c) => Object.values(c).includes('REMOVE'))
) {
  console.log('> [!CAUTION]');
  console.log(
    '> Some entity types or fields were removed. This may break existing lists and queries and should accompany a [migration script](https://github.com/folio-org/mod-fqm-manager/blob/master/docs/Migration.md) if necessary.',
  );
  console.log();
}

if (newIssues.length > 0) {
  console.log('> [!CAUTION]');
  console.log('> New issues were found during the entity generation process. Please review them carefully.');
  console.log();
}

console.log('# Change summary');
console.log();

await logCollapsable(`Entity types (addition/removal): ${diffSummary(Object.values(entityTypeDiff))}`, () => {
  for (const [entityType, type] of Object.entries(entityTypeDiff)) {
    console.log(`- ${DIFF_EMOJI[type]} \`${entityType}\``);
  }
});

await logCollapsable(
  `Entity types (field changes): ${pluralize('entity type', Object.keys(fieldDiff).length, true)} affected`,
  async () => {
    for (const [entityType, changes] of Object.entries(fieldDiff)) {
      await logCollapsable(
        `Fields in \`${entityType}\`: ${Object.values(changes)
          .map((c) => (typeof c === 'string' ? c : 'CHANGE'))
          .toSorted((a, b) => DIFF_SORT[a] - DIFF_SORT[b])
          .map((c) => DIFF_EMOJI[c])
          .join('')}`,
        (p) => {
          const table: [string, string, string, string, string][] = [];

          for (const [field, change] of Object.entries(changes)) {
            if (typeof change === 'string') {
              table.push([DIFF_EMOJI[change].repeat(2), field, '', '', '']);
            } else {
              for (const c of change) {
                table.push([
                  DIFF_EMOJI[c.type].repeat(2),
                  field,
                  `\`${c.path}\``,
                  c.oldValue !== undefined ? `\`${JSON.stringify(c.oldValue)}\`` : '',
                  c.value !== undefined ? `\`${JSON.stringify(c.value)}\`` : '',
                ]);
              }
            }
          }

          // markdown tables in GH can't scroll horizontally, but code blocks can!
          p('```md');
          new AsciiTable3()
            .setHeading('', 'Field', 'Path', 'Old', 'New')
            .addRowMatrix(table)
            .toString()
            // we have to add duplicate emojis when generating the table as the generation does not support double-width
            .replaceAll(DIFF_EMOJI.CREATE.repeat(2), DIFF_EMOJI.CREATE)
            .replaceAll(DIFF_EMOJI.CHANGE.repeat(2), DIFF_EMOJI.CHANGE)
            .replaceAll(DIFF_EMOJI.REMOVE.repeat(2), DIFF_EMOJI.REMOVE)
            .split('\n')
            .forEach(p);
          p('```');
        },
        2,
      );
    }
  },
  1,
);

await logCollapsable(`Liquibase: ${diffSummary(liquibaseDiff.map((c) => c.type))}`, () => {
  for (const change of liquibaseDiff) {
    console.log(`- ${DIFF_EMOJI[change.type]} \`${change.path[0]}\``);
  }
});

console.log('> [!WARNING]');
console.log(
  '> _This summary includes most possible changes, however, it may not be exhaustive. Please review the changes manually before approval._',
);
console.log();

console.log('# Error report');

console.log(
  `This run resulted in **${newIssues.length} new ${pluralize('issue', newIssues.length)}** and ${aliveAndKnownIssues.length} previously acknowledged ${pluralize('issue', aliveAndKnownIssues.length)}.`,
);

for (const team of Object.keys(issuesByTeam).toSorted()) {
  const issues = issuesByTeam[team];
  const teamName = team || 'System';

  await logCollapsable(
    `${teamName} (${issues
      .map((i) => (aliveAndKnownIssues.includes(i) ? 'zzz' : i.severity))
      .toSorted((a, b) => a.localeCompare(b)) // convenient
      .map((i) => ISSUE_EMOJI[i])
      .join('')})`,
    async (p) => {
      const issuesSorted = issues.toSorted((a, b) => {
        const aModule = a.metadata?.module || '';
        const bModule = b.metadata?.module || '';
        return aModule.localeCompare(bModule) || a.severity.localeCompare(b.severity) || a.type.localeCompare(b.type);
      });

      // markdown tables in GH can't scroll horizontally, but code blocks can!
      p('```md');
      new AsciiTable3()
        .setHeading('', 'Domain', 'Module', 'Entity type', 'Error type', 'Message')
        .addRowMatrix(
          issuesSorted.map((issue) => [
            // we will remove the duplicate after generating the table;
            // the table generation does not support double-width chars natively, so we do it ourselves
            ISSUE_EMOJI[issue.severity].repeat(2) + (aliveAndKnownIssues.includes(issue) ? ' (suppressed)' : ''),
            issue.metadata?.domain || '-',
            issue.metadata?.module || '-',
            issue.entityTypeName || '-',
            getTitle(issue),
            getDescription(issue),
          ]),
        )
        .toString()
        // remove double-width chars
        .replaceAll(ISSUE_EMOJI.error.repeat(2), ISSUE_EMOJI.error)
        .replaceAll(ISSUE_EMOJI.warning.repeat(2), ISSUE_EMOJI.warning)
        .replaceAll(ISSUE_EMOJI.zzz.repeat(2), ISSUE_EMOJI.zzz)
        .split('\n')
        .forEach(p);
      p('```');

      for (const missingTranslations of issuesSorted.filter((i) => i.type === 'translations')) {
        p('');
        await logCollapsable(
          `Missing translations snippet for \`${missingTranslations.metadata?.module}\``,
          (pp) => {
            pp(
              `The following is a starting point for missing translations within \`${missingTranslations.metadata?.module}\`. ` +
                `Please check it carefully and update the values to ensure they match your user's expectations and follow ` +
                `[our translation guidelines](https://github.com/folio-org/mod-fqm-manager/blob/master/translations/README.md).`,
            );
            pp('');
            pp('```json');
            JSON.stringify(missingTranslations.missingTranslations, null, 2)
              .split('\n')
              .forEach((line) => pp(line));
            pp('```');
          },
          2,
        );
      }
    },
    1,
  );
}

console.log('---');
await logCollapsable('Run/debug information', async () => {
  console.log(`- **Run date**: \`${new Date().toISOString()}\``);
  console.log(`- **FQM directory**: \`${args.values['base-dir']}\``);
  console.log(
    `- **FQM ref**: \`${(await $`git -C ${args.values['base-dir']} rev-parse HEAD`.nothrow().quiet().text()).trim()}\``,
  );
  console.log(`- **Generation directory**: \`${args.values['generated-dir']}\``);
  console.log(`- **Error log**: \`${args.values['error-log']}\``);
  console.log(`- **Affected teams**: \`${Array.from(affectedTeams).join('`, `')}\``);
  console.log('');

  await logCollapsable('`run-config.yaml` contents', async (p) => {
    p('```yaml');
    (await Bun.file('run-config.yaml').text()).split('\n').forEach((l) => p(l));
    p('```');
  });
});

/***** SLACK NOTIFICATIONS *****/
function getColorFromErrors(errors: ErrorSerialized[]): string {
  if (errors.some((e) => e.severity === 'error')) {
    return '#ff0000';
  }
  if (errors.some((e) => e.severity === 'warning')) {
    return '#e9d502';
  }
  return '#36a64f';
}

if (args.values['notify-pr']) {
  const prNumber = args.values['notify-pr'];
  const prUrl = `https://github.com/folio-org/mod-fqm-manager/pull/${prNumber}`;
  const slack = new WebClient(process.env.SLACK_TOKEN);

  const corsairMessage = await slack.chat.postMessage({
    channel: teamInfo.corsair.slack,
    attachments: [
      {
        fallback: 'New entity type PR is available!',
        color: getColorFromErrors(newIssues),
        mrkdwn_in: ['text', 'fields'],
        title: `A new FQM entity type PR is available!`,
        text: `<${prUrl}|PR #${prNumber}> has been created; please review the changes as soon as possible.`,
        fields: [
          {
            title: 'New issues',
            value: newIssues.length === 0 ? 'no new issues' : newIssues.map((i) => ISSUE_EMOJI[i.severity]).join(''),
            short: false,
          },
          {
            title: 'Entity types (+/-)',
            value: diffSummary(Object.values(entityTypeDiff)),
            short: true,
          },
          {
            title: 'Entity type fields',
            value: pluralize('entity type', Object.keys(fieldDiff).length, true),
            short: true,
          },
          {
            title: 'Liquibase',
            value: diffSummary(liquibaseDiff.map((c) => c.type)),
            short: true,
          },
        ],
        actions: [
          {
            text: '*View the PR* :octocat:',
            type: 'button',
            url: prUrl,
          },
        ],
      },
    ],
  });

  const corsairMessagePermalink = await slack.chat.getPermalink({
    channel: corsairMessage.channel!,
    message_ts: corsairMessage.ts!,
  });

  for (const team of affectedTeams) {
    const slackChannel = teamInfo[team]?.slack;
    console.log(`Notifying ${team} in Slack channel ${slackChannel}`);
    if (!slackChannel || team === 'corsair') {
      continue;
    }

    const newTeamIssues = (issuesByTeam[team] || []).filter((i) => newIssues.includes(i));

    await slack.chat.postMessage({
      channel: teamInfo.corsair.slack,
      attachments: [
        {
          fallback: `New entity type PR requires ${team}'s attention!`,
          color: getColorFromErrors(newTeamIssues),
          mrkdwn_in: ['text', 'fields'],
          title: `A new FQM entity type PR is available with ${team}'s changes!`,
          text: `<${prUrl}|PR #${prNumber}> has been created and contains changes from ${team}. Please review the changes${newTeamIssues.length === 0 ? '' : ' and resolve any issues'} as soon as possible.`,
          fields: [
            {
              title: 'New issues',
              value:
                newTeamIssues.length === 0
                  ? 'no new issues'
                  : newTeamIssues.map((i) => ISSUE_EMOJI[i.severity]).join(''),
              short: false,
            },
          ],
          actions: [
            {
              text: '*View the PR* :octocat:',
              type: 'button',
              url: prUrl,
            },
            {
              text: '*Message Corsair* :slack:',
              type: 'button',
              url: corsairMessagePermalink.permalink,
            },
          ],
        },
      ],
    });
  }
}

// list of affected teams for review purposes
if (process.env.GITHUB_OUTPUT) {
  await Bun.write(
    Bun.file(process.env.GITHUB_OUTPUT),
    'reviewers=' +
      Array.from(affectedTeams)
        .map((t) => teamInfo[t]?.github)
        .filter(Boolean)
        .join(','),
  );
}
