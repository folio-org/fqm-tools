import { inferFieldFromSchema } from '@/src/schema-conversion/field-processing/field';
import { inferTranslationsFromColumn } from '@/src/schema-conversion/field-processing/translations';
import { EntityType, EntityTypeField } from '@/types';
import { json } from '@codemirror/lang-json';
import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { Alert, Button, DialogActions, DialogContent, Typography } from '@mui/material';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { JSONSchema7 } from 'json-schema';
import json5 from 'json5';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import EntityTypeFieldEditor from '../EntityTypeFieldEditor';
import { END_PAGE, State } from './JSONSchemaImporterStates';

export default function ImportStep({
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
  const prop = Object.keys(state.schema!.properties)[state.page];
  const propSchema = state.schema!.properties[prop] as JSONSchema7;

  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const [provisionalIssues, setProvisionalIssues] = useState<string[]>([]);
  const [provisionalColumn, setProvisionalColumn] = useState<EntityTypeField | null>(null);
  const [provisionalTranslations, setProvisionalTranslations] = useState<Record<string, string>>({});

  useEffect(() => {
    console.log(overrides);
    if (prop === undefined) {
      setState((s) => ({ ...s, page: END_PAGE }));
      return;
    }
    if (!(prop in overrides)) {
      setOverrides({ [prop]: JSON.stringify({ _name: prop, ...propSchema }, null, 2) });
    }
    let resolvedSchema = propSchema;
    if (prop in overrides) {
      try {
        resolvedSchema = json5.parse(overrides[prop]);
      } catch (e) {
        console.error('Invalid JSON', e);
      }
    }
    const { issues, field } = inferFieldFromSchema(
      prop,
      resolvedSchema,
      {
        name: '',
        schema: '',
        permissions: [],
        source: state.source,
        sort: ['', ''],
      },
      {
        entityTypes: [],
        sources: [],
        metadata: {
          module: '???',
          team: '',
          domain: 'erm',
        },
      },
    );
    const translations = inferTranslationsFromColumn(field, entityType.name);
    setProvisionalIssues(issues);
    setProvisionalColumn(field ?? null);
    setProvisionalTranslations(translations);
  }, [prop, overrides, propSchema, entityType, state.source, setState]);

  return (
    <>
      <DialogContent>
        <fieldset>
          <legend>Raw schema</legend>
          <CodeMirror
            value={overrides[prop]}
            onChange={(nv) => setOverrides({ [prop]: nv })}
            extensions={[json(), EditorView.lineWrapping]}
          />
        </fieldset>
        {provisionalIssues.length > 0 && (
          <Alert severity="warning">
            <Typography>
              The following issues were encountered while trying to infer the column from the schema:
              <ul>
                {provisionalIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              If the column is not displayed below, then these error(s) were catastrophic.
            </Typography>
          </Alert>
        )}
        The below is <strong>for preview only</strong>. If you wish to edit it, wait until after import.
        <div style={{ pointerEvents: 'none' }}>
          {provisionalColumn && (
            <EntityTypeFieldEditor
              parentName={entityType.name}
              entityType={entityType}
              entityTypes={[]}
              sources={[]}
              codeMirrorExtension={sql({
                dialect: PostgreSQL,
                upperCaseKeywords: true,
              })}
              field={provisionalColumn}
              onChange={() => ({})}
              translations={provisionalTranslations}
              setTranslation={() => ({})}
              first={true}
              last={true}
              onDuplicate={() => ({})}
              onMoveUp={() => ({})}
              onMoveDown={() => ({})}
              onDelete={() => ({})}
            />
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="error">
          Cancel
        </Button>
        <Button onClick={() => setState((s) => ({ ...s, page: s.page + 1 }))}>Skip</Button>
        {provisionalColumn && (
          <Button
            onClick={() =>
              setState((s) => ({
                ...s,
                page: s.page + 1,
                columns: [...s.columns, provisionalColumn],
                warnings: [...s.warnings, ...provisionalIssues.map((e) => `${provisionalColumn.name}: ${e}`)],
                translations: { ...s.translations, ...provisionalTranslations },
              }))
            }
          >
            Next
          </Button>
        )}
      </DialogActions>
    </>
  );
}
