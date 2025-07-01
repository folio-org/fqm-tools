# Running the generator

There are two main parts of the generation process: `2-create-entity-types.ts` and `3-generate-report.ts`. The first one generates the entity types, however, its output is difficult to read and see issues, as its output is designed to be consumed by later applications; the second one generates an easy-to-read Markdown report of the generation, which is what we recommend you use to see and resolve any reported issues.

## Run the script

To run the generator, use the following two lines:

```sh
bun scripts/entity-generation/2-create-entity-types.ts external/my-module $(cat repositories.txt) > out/issues.log
bun scripts/entity-generation/3-generate-report.ts < out/issues.log > out/report.md
```

Be sure to replace `external/my-module` with the path to your module, if it is not in the `external` folder. `repositories.txt` is the list of directories of other cloned modules, as saved in [02-setting-up-locally.md](02-setting-up-locally.md).

## What did that just do?

This creates a lot of files in the `out` folder!

- `out/entity-types` contains the generated entity types as JSON5 files. We'll look more into that in a minute...
- `out/liquibase` contains the Liquibase changelogs that will create the necessary database views based on the provided sources;
- `out/translations` contains the translations for the entity types and their fields, which will be used by FQM to display human-readable labels;
- `out/csv` contains CSV summaries of each entity type which are easier to read and understand than the raw JSON5 files; and
- `out/report.md` contains a Markdown report of the generated entity types, which is what we recommend you use to review any issues resulting from generation.
- `out/issues.log` contains machine-readable results of the generation process, to be used by the report generator.

### Whoa, where did this giant entity type come from?

These entity types are generated based on common patterns that we see across modules, and everything is based on the JSON/YAML schemas provided in the configuration. Each property from the schema is turned into a field, `dataType`s are inferred from the schema, and everything else follows.

For more details on these fields can be configured, please see [field-schema.md](field-schema.md).

### This is too much information! What's the easiest way to read and share this?

The `csv` folder. This contains one CSV file per entity type, summarizing the names of fields, their data, and any extra attributes. These are the best source of information for you to see what will be available to users and to share with your team, product owners, and SMEs. For a guide on reading these, please refer to [this wiki](tbd).

<!-- TODO: LINK ABOVE -->

### What's in the report?

The report contains a summary of each added/remove/changed entity type and field, as well as any issues that were found during the generation process. **Keep a close eye on these issues — if you are missing a large amount of what you would expect to be generated then there are likely issues that need resolution.**

This report is simply meant for at-a-glance overviews of additions and changes, and also serves as the PR summary for once your entity types get staged against `mod-fqm-manager`.

## Next steps

Now that you have generated your entity types, let's move on to [adding translations](05-translations.md).
