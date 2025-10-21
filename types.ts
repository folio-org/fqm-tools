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
  dateTimeType = 'dateTimeType',
  enumType = 'enumType',
  integerType = 'integerType',
  numberType = 'numberType',
  objectType = 'objectType',
  openUUIDType = 'openUUIDType',
  rangedUUIDType = 'rangedUUIDType',
  stringUUIDType = 'stringUUIDType',
  stringType = 'stringType',
}

export const DataTypeTemplateBase: z.ZodType<{
  dataType: DataTypeValue;
  itemDataType?: z.infer<z.ZodTypeAny>; // must use any here due to recursive reference
  properties?: z.infer<typeof EntityTypeFieldTemplate>[];
}> = z
  .object({
    dataType: z.nativeEnum(DataTypeValue),
    itemDataType: z.lazy(() => DataTypeTemplate).optional(),
    properties: z.array(z.lazy(() => EntityTypeFieldTemplate)).optional(),
  })
  .strict();

export const DataTypeTemplate: z.ZodType<{
  dataType: DataTypeValue;
  itemDataType?: z.infer<typeof DataTypeTemplate>;
  properties?: z.infer<typeof EntityTypeFieldTemplate>[];
}> = DataTypeTemplateBase;

export type DataType = z.infer<typeof DataTypeTemplate>;

export const EntityTypeFieldTemplate = z
  .object({
    name: z.string(),
    labelAlias: z.string().optional(),
    labelAliasFullyQualified: z.string().optional(),
    property: z.string().optional(),
    dataType: DataTypeTemplate, // Reference to DataTypeTemplate
    sourceAlias: z.string().optional(),
    isIdColumn: z.boolean().optional(),
    idColumnName: z.string().optional(),
    queryable: z.boolean().optional(),
    queryOnly: z.boolean().optional(),
    hidden: z.boolean().optional(),
    essential: z.boolean().optional(),
    visibleByDefault: z.boolean().optional(),
    valueGetter: z.string().optional(),
    filterValueGetter: z.string().optional(),
    valueFunction: z.string().optional(),
    source: z
      .object({
        columnName: z.string(),
        entityTypeId: z.string(),
      })
      .optional(),
    valueSourceApi: z
      .object({
        path: z.string(),
        valueJsonPath: z.string(),
        labelJsonPath: z.string(),
      })
      .optional(),
    values: z
      .array(
        z.object({
          value: z.string(),
          label: z.string(),
        }),
      )
      .optional(),
    joinsTo: z.array(z.lazy(() => EntityTypeFieldJoinTemplate)).optional(), // Reference to EntityTypeFieldJoinTemplate
    joinsToIntermediate: z.array(z.lazy(() => EntityTypeFieldJoinIntermediateTemplate)).optional(),
  })
  .strict();

export type EntityTypeField = z.infer<typeof EntityTypeFieldTemplate>;

export const EntityTypeFieldJoinTypeTemplate = z.discriminatedUnion('type', [
  z.object({ type: z.literal('custom'), sql: z.string() }),
  z.object({ type: z.literal('equality-simple') }),
  z.object({ type: z.literal('equality-cast-uuid') }),
]);

// Zod schema for EntityTypeFieldJoin
export const EntityTypeFieldJoinTemplate = z
  .object({
    targetId: z.string(),
    targetField: z.string(),
    direction: z.enum(['inner', 'left', 'right', 'full']).optional(),
  })
  .and(EntityTypeFieldJoinTypeTemplate);

export type EntityTypeFieldJoin = z.infer<typeof EntityTypeFieldJoinTemplate>;

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
        domain: z.enum(['acquisition', 'catalog', 'circulation', 'erm', 'system', 'users', 'other']),
        module: z.string(),
      })
      .strict(),
    sources: z.array(
      z.union([
        z.object({ name: z.string(), table: z.string() }).strict(),
        z.object({ name: z.string(), sql: z.string() }).strict(),
      ]),
    ),
    entityTypes: z.array(
      z
        .object({
          name: z.string(),
          private: z.boolean().optional(),
          source: z.string(),
          schema: z.string(),
          permissions: z.array(z.string()),
          sort: z.tuple([z.string(), z.string()]),
          useRmbIndexStyle: z.boolean().optional(),
          includeJsonbField: z.boolean().optional(),
          fieldAdditions: z.array(z.lazy(() => EntityTypeFieldTemplate)).optional(),
          fieldExclusions: z.array(z.string()).optional(),
          fieldOverrides: z.record(z.string(), z.any()).optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type EntityTypeGenerationConfig = z.infer<typeof EntityTypeGenerationConfigTemplate>;
export type EntityTypeGenerationConfigSource = EntityTypeGenerationConfig['sources'][number];
