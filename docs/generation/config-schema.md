# Configuration schema

The configuration for entity type generation is defined in a [TOML](https://learnxinyminutes.com/toml/) file named `fqm-config.toml` in the root of your module's repository. An example can be found in [example-config.toml](example-config.toml). Here's a breakdown of each section of the configuration and the available options and their purpose:

## Metadata

This is a single dictionary/table that contains metadata about the module. Exactly one must be defined.

| Property | Type          | Description                                                                                                                                |
| -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `team`   | string        | The team responsible for the module. Used for PR generation and Slack notifications.                                                       |
| `domain` | string (enum) | The domain of the module, used for grouping files in the repository structure. Possible values are whitelisted in [`types.ts`](/types.ts). |
| `module` | string        | The name of the module, used for grouping files and disambiguation.                                                                        |

### Example

```toml
[metadata]
team = "my-team"
domain = "circulation"
module = "mod-cool-circ"
```

## Sources

Each source block represents a database view that will be used to back entity types. At least one block must be defined, and each block must have a unique `name`.

| Property | Type      | Description                                                                                                                                                                 |
| -------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`   | string    | The name of the source. Must be unique across all sources.                                                                                                                  |
| `table`  | string?   | The name of the table to use as the source. Only one of `table` or (`sql` and `deps`) may be provided.                                                                      |
| `sql`    | string?   | The full SQL SELECT query to use as the source. Only one of `table` or (`sql` and `deps`) may be provided. `${tenant_id}` may be used as a placeholder inside schema names. |
| `deps`   | string[]? | A list of tables used in the SQL query. Only one of `table` or (`sql` and `deps`) may be provided.                                                                          |

### Example

```toml
[[sources]]
name = "coolness"
table = "raw_coolness_values"

# or
[[sources]]
name = "coolness"
sql = "SELECT * FROM ${tenant_id}_mod_cool_circ.raw_coolness_values"
tables = ["raw_coolness_values"]
```

## Entity Types

Each entity type block represents an entity type that will be generated. At least one block must be defined, and each block must have a unique `name`.

| Property            | Type                   | Default | Description                                                                                                                                                                                         |
| ------------------- | ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`              | string                 |         | The internal name of the entity type. Must be unique across all entity types. **Changing this will also change the entity type's internal ID, may break joins, and should be avoided if possible.** |
| `private`           | boolean?               | `false` | If the entity type is private (hidden from the Lists interface) or not. If `true`, the entity type will not be available in the Lists interface, but will still be available via the API.           |
| `source`            | string                 |         | The name of the source to use for this entity type. Must match the `name` of a source defined in the `sources` section.                                                                             |
| `schema`            | string                 |         | The path to the JSON or YAML schema file for this entity type.                                                                                                                                      |
| `permissions`       | string[]               |         | An array of permissions that will be required to access this entity type.                                                                                                                           |
| `sort`              | [string, string]       |         | A tuple containing the field name to sort by and the sort direction (`ASC` or `DESC`).                                                                                                              |
| `includeJsonbField` | boolean?               | `true`  | If `true`, a hidden `jsonb` field will be included in the entity type. This allows API access to the entire record's JSON and is used by Bulk Edit.                                                 |
| `useRmbIndexStyle`  | boolean?               | `false` | If RMB indexes should be assumed; [see below](#usermbindexstyle)                                                                                                                                    |
| `fieldExclusions`   | string[]               |         | An array of field names to exclude from the entity type. This is useful for excluding fields that are not used, not present in the database, or otherwise should not be exposed via FQM.            |
| `fieldOverrides`    | Record<string, object> |         | Override field properties; [see below](#fieldOverrides)                                                                                                                                             |
| `fieldAdditions`    | object[]               |         | Add/replace fields; [see below](#fieldAdditions)                                                                                                                                                    |

### `useRmbIndexStyle`

If `true`, `valueGetter`s will be generated in a style compatible with indexes generated by RMB. This should only be used for modules that use RMB, and we recommend checking your table indexes before enabling this.

To learn more about `valueGetter`s and see the different styles, view the [field schema reference](field-schema.md).

### `fieldOverrides`

An array of custom overrides for properties in the source schema. This is useful if you are unable to modify the source schema directly (e.g. a `$ref` to a shared schema).

These override the schema's properties (see [field-schema.md](field-schema.md)), so use the same property names and values as you would for the schema itself.

### `fieldAdditions`

An array of custom fields to add to the generated entity type. This can be useful for fields present in the database but not the API.

This also allows overwriting existing fields with custom definitions: **provided fields will fully replace any existing fields with the same name**.

The schema for these fields is the same as **the generated entity type, not the original schema format**. We recommend copying an existing generated field to use as the basis for these.

> [!CAUTION]
> If you find yourself using this often or to customize a property not supported otherwise, please reach out to Corsair. There may be better options (or we can add one).

### Example

```toml
[[entityTypes]]
name = "user_coolness"
source = "coolness"
schema = "src/main/resources/openapi/coolStuff.json"
permissions = ["my-module.cool.item.get"]
sort = ["id", "ASC"]

# sets foo's visibility to 'hidden' (foo is the column's name)
[entityTypes.fieldOverrides.foo]
x-fqm-visibility = 'hidden'

# adds a new column, 'baz'
[[entityTypes.fieldAdditions]]
name = 'baz'
dataType = { dataType = 'stringType' }
# ...all the other properties
```
