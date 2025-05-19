import entityTypeToCsv from '@/src/schema-conversion/csv';
import { fetchAllEntityTypes, fetchEntityType } from '@/src/socket/fqm';
import { EntityType, FqmConnection } from '@/types';
import json5 from 'json5';
import memoize from 'lodash.memoize';
import { mkdir, readdir, readFile } from 'node:fs/promises';

if (process.argv.length < 3) {
  console.error('Usage:');
  console.error('  bun scripts/dump-entity-type-information.ts <label> public');
  console.error('    Dumps all publicly available entity types to the dump/<label> directory');
  console.error('  bun scripts/dump-entity-type-information.ts <label> <entityTypeId>...');
  console.error('    Dumps the specified entity types to the dump/<label> directory');
  console.error('  bun scripts/dump-entity-type-information.ts <label> all');
  console.error('    Dumps all entity types to the dump, based on the IDs in the current checkout');
  console.error('');
  console.error('Environment variables:');
  console.error('  FQM_INCLUDE_HIDDEN_FIELDS: Include hidden fields in the dump');
  process.exit(1);
}

const FQM_CONNECTION: FqmConnection = {
  host: process.env.FQM_HOST!,
  port: parseInt(process.env.FQM_PORT ?? '8080'),
  tenant: process.env.FQM_TENANT!,
  limit: 50,
  user: process.env.FQM_USERNAME,
  password: process.env.FQM_PASSWORD,
};

let entityTypes: { id: string; label?: string }[];
if (process.argv[3] === 'all') {
  const ENTITY_TYPE_FILE_PATH = './external/mod-fqm-manager/src/main/resources/entity-types/';
  console.log('Looking for entity types in', ENTITY_TYPE_FILE_PATH);
  entityTypes = (
    await Promise.all(
      (await readdir(ENTITY_TYPE_FILE_PATH, { recursive: true }))
        .filter((f) => f.endsWith('.json5'))
        .map(async (f) => {
          try {
            const data = json5.parse((await readFile(ENTITY_TYPE_FILE_PATH + f)).toString());
            return { id: data.id, label: data.name };
          } catch (e) {
            console.error('Error reading entity type file', `${ENTITY_TYPE_FILE_PATH}${f}`, e);
            return null;
          }
        }),
    )
  ).filter((e) => e !== null);
} else if (process.argv[3] === 'public') {
  const response = JSON.parse(await fetchAllEntityTypes(FQM_CONNECTION));
  if (Array.isArray(response)) {
    entityTypes = response;
  } else {
    entityTypes = response.entityTypes;
  }
} else {
  entityTypes = process.argv.slice(3).map((id) => ({ id }));
}

const dir = `./dump/${process.argv[2]}`;
await mkdir(dir, { recursive: true });

const fetcher = memoize(async (entityTypeId) => {
  try {
    return JSON.parse(
      await fetchEntityType(FQM_CONNECTION, entityTypeId, process.env['FQM_INCLUDE_HIDDEN_FIELDS'] === 'true'),
    );
  } catch (e) {
    console.error('Error fetching entity type', entityTypeId, e);
    return {} as EntityType;
  }
});

for (const { id, label } of entityTypes) {
  console.log('Dumping information for entity type', label ?? id);

  const entityType = await fetcher(id);
  const filename = `${dir}/${(label ?? entityType.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;

  await Bun.write(Bun.file(filename), await entityTypeToCsv(entityType, fetcher));
}
