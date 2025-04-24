# FQM Tools

Copyright (C) 2025 The Open Library Foundation

This software is distributed under the terms of the Apache License,
Version 2.0. See the file "[LICENSE](LICENSE)" for more information.

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=org.folio%3Afqm-tools&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=org.folio%3Afqm-tools)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=org.folio%3Afqm-tools&metric=coverage)](https://sonarcloud.io/summary/new_code?id=org.folio%3Afqm-tools)

## Custom schema properties

<!-- this table will be made into something coherent in FQMTOOL-5 -->

| Property                    | Description                                       | Type                                                                          | Required | Default |
| --------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- | -------- | ------- |
| `x-fqm-name`                |
| `x-fqm-joins-to`            |
| `x-fqm-ignore`              |
| `x-fqm-data-type`           |
| `x-fqm-value-getter`        | using `null` will remove guessed from entity type |
| `x-fqm-filter-value-getter` | using `null` will remove guessed from entity type |
| `x-fqm-value-function`      | using `null` will remove guessed from entity type |
| `x-fqm-is-id-column`        | default `name === 'id'`                           |
| `x-fqm-value-source-api`    |
| `x-fqm-visible-by-default`  | default no                                        |
| `x-fqm-visibility`          | `all`, `query-only`, `results-only`, `hidden`     | default `all`; temporarily `results-only` for nested array->object properties |
| `x-fqm-essential`           | default no                                        |

## Config

- useRmbIndexStyle (default `false`)
- includeJsonbField (default `true`)
