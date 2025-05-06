import { z } from 'zod';

export interface FqmConnection {
  host: string;
  port: number;
  tenant: string;
  limit: number;
  user?: string;
  password?: string;
}

export interface PostgresConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export enum DataTypeValue {
  arrayType = 'arrayType',
  jsonbArrayType = 'jsonbArrayType',
  booleanType = 'booleanType',
  dateType = 'dateType',
  enumType = 'enumType',
  integerType = 'integerType',
  numberType = 'numberType',
  objectType = 'objectType',
  openUUIDType = 'openUUIDType',
  rangedUUIDType = 'rangedUUIDType',
  stringUUIDType = 'stringUUIDType',
  stringType = 'stringType',
}

export interface DataType {
  dataType: DataTypeValue;
  itemDataType?: DataType;
  properties?: EntityTypeField[];
}

export interface EntityTypeField {
  name: string;
  labelAlias?: string;
  labelAliasFullyQualified?: string;
  property?: string;
  dataType: DataType;
  sourceAlias?: string;
  isIdColumn?: boolean;
  idColumnName?: string;
  queryable?: boolean;
  queryOnly?: boolean;
  hidden?: boolean;
  essential?: boolean;
  visibleByDefault?: boolean;
  valueGetter?: string;
  filterValueGetter?: string;
  valueFunction?: string;
  source?: {
    columnName: string;
    entityTypeId: string;
  };
  valueSourceApi?: {
    path: string;
    valueJsonPath: string;
    labelJsonPath: string;
  };
  values?: { value: string; label: string }[];
  joinsTo?: EntityTypeFieldJoin[];
  // used for middle stage of generating
  joinsToIntermediate?: EntityTypeFieldJoinIntermediate[];
}

export type EntityTypeFieldJoin = {
  targetId: string;
  targetField: string;
  direction?: 'inner' | 'left' | 'right' | 'full';
} & EntityTypeFieldJoinType;

type EntityTypeFieldJoinType =
  | { type: 'custom'; sql: string }
  | { type: 'equality-simple' }
  | { type: 'equality-cast-uuid' };

export interface EntityTypeSource {
  type: 'db' | 'entity-type';
  target?: string;
  alias: string;
  id?: string;
  join?: EntityTypeSourceJoin;
  useIdColumns?: boolean;
}

export interface EntityTypeSourceJoin {
  type: string;
  joinTo: string;
  condition: string;
}

export interface EntityType {
  id: string;
  name: string;
  private?: boolean;
  customFieldEntityTypeId?: string;
  fromClause?: string;
  sources?: EntityTypeSource[];
  requiredPermissions?: string[];
  columns?: EntityTypeField[];
  defaultSort?: { columnName: string; direction: string }[];
  sourceView?: string;
  sourceViewExtractor?: string;
}

export interface Schema {
  columns: Record<string, string[]>;
  routines: Record<string, string[]>;
  typeMapping: Record<string, string>;
  isView: Record<string, boolean>;
}

// using runtypes here as this is a mess and we really want to make sure incoming schemas are valid
export const EntityTypeFieldJoinIntermediateTemplate = z
  .object({
    targetModule: z.string(),
    targetEntity: z.string(),
    targetField: z.string(),
    direction: z.enum(['inner', 'left', 'right', 'full']).optional(),
  })
  .and(
    z.discriminatedUnion('type', [
      z.object({ type: z.undefined() }),
      z.object({ type: z.literal('equality-simple') }),
      z.object({ type: z.literal('equality-cast-uuid') }),
      z.object({ type: z.literal('custom'), sql: z.string() }),
    ]),
  );

export type EntityTypeFieldJoinIntermediate = z.infer<typeof EntityTypeFieldJoinIntermediateTemplate>;

export const EntityTypeGenerationConfigTemplate = z
  .object({
    metadata: z
      .object({
        team: z.string(),
        domain: z.enum(['acquisition', 'catalog', 'circulation', 'erm', 'users', 'other']),
        module: z.string(),
      })
      .strict(),
    sources: z.array(
      z
        .object({
          name: z.string(),
          table: z.string(),
        })
        .strict(),
    ),
    // from name used in entity type definitions to true name
    sourceMap: z.record(z.string(), z.string()).optional(),
    entityTypes: z.array(
      z
        .object({
          name: z.string(),
          private: z.boolean().optional(),
          schema: z.string(),
          permissions: z.array(z.string()),
          source: z.string(),
          sort: z.tuple([z.string(), z.string()]),
          useRmbIndexStyle: z.boolean().optional(),
          includeJsonbField: z.boolean().optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type EntityTypeGenerationConfig = z.infer<typeof EntityTypeGenerationConfigTemplate>;
export type EntityTypeGenerationConfigSource = EntityTypeGenerationConfig['sources'][number];
