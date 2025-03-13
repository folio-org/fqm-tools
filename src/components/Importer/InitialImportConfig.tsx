import { EntityType } from '@/types';
import { json } from '@codemirror/lang-json';
import { Autocomplete, Button, DialogActions, DialogContent, Grid2 as Grid, TextField } from '@mui/material';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { JSONSchema7 } from 'json-schema';
import json5 from 'json5';
import { Dispatch, SetStateAction } from 'react';
import { END_PAGE, State } from './JSONSchemaImporter';

export default function InitialImportConfig({
  entityType,
  state,
  setState,
  onClose,
}: Readonly<{
  entityType: EntityType;
  state: State;
  setState: Dispatch<SetStateAction<State>>;
  onClose: () => void;
}>) {
  return (
    <>
      <DialogContent>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <Autocomplete
              freeSolo
              options={entityType.sources?.map((s) => s.alias) ?? []}
              value={state.source}
              onChange={(_e, nv) =>
                setState((state) => ({
                  ...state,
                  source: nv ?? '',
                }))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Source"
                  value={state.source ?? ''}
                  onChange={(e) =>
                    setState((state) => ({
                      ...state,
                      source: e.target.value,
                    }))
                  }
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <label>JSON schema</label>
            <CodeMirror
              value={state.schemaRaw}
              onChange={(schemaRaw) => setState((s) => ({ ...s, schemaRaw }))}
              extensions={[json(), EditorView.lineWrapping]}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="error">
          Cancel
        </Button>
        <Button
          onClick={() => {
            const issues = state.warnings;

            try {
              // use json5 for a little more niceness
              const schema = json5.parse(state.schemaRaw) as JSONSchema7;
              const properties = schema.properties;

              if (!properties) {
                throw new Error('No properties found in schema');
              }

              const flattenedProperties = flattenProperties(properties as Record<string, JSONSchema7>);

              setState((s) => ({
                ...s,
                schema: { ...schema, properties: flattenedProperties } as JSONSchema7 & {
                  properties: NonNullable<JSONSchema7['properties']>;
                },
              }));
            } catch (e) {
              issues.push(`Invalid JSON schema: ${(e as Error).message}`);
            }

            if (issues.length) {
              setState((s) => ({ ...s, warnings: issues, page: END_PAGE }));
            } else {
              setState((s) => ({ ...s, page: 0 }));
            }
          }}
        >
          Begin
        </Button>
      </DialogActions>
    </>
  );
}

function flattenProperties(props: Record<string, JSONSchema7>) {
  let changed = false;

  const result: Record<string, JSONSchema7> = {};

  for (const [key, prop] of Object.entries(props)) {
    if (prop.type !== 'object') {
      result[key] = prop;
      continue;
    }

    for (const [innerKey, innerProp] of Object.entries(prop.properties ?? {})) {
      changed = true;
      result[`${key}'->'${innerKey}`] = innerProp as JSONSchema7;
    }
  }

  console.log('Flattened', props, 'into', result);

  if (!changed) {
    return props;
  } else {
    return flattenProperties(result);
  }
}
