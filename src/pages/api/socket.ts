import {
  fetchEntityType,
  install,
  runQuery,
  runQueryForValues,
  uninstall,
  verifyFqmConnection,
} from '@/src/socket/fqm';
import {
  aggregateSchemaForAutocompletion,
  analyzeJsonb,
  persistEntityType,
  verifyPostgresConnection,
} from '@/src/socket/postgres';
import { DataTypeValue, EntityType, FqmConnection, PostgresConnection } from '@/types';
import formatEntityType, { fancyIndent } from '@/src/utils/formatter';
import dotenv from 'dotenv';
import json5 from 'json5';
import { NextApiRequest, NextApiResponse } from 'next';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { Server } from 'socket.io';
import { v4 as uuid } from 'uuid';
import { Socket } from 'node:net';
import { existsSync } from 'node:fs';

export const ENTITY_TYPE_FILE_PATH = 'external/mod-fqm-manager/src/main/resources/entity-types/';

if (!existsSync('external/mod-fqm-manager')) {
  console.error('external/mod-fqm-manager does not exist! Either clone a submodule there or create a symlink.');
  process.exit(1);
}

let fqmConnection: FqmConnection;
let pg: postgres.Sql | null = null;

interface SocketWithServer extends Socket {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server?: any;
}

export default function SocketHandler(req: NextApiRequest, res: NextApiResponse<unknown>) {
  const socket = res.socket as SocketWithServer;

  dotenv.config({ path: ['../.env', './.env'] });

  console.log('Socket server is initializing');
  const io = new Server(socket?.server);
  socket.server.io = io;

  io.on('connection', (socket) => {
    console.log('connected!');

    if ('DB_HOST' in process.env) {
      console.log('Found DB credentials in .env, sending up');
      socket.emit('db-credentials', {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT ?? '5432'),
        database: process.env.DB_DATABASE,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
      } as PostgresConnection);
    }
    if ('FQM_HOST' in process.env) {
      console.log('Found FQM credentials in .env, sending up');
      socket.emit('fqm-credentials', {
        host: process.env.FQM_HOST,
        port: parseInt(process.env.FQM_PORT ?? '8080'),
        tenant: process.env.FQM_TENANT,
        limit: parseInt(process.env.FQM_LIMIT ?? '50'),
        user: process.env.FQM_USERNAME,
        password: process.env.FQM_PASSWORD,
      } as FqmConnection);
    }

    async function findEntityTypes() {
      console.log('Looking for entity types in', ENTITY_TYPE_FILE_PATH);
      const files = await Promise.all(
        (await readdir(ENTITY_TYPE_FILE_PATH, { recursive: true }))
          .filter((f) => f.endsWith('.json5'))
          .map(async (f) => {
            try {
              return { file: f, data: json5.parse((await readFile(ENTITY_TYPE_FILE_PATH + f)).toString()) };
            } catch (e) {
              console.error('Error reading entity type file', `${ENTITY_TYPE_FILE_PATH}${f}`, e);
              return { file: `⚠️⚠️⚠️${f}⚠️⚠️⚠️`, data: {} };
            }
          }),
      );

      console.log('Found', files.length, 'entity types');

      socket.emit('entity-types', files);
    }

    async function fetchDbSchema() {
      if (pg && fqmConnection) {
        socket.emit('database-schema', await aggregateSchemaForAutocompletion(pg, fqmConnection.tenant));
      }
    }

    socket.on('connect-to-fqm', async (params: FqmConnection) => {
      console.log('Connecting to FQM', params);

      socket.emit('fqm-connection-change', { connected: false, message: 'Attempting to connect...' });

      fqmConnection = params;

      socket.emit('fqm-connection-change', await verifyFqmConnection(fqmConnection));

      fetchDbSchema();
    });

    socket.on('connect-to-postgres', async (params: PostgresConnection) => {
      console.log('Connecting to Postgres', params);

      socket.emit('postgres-connection-change', { connected: false, message: 'Attempting to connect...' });

      const result = await verifyPostgresConnection(params);
      if (result.forClient.connected) pg = result.pg;

      socket.emit('postgres-connection-change', result.forClient);

      fetchDbSchema();
    });

    socket.on('enumerate-files', () => {
      findEntityTypes();
    });

    socket.on('get-translations', async () => {
      socket.emit(
        'translations',
        JSON.parse((await readFile('external/mod-fqm-manager/translations/mod-fqm-manager/en.json')).toString()),
      );
    });

    socket.on('create-entity-type', async (name) => {
      console.log('Creating entity type', name);

      const dir = path.dirname(ENTITY_TYPE_FILE_PATH + name);
      console.log('Creating directory', dir);

      await mkdir(dir, { recursive: true });

      await writeFile(ENTITY_TYPE_FILE_PATH + name, json5.stringify({ id: uuid(), name: '' }, null, 2));

      findEntityTypes();
    });

    socket.on('save-entity-type', async ({ file, entityType }: { file: string; entityType: EntityType }) => {
      console.log('Saving entity type', file, entityType);

      await writeFile(
        ENTITY_TYPE_FILE_PATH + file,
        fancyIndent(json5.stringify(formatEntityType(entityType), null, 2)) + '\n',
      );

      socket.emit('saved-entity-type');

      findEntityTypes();
    });

    socket.on('refresh-entity-types', async () => {
      findEntityTypes();
      socket.emit(
        'translations',
        JSON.parse((await readFile('external/mod-fqm-manager/translations/mod-fqm-manager/en.json')).toString()),
      );
    });

    socket.on(
      'update-translations',
      async ({ entityType, newTranslations }: { entityType: EntityType; newTranslations: Record<string, string> }) => {
        const curTranslations = JSON.parse(
          (await readFile('external/mod-fqm-manager/translations/mod-fqm-manager/en.json')).toString(),
        );

        const updatedTranslationSet = { ...curTranslations, ...newTranslations };

        const keysForThisEntity = Object.keys(updatedTranslationSet).filter((k) =>
          k.startsWith(`entityType.${entityType.name}`),
        );
        const expectedKeysForThisEntity = [`entityType.${entityType.name}`];
        const fieldsToHandle =
          entityType.columns?.map((c) => ({ prop: false, field: c, prefix: `entityType.${entityType.name}` })) ?? [];

        while (fieldsToHandle.length) {
          console.log(fieldsToHandle);
          const { prop, field, prefix } = fieldsToHandle.pop()!;
          expectedKeysForThisEntity.push(`${prefix}.${field.name}`);
          if (prop) {
            expectedKeysForThisEntity.push(`${prefix}.${field.name}._qualified`);
          }
          if (
            field.dataType?.dataType === DataTypeValue.arrayType &&
            field.dataType.itemDataType?.dataType === DataTypeValue.objectType
          ) {
            fieldsToHandle.push(
              ...(field.dataType.itemDataType.properties?.map((p) => ({
                prop: true,
                field: p,
                prefix: `${prefix}.${field.name}`,
              })) ?? []),
            );
          }
          if (field.dataType?.dataType === DataTypeValue.objectType) {
            fieldsToHandle.push(
              ...(field.dataType.properties?.map((p) => ({
                prop: true,
                field: p,
                prefix: `${prefix}.${field.name}`,
              })) ?? []),
            );
          }
        }

        const keysToRemove = keysForThisEntity.filter((k) => !expectedKeysForThisEntity.includes(k));
        const missingKeys = expectedKeysForThisEntity.filter((k) => !keysForThisEntity.includes(k));
        console.log('Found keys to remove', keysToRemove);
        console.log('Found missing keys', missingKeys);

        if (keysToRemove.length) {
          socket.emit(
            'warning',
            `Entity type ${entityType.name} had the following extra translations, which were stripped:\n${keysToRemove.join('\n')}`,
          );
        }
        if (missingKeys.length) {
          socket.emit(
            'warning',
            `Entity type ${entityType.name} is missing the following translations:\n${missingKeys.join('\n')}`,
          );
        }

        const sorted = Object.keys(updatedTranslationSet)
          .filter((k) => !keysToRemove.includes(k))
          .toSorted((a, b) => a.localeCompare(b))
          .reduce(
            (acc, key) => {
              acc[key] = updatedTranslationSet[key];
              return acc;
            },
            {} as Record<string, string>,
          );

        await writeFile(
          'external/mod-fqm-manager/translations/mod-fqm-manager/en.json',
          JSON.stringify(sorted, null, 2) + '\n',
        );
        console.log('Updated translations');
        socket.emit('translations', sorted);
      },
    );

    socket.on(
      'check-entity-type-validity',
      async ({ entityType, includeHidden }: { entityType: EntityType; includeHidden: boolean }) => {
        console.log('Checking entity type validity', entityType);

        if (!pg) {
          socket.emit('check-entity-type-validity-result', {
            persisted: false,
            queried: false,
            persistError: 'No Postgres connection',
          });
          return;
        }

        try {
          await persistEntityType(pg, fqmConnection.tenant, entityType);
          socket.emit('check-entity-type-validity-result', {
            persisted: true,
            queried: false,
          });
        } catch (e: unknown) {
          console.error('Error persisting entity type', e);
          socket.emit('check-entity-type-validity-result', {
            queried: false,
            persisted: false,
            persistError: (e as Error).message,
          });
          return;
        }

        try {
          socket.emit('check-entity-type-validity-result', {
            persisted: true,
            queried: true,
            queryResults: JSON.stringify(
              JSON.parse(await fetchEntityType(fqmConnection, entityType.id, includeHidden)),
              null,
              2,
            ),
          });
        } catch (e: unknown) {
          console.error('Error fetching entity type', e);
          socket.emit('check-entity-type-validity-result', {
            persisted: true,
            queried: false,
            queryError: (e as Error).message,
          });
        }
      },
    );

    socket.on('run-query', async ({ entityType, query }: { entityType: EntityType; query: string }) => {
      console.log('Running query', query, 'on', entityType.name);

      if (!pg) {
        socket.emit('run-query-result', {
          persisted: false,
          persistError: 'No Postgres connection',
        });
        return;
      }

      try {
        await persistEntityType(pg, fqmConnection.tenant, entityType);
        socket.emit('run-query-result', {
          persisted: true,
        });
      } catch (e: unknown) {
        console.error('Error persisting entity type', e);
        socket.emit('run-query-result', {
          persisted: false,
          persistError: (e as Error).message,
        });
        return;
      }

      try {
        socket.emit('run-query-result', {
          persisted: true,
          queryResults: await runQuery(fqmConnection, entityType, query),
        });
      } catch (e: unknown) {
        console.error('Error querying entity type', e);
        socket.emit('run-query-result', {
          persisted: true,
          queried: false,
          queryError: (e as Error).message,
        });
      }
    });

    socket.on('run-query-values', async ({ entityType, field }: { entityType: EntityType; field: string }) => {
      console.log('Running query for values of field', field, 'on', entityType.name);

      if (!pg) {
        socket.emit('run-query-values-result', {
          persisted: false,
          persistError: 'No Postgres connection',
        });
        return;
      }

      try {
        await persistEntityType(pg, fqmConnection.tenant, entityType);
        socket.emit('run-query-values-result', {
          persisted: true,
        });
      } catch (e: unknown) {
        console.error('Error persisting entity type', e);
        socket.emit('run-query-values-result', {
          persisted: false,
          persistError: (e as Error).message,
        });
        return;
      }

      try {
        socket.emit('run-query-values-result', {
          persisted: true,
          queryResults: await runQueryForValues(fqmConnection, entityType, field),
        });
      } catch (e: unknown) {
        console.error('Error querying entity type', e);
        socket.emit('run-query-values-result', {
          persisted: true,
          queried: false,
          queryError: (e as Error).message,
        });
      }
    });

    socket.on('analyze-jsonb', ({ db, table, column }: { db: string; table: string; column: string }) => {
      analyzeJsonb(socket, pg!, fqmConnection.tenant, db, table, column);
    });

    socket.on('install-module', async () => socket.emit('install-module-result', await install(fqmConnection)));
    socket.on('uninstall-module', async () => socket.emit('uninstall-module-result', await uninstall(fqmConnection)));

    // ping-pong right back
    socket.on('add-column-from-db-inspector', (newColumn) =>
      socket.emit('add-column-from-db-inspector-pong', newColumn),
    );
  });

  res.end();
}
