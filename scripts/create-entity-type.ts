import createEntityTypeFromConfig from '@/src/schema-conversion/entity-type/entity-type';
import { EntityTypeGenerationConfig } from '@/types';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { TOML } from 'bun';
import path from 'path';

const baseDir = 'external/mod-users';

const config = TOML.parse(
  await Bun.file(path.resolve(baseDir, 'fqm-config.toml')).text(),
) as EntityTypeGenerationConfig;

await Promise.all(
  config.entityTypes.map(async (entityType) => {
    console.log(
      createEntityTypeFromConfig(
        entityType,
        await $RefParser.dereference(path.resolve(baseDir, entityType.schema)),
        config,
      ),
    );
  }),
);
