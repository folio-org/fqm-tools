# Translations

Translation files are used to provide human-readable labels for entity types and their fields, enabling localization and improving the user experience for all of our users. Our translations use the same system as UI modules, storing a set of key-value pairs by locale in each repository. Here's what this normally looks like:

```
mod-cool-module (repository root)
└── translations
    └── my-cool-module
        ├── en.json # source of truth
        ├── de.json # German translation
        ├── es.json # Spanish translation
        ├── en-US.json # US English translation
        ├── en-GB.json # British English translation
        └── ...
```

For these translation files, **only `en.json` should be touched by developers.** All other files are maintained by an external platform, Lokalise, and will be overwritten as the community updates translations. For more information about the translation process, see [this wiki page](https://folio-org.atlassian.net/wiki/spaces/I18N/pages/5374336/How+to+Translate+FOLIO).

> [!NOTE]
> The extra folder inside `translations` is required to be the name of your module. Although it may not affect entity type generation, it is required for the translations to be properly handled by Lokalise and our community translators.

> [!NOTE]
> When first setting up translations, it is OK to only provide an `en.json`. `mod-fqm-manager` will automatically generate the other files based on it, and Lokalise will create the others automatically once your repository is connected to it.

## Translation format

Translations are stored in JSON files as simple objects, mapping translation keys to human-readable labels. Here's how a small entity type might be represented:

```json
{
  "fqm.entityType.cool_data": "User coolness",
  "fqm.entityType.cool_data.id": "UUID",
  "fqm.entityType.cool_data.username": "Username",
  "fqm.entityType.cool_data.coolness": "Coolness (%)",
  "fqm.entityType.cool_data.coolness_matrix": "Coolness factors",
  "fqm.entityType.cool_data.coolness_matrix.factor_name": "Name",
  "fqm.entityType.cool_data.coolness_matrix.factor_name._qualified": "Coolness factor name",
  "fqm.entityType.cool_data.coolness_matrix.factor_value": "Value",
  "fqm.entityType.cool_data.coolness_matrix.factor_value._qualified": "Coolness factor value"
}
```

Here's an example of how results might appear in the Lists app:

```
+--------------------------------------+----------+--------------+------------------------------------+
|                 UUID                 | Username | Coolness (%) |          Coolness factors          |
+--------------------------------------+----------+--------------+------------------------------------+
| 35ca1bff-fc42-5582-90d1-77abcde4c5d5 | jeff     |           85 | +---------------+-------+          |
|                                      |          |              | |     Name      | Value |          |
|                                      |          |              | +---------------+-------+          |
|                                      |          |              | | Base coolness |   0.7 |          |
|                                      |          |              | | Jeff bonus    |  0.15 |          |
|                                      |          |              | +---------------+-------+          |
+--------------------------------------+----------+--------------+------------------------------------+
| 2c394ea8-fda4-5bb4-a4af-38b279ac26aa | steve    |           92 | +------------------+-------+       |
|                                      |          |              | |       Name       | Value |       |
|                                      |          |              | +------------------+-------+       |
|                                      |          |              | | Base coolness    |   0.7 |       |
|                                      |          |              | | Steve bonus      |  0.12 |       |
|                                      |          |              | | Five letter name |   0.1 |       |
|                                      |          |              | +------------------+-------+       |
+--------------------------------------+----------+--------------+------------------------------------+
| 47e95efe-89bb-597d-82f6-f09a9b261b1e | sysadmin |            ∞ | +----------------+---------------+ |
|                                      |          |              | |      Name      |     Value     | |
|                                      |          |              | +----------------+---------------+ |
|                                      |          |              | | Base coolness  |           0.7 | |
|                                      |          |              | | Sysadmin bonus | 2,147,483,647 | |
|                                      |          |              | +----------------+---------------+ |
+--------------------------------------+----------+--------------+------------------------------------+
```

There are a few different levels represented here, with the format `fqm.entityType.<entityTypeName>.<fieldName>[.<subFieldName>[._qualified]]`. Here's what each means:

- `fqm.entityType.<entityTypeName>`: the entity type's label itself, displayed as "Record type" in the Lists app. The name `cool_data` is the same name as the entity type defined in the configuration file.
- `fqm.entityType.<entityTypeName>.<fieldName>`: the label of each field, as shown in the results, exports, and the query builder.
- `fqm.entityType.<entityTypeName>.<fieldName>.<subFieldName>`: the label of a sub-field, which is used when rendering the tables for object[] fields.
- `fqm.entityType.<entityTypeName>.<fieldName>.<subFieldName>._qualified`: the label of a sub-field that is qualified. Currently, this is only for the query builder, where the context of the outer field name is not available.

## Quick start

To get started with translations, take a look at the generated report's output. Inside the Markdown report will be a copy-pasteable JSON snippet that you can use to start your translations file! This will contain every translation key needed for your entity type and its best guess at what the labels for each should be. Simply copy this snippet into your `en.json` file and revise the labels as needed.

## Translation best practices

There are a number of best practices to follow when writing translations for entity types to ensure a consistent user experience. They are described [here](https://github.com/folio-org/mod-fqm-manager/blob/master/translations/README.md) and include important information about abbreviations, prefixes, disambiguation, and more.

Additionally, there are a number of best practices to follow when drafting user-visible text in FOLIO, such as using only sentence case. Most of these are not applicable to entity types; however, they can be useful to know. These are known as the MOTIF design language and may be found [here](https://ux.folio.org/docs/all-guidelines/?sort=type#language-rules).

**Ambiguous/incorrect translations are one of the most common reason to have entity type changes rejected!**

## Next steps

Now that you have translations set up, you can move on to [testing your entity types](06-testing.md) to ensure they work as expected and are ready for use in FOLIO.
