# FQM Tools

Copyright (C) 2025 The Open Library Foundation

This software is distributed under the terms of the Apache License,
Version 2.0. See the file "[LICENSE](LICENSE)" for more information.

## Custom schema properties

| Property                    | Description                                       | Type | Required | Default |
| --------------------------- | ------------------------------------------------- | ---- | -------- | ------- |
| `x-fqm-data-type`           |
| `x-fqm-value-getter`        | using `null` will remove guessed from entity type |
| `x-fqm-filter-value-getter` | using `null` will remove guessed from entity type |
| `x-fqm-value-function`      | using `null` will remove guessed from entity type |
| `x-fqm-is-id-column`        | default `name === 'id'`                           |
| `x-fqm-value-source-api`    |

## Config

- useRmbIndexStyle (default `false`)
- includeJsonbField (default `true`)
