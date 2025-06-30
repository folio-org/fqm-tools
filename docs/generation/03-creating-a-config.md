# Creating an initial configuration

Inside your repository's folder, create a new file called `fqm-config.toml`. This file will contain the configuration that tells FQM Tools what entity types to generate and how, in the [TOML format](https://toml.io/). A full reference for this file's schema is in [config-schema.md](config-schema.md) and an example in [example-config.toml](example-config.toml), but we'll explain everything here.

Now, let's add some metadata about the module to the configuration file. This will help FQM Tools know who is responsible for the module and how to group its files. Add the following lines to your `fqm-config.toml` file, substituting the values for what is appopriate:

```toml
[metadata]
team = "cool-team"
domain = "circulation" # one of acquisition, catalog, circulation, erm, system, or users
module = "mod-cool-module"
```

_Note: Does your module not fit into one of the domains above? Please let Corsair know and we'll add it!_

## Sources

Now, we will define a source configuration block which will be used to create a database view within FQM's schema. This can be repeated for each source you want to define and tells FQM where the entity type's data will come from. Source `name`s are referenced by the entity types and fields you will define later, so they should be unique and descriptive.

The simplest way to define a source is with a `table`:

```toml
[[sources]]
name = "data"
table = "data_table"
```

This will create a view with the following SQL query: `SELECT * FROM ${tenant_id}_mod_cool_module.data_table` (the `${tenant_id}` part is interpolated during module installation).

If you need more control, you can define a source with custom `sql` instead:

```toml
[[sources]]
name = "data"
sql = "SELECT * FROM ${tenant_id}_mod_cool_module.data_table"
```

> [!WARNING]
>
> We advise against using custom SQL unless absolutely necessary as it can lead to unexpected behavior during module upgrades. Joins should almost always be represented as composite entity types instead of being done in a view.
>
> If you must use custom SQL, please use `SELECT *` to reduce the risk of breaking changes in future versions of your module.

> [!IMPORTANT]
>
> You **must** add the full schema name (`${tenant_id}_mod_cool_module` here) to the `sql` query. Without this, module installation will fail in unpredictable ways.

## Entity types

Now that we have a source defined, we can create an entity type. These are created in a similar manner:

```toml
[[entityTypes]]
name = "cool_data"
source = "data"
schema = "src/main/resources/openapi/coolStuff.json"
permissions = ["my-module.cool.item.get"]
sort = ["id", "ASC"]
```

This is all it takes to create an entity type! Here's what each of these properties mean:

- `name`: the name of the entity type, used by developers only (should be unique across the module);
- `source`: the `name` of the source this entity type will use, as defined above;
- `schema`: the path to the JSON (or YAML) schema file that defines the fields for this entity — these should be the same as your normal API schemas, to promote reuse;
- `permissions`: an array of permissions that users must have to access this entity type, from your module descriptor; and
- `sort`: the default sort column and order for this entity type (do not read into this too much, `id` is fine for 99% of entity types).

# Next steps

Now that you have made your script, let's [run the generator](04-generation.md)!
