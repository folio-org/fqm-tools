# Introduction

Thank you for joining us on our journey to make the FOLIO Query Machine (FQM) more powerful and easier to use! This guide will help you understand how to add entity types to FQM, enabling your module's data to be queried alongside other modules' data.

We **strongly** recommend reading through this section before starting on the others, as it will provide you with the necessary context and understanding of how FQM works and what entity types are.

If you have any questions — or encounter something that seems harder/more confusing than it should be — please feel free to reach out to the FQM team via our [Slack channel](https://open-libr-foundation.slack.com/archives/C065XKBNARG). We want this to be as easy as possible for you, and we are here to help!

## What is FQM? Why should my team/module care?

FQM (the FOLIO Query Machine) is a an easy-to-use, high-performance query engine for all of FOLIO. It accepts queries, processes them, and provides answers in consistent formats, allowing FOLIO modules to be queried in real-time and synthesize data from multiple modules.

By reading this guide, you are (hopefully) interested in adding entity types to FQM for your module. By doing this, FQM will be able to understand your module's data, allowing users to easily query it alongside other modules' data, unlocking powerful new use cases and workflows.

## What is an entity type?

Entity types are the fundamental building blocks of how FQM interfaces with other modules. Each entity type represents a type of queryable data, such as a `user`, `item`, `department`, or `invoice`. Each entity type defines the structure of its data, the fields it contains, and where its data is pulled from.

There are two types of entity types: simple and composite. Simple entity types are our primary focus in entity type generation, representing a single type of data and typically maintaining a one-to-one relationship with a database table. Composite entity types, on the other hand, are more complex and tie simple entity types together, allowing for more complex queries and data relationships. These are typically what users will query against, as it allows displaying all relevant data together (for example, a `loan` with its `user`, `item`, `fee/fine`, etc.).

With entity type generation, we will only focus on simple entity types.

## What do entity types consist of?

Entity types consist of several key components:

<dl>
  <dt>Metadata</dt>
  <dd>Basic information about the entity type, such as its name, permissions required for users to access it, and default sorting.</dd>

  <dt>Sources</dt>
  <dd>Information about where the data for the entity type comes from. For simple entity types, this is a database source; for composites, this is a set of child simple entity types.</dd>

  <dt>Fields</dt>
  <dd>

The individual data points that make up the entity type, such as `id`, `name`, `email`, etc. Each field has a name, data type, and other properties that define how it should be handled.

  </dd>

  <dt>Translations</dt>
  <dd>Human-readable labels for the entity type and its fields, allowing for localization and better user experience.</dd>
</dl>

Fields will be generated from your module's existing API schemas, enabling minimal duplication and overhead. The remainder will be defined in configuration and translation files, allowing for easy customization and updates.

### More details about fields

Fields are the most important parts of an entity type as they define the data that is available to users, how it should be displayed, how it is pulled from the database, and how it can be queried. Read more about it in [field-schema.md](field-schema.md).

# Next steps

Ready to get started? Move to [02-setting-up-locally.md](02-setting-up-locally.md) to learn how to set up FQM Tools locally.
