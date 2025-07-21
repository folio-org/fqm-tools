# Field schema

Custom properties may be added to your existing JSON/YAML schemas to customize the generated entity types. Here's an overview of each available option:

## Available properties

| Property                    | Type                                             | Default                                                   | Description                                                                                                                                                     |
| --------------------------- | ------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x-fqm-ignore`              | boolean                                          | `false`                                                   | If `true`, this field will not be included in the generated entity type.                                                                                        |
| `x-fqm-name`                | string                                           | `snake_case` property name                                | The internal name of the field, should be in `snake_case`. Used when referenced by joins but not visible to the user.                                           |
| `x-fqm-data-type`           | data type                                        | inferred                                                  | What kind of column this is; [see below](#data-types)                                                                                                           |
| `x-fqm-is-id-column`        | boolean                                          | `name === 'id'`                                           | If this is an ID column for the entity type. Together, all ID columns must return unique results.                                                               |
| `x-fqm-visible-by-default`  | boolean                                          | `false`                                                   | Controls which columns are shown by default in the Lists app. We recommend enabling common fields for this.                                                     |
| `x-fqm-visibility`          | `all`, `query-only`, `results-only`, or `hidden` | `all`, or `results-only` for nested objects inside arrays | Controls if this field is usable everywhere (`all`), only in queries (`query-only`), only in results (`results-only`), or completely hidden from the UI.        |
| `x-fqm-essential`           | boolean                                          | `false`                                                   | If this field is one of the core ones of the entity type; used to control which fields are propagated to composite entity types which contain this entity type. |
| `x-fqm-value-getter`        | string (SQL)                                     | inferred                                                  | How the field should be queried from the database; [see below](#getters)                                                                                        |
| `x-fqm-filter-value-getter` | string (SQL)                                     | inferred                                                  | How the field should be queried from the database; [see below](#getters)                                                                                        |
| `x-fqm-value-function`      | string (SQL)                                     | inferred                                                  | How the field should be queried from the database; [see below](#getters)                                                                                        |
| `x-fqm-values`              | array of object `{value: string, label: string}` | none                                                      | Values to be presented in the query builder dropdown, should match an enum used in code.                                                                        |
| `x-fqm-value-source-api`    | object                                           | none                                                      | APIs that can provide values for queries; [see below](#value-source-apis)                                                                                       |
| `x-fqm-joins-to`            | array                                            | `[]`                                                      | Defines how this field can join to other entity types; [see below](#joins)                                                                                      |
| `x-fqm-joins-to-raw`        | array                                            | `[]`                                                      | Defines how this field can join to other non-generated entity types; [see below](#joins)                                                                        |

### Data types

Data types control how the field is handled by FQM and how it may be queried. A full set of data types may be found in the [schema](https://github.com/folio-org/folio-query-tool-metadata/blob/master/src/main/resources/swagger.api/schemas/entityDataType.json) (note that the first letter of these should be lowercased for use).

The most common ones you will use are:

- `stringType`: basic text fields
- `dateType`: date/time fields
- `rangedUUIDType`: standard UUID type
- `booleanType`: boolean true/false
- `numberType`: float numbers
- `integerType`: integer numbers
- `jsonbArrayType`: arrays extracted from JSONB fields

### Getters

Getters control the SQL used to query the field from the database. Here is how each is used:

- `x-fqm-value-getter`: used to get the data returned in results;
- `x-fqm-filter-value-getter`: used to get the data used for comparison when querying; and
- `x-fqm-value-function`: used to transform the user's query values before comparison.

When writing these, you can use placeholders `${source}` for the source name and `${tenant_id}` for the tenant's ID. These will be replaced with the actual values during generation and installation of FQM, respectively.

The value getters are typically quite simple, such as `${source}.jsonb->'prop'`, with some more advanced ones using expressions like `(SELECT array_agg(elems.value->>'prop') FROM jsonb_array_elements(${source}.jsonb->'arr') AS elems)` for a nested field.

Filter value getters are more complex as they should refer to existing indexes, if at all possible. If none is provided then the regular value getter is used instead; by default, non-array fields with the [config](config-schema.md#usermbindexstyle) `useRmbIndexStyle` `false` will not have a filter value getter. RMB fields use a special filter value getter by default, due to the types of indexes RMB typically creates: `lower(${tenant_id}_mod_your_module.f_unaccent(${source}.jsonb->'prop'::text))`.

The value function is used to transform the user's query values (referred to with `:value`) and is typically absent or a simple cast, such as `(:value)::integer`. This is used to ensure that the user's query value is in the correct format for comparison with the database field.

### Value source APIs

Value source APIs allows FQM to query external APIs for values to be used in queries. These values drive the dropdown lists in the query builder and ensure users can easily select valid values.

There are three properties to this:

```json
{
  "path": "api/endpoint",
  "valueJsonPath": "$.results.*.name",
  "labelJsonPath": "$.results.*.name"
}
```

This definition will extract names from an API endpoint at `/api/endpoint` with a response like:

```json
{
  "results": [
    { "id": "1", "name": "Option 1" },
    { "id": "2", "name": "Option 2" }
  ]
}
```

The `valueJsonPath` and `labelJsonPath` describe the values being used for the query and the label shown to the user in the builder, respectively. These are JSON paths; you can use the [JSONPath online evaluator](https://jsonpath.com/) to test your paths.

> [!NOTE]
>
> Any permissions required for these APIs **must** be included in the `permissions` set for the entity type. Changes to these permission lists also **must** be communicated to Corsair.

### Joins

Joins define how this field (and, thus, this entity type) can join to other entity types. These allow composite entity types to be created with your entity type; for example, your entity type may have a `created_by` field with a user UUID which can then be mapped to the `users` entity type.

#### x-fqm-joins-to field references

The `x-fqm-joins-to` field is the ideal way to do this, and is an array with the following format:

```json5
// on our created_by field
[
  {
    "targetModule": "mod-users",
    "targetEntity": "users", // internal entity type name as defined in that module's fqm-config.toml
    "targetField": "id", // internal field name as found in the generated entity type

    "direction": "inner", // optional, defaults to "inner"

    "type": "equality-cast-uuid" // optional, defaults to "equality-simple"
  },
  ...
]
```

Here, `targetModule`, `targetEntity`, and `targetField` are used to define the foreign field that ours can connect to. ([Keep reading](#join-types-and-directions) for `direction` and `type`)

> [!NOTE]
> When generating your entity types, if you refer to an external module, that module **should** also be included in the list of modules passed to `2-create-entity-types.ts` for generation. If you do not wish to pass in the additional module(s), you can specify `--force-generate-joins`, allowing the generator to create psuedo-joins. If the modules are not included and `--force-generate-joins` is not specified, the generator will throw an error and the joins will be omitted from the resulting entity type.

#### x-fqm-joins-to-raw field references

`x-fqm-joins-to-raw` is similar to `x-fqm-joins-to`, however, it points directly to an entity type by its ID. When possible, the module/entity names should be used instead, as it ensures joins stay in sync across modules; by using the raw ID the generator will be unable to verify that the join is actually possible.

```json5
// on our created_by field
[
  {
    "targetEntityId": "12345678-1234-1234-1234-123456789012", // the UUID of the entity type
    "targetField": "id", // internal field name as found in the generated entity type

    "direction": "inner", // optional, defaults to "inner"

    "type": "equality-cast-uuid" // optional, defaults to "equality-simple"
  },
  ...
]
```

([Keep reading](#join-types-and-directions) for `direction` and `type`)

#### Join types and directions

Optionally, we can define a `direction` (works as SQL JOIN directions, with our entity type being considered the left one). Additionally, there multiple `types` that can be used to customize the way equality is checked between each side of the equation.

| Type                 | SQL                             | Use                                                                                                                                                                                                   |
| -------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `equality-simple`    | `:this = :that`                 | (Default) The most common type, used for simple equality checks.                                                                                                                                      |
| `equality-cast-uuid` | `(:this)::uuid = (:that)::uuid` | Used when the field is a UUID as JSON or text, ensuring both sides are cast to UUID before comparison.                                                                                                |
| `custom`             | custom                          | Used for any other use case. If you use this, an additional property `sql` must be provided to be used as the join condition, with `:this` and `:that` as placeholders for each side's value getters. |

`:this` and `:that` refer to the value getters from each field and will be interpolated at runtime.
