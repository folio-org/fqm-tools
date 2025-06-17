import { $ } from 'bun';
import { kebabCase } from 'change-case';
import debug from 'debug';
import { readFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import yaml from 'yaml';

const log = debug('fqm-tools:clone-repositories');

const configPath = resolve(__dirname, '../../run-config.yaml');
const config = yaml.parse(readFileSync(configPath, 'utf8')) as {
  modules: string[];
};

log('Configuration loaded:', config);

const outDir = resolve(__dirname, '../external');
await mkdir(outDir, { recursive: true });

log('Cloning mod-fqm-manager');
await $`git clone --recurse-submodules https://github.com/folio-org/mod-fqm-manager.git ${join(outDir, 'mod-fqm-manager')}`.quiet();
log('Cloned mod-fqm-manager into', join(outDir, 'mod-fqm-manager'));

function parseModule(moduleStr: string) {
  const [repo, ref] = moduleStr.split('#') as [string, string | undefined];

  if (repo.includes('/')) {
    return [repo, ref];
  } else {
    return [`https://github.com/folio-org/${repo}.git`, ref];
  }
}

const result = await Promise.all(
  config.modules
    .map(async (moduleStr) => {
      const [url, ref] = parseModule(moduleStr);
      const targetDir = join('external', kebabCase(moduleStr));

      log(`Cloning ${url} into ${targetDir}`);
      if (ref) {
        await $`git clone --recurse-submodules ${url} ${targetDir}`.quiet();
      } else {
        await $`git clone --depth 1 --recurse-submodules --shallow-submodules ${url} ${targetDir}`.quiet();
      }

      if (ref) {
        log(`Checking out custom ref ${ref} in ${targetDir}`);
        await $`git -C ${targetDir} checkout --recurse-submodules ${ref}`.quiet();
      }

      log(`Cloned ${url} into ${targetDir}; at commit`, await $`git -C ${targetDir} rev-parse HEAD`.text());

      return targetDir;
    })
    .map((p) =>
      p.catch((err) => {
        const e = err as $.ShellError;
        console.warn(`Failed with code ${e.exitCode}`);
        console.warn(e.stdout.toString());
        console.warn(e.stderr.toString());
        throw e;
      }),
    ),
);

console.log(result.join(' '));
