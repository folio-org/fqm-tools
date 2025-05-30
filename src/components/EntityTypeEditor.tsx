import { formatSql } from '@/src/utils/sqlUtils';
import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { Refresh, UnfoldLess, UnfoldMore } from '@mui/icons-material';
import { Alert, Button, Checkbox, FormControlLabel, Grid, IconButton, InputAdornment, TextField } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { Socket } from 'socket.io-client';
import { v4 as uuid } from 'uuid';
import { DataTypeValue, EntityType, EntityTypeField } from '../../types';
import { inferTranslationsFromField } from '../schema-conversion/translations';
import EntityTypeFieldEditor from './EntityTypeFieldEditor';
import JSONSchemaImporter from './Importer/JSONSchemaImporter';
import SourceEditor from './SourceEditor';

export default function EntityTypeManager({
  entityTypes,
  entityType: { file, data: initialValues },
  setCurrentEntityType,
  translations,
  schema,
  socket,
}: Readonly<{
  entityTypes: EntityType[];
  entityType: { file: string; data: EntityType };
  setCurrentEntityType: (n: EntityType | null) => void;
  translations: Record<string, string>;
  schema: Record<string, string[]>;
  socket: Socket;
}>) {
  const [entityType, setEntityType] = useState<EntityType>(initialValues);
  const [translationsBuffer, setTranslationsBuffer] = useState<Record<string, string>>({});

  useEffect(() => {
    socket.off('add-column-from-db-inspector-pong');
    socket.on('add-column-from-db-inspector-pong', (column: EntityTypeField) => {
      setEntityType((et) => {
        setTranslationsBuffer((tb) => ({ ...tb, ...inferTranslationsFromField(column, et.name) }));
        return { ...et, columns: [...(et.columns ?? []), column] };
      });
    });
  }, [socket]);

  useEffect(() => setCurrentEntityType(entityType), [entityType, setCurrentEntityType]);

  useEffect(() => {
    setEntityType({
      ...initialValues,
      sources: initialValues.sources ?? [],
      columns: initialValues.columns?.map((column) => ({
        ...column,
        valueGetter: column.valueGetter ? formatSql(column.valueGetter) : undefined,
        filterValueGetter: column.filterValueGetter ? formatSql(column.filterValueGetter) : undefined,
        valueFunction: column.valueFunction ? formatSql(column.valueFunction) : undefined,
      })),
    });

    setTranslationsBuffer({});
  }, [initialValues]);

  const effectiveTranslations = { ...translations, ...translationsBuffer };

  const codeMirrorExtension = useMemo(
    () =>
      sql({
        dialect: PostgreSQL,
        schema: schema,
        defaultSchema: 'TENANT_mod_fqm_manager',
        upperCaseKeywords: true,
      }),
    [schema],
  );

  const [hiddenColumns, setHiddenColumns] = useState<Record<string, boolean>>({});

  useEffect(
    () => setHiddenColumns(initialValues.columns?.reduce((acc, column) => ({ ...acc, [column.name]: true }), {}) ?? {}),
    [initialValues],
  );

  const [showImporter, setShowImporter] = useState(false);

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();

          socket.emit('save-entity-type', { file, entityType });
          socket.emit('update-translations', { entityType, newTranslations: translationsBuffer });

          socket.once('saved-entity-type', () => {
            window.alert('Saved!');
            // socket will cause state clearing by re-pushing list of entity types
            setTranslationsBuffer({});
          });
        }}
      >
        <fieldset>
          <legend>
            Entity type <code>{entityType.name}</code>
          </legend>

          <fieldset>
            <legend>Metadata</legend>

            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="ID"
                  fullWidth
                  value={entityType.id}
                  disabled
                  slotProps={{
                    htmlInput: { style: { fontFamily: 'monospace' } },
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setEntityType({ ...entityType, id: uuid() })}>
                            <Refresh />
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 8 }}>
                <TextField
                  label="Name"
                  required
                  fullWidth
                  value={entityType.name}
                  onChange={(e) => setEntityType({ ...entityType, name: e.target.value })}
                  slotProps={{ htmlInput: { style: { fontFamily: 'monospace' } } }}
                />
              </Grid>
              <Grid size={{ xs: 4 }} container sx={{ justifyContent: 'space-around' }}>
                <FormControlLabel
                  label="Private"
                  control={
                    <Checkbox
                      indeterminate={entityType.private === undefined}
                      checked={entityType.private}
                      onChange={(e) => setEntityType({ ...entityType, private: e.target.checked })}
                    />
                  }
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Translation (if applicable)"
                  fullWidth
                  onChange={(e) =>
                    setTranslationsBuffer({ ...translationsBuffer, [`entityType.${entityType.name}`]: e.target.value })
                  }
                  value={effectiveTranslations[`entityType.${entityType.name}`] ?? ''}
                />
              </Grid>
              {/* <Grid size={{ xs: 6 }}>
              <FormControl fullWidth>
                <InputLabel id="custom-field-select-label">Custom field entity type</InputLabel>
                <Select
                  labelId="custom-field-select-label"
                  fullWidth
                  value={entityType.customFieldEntityTypeId ?? ''}
                  onChange={(e) =>
                    e.target.value
                      ? setEntityType({ ...entityType, customFieldEntityTypeId: e.target.value })
                      : setEntityType({ ...entityType, customFieldEntityTypeId: undefined })
                  }
                >
                  <MenuItem value="">
                    <i>None</i>
                  </MenuItem>
                  {entityTypes.map((et) => (
                    <MenuItem key={et.id} value={et.id}>
                      {et.name} ({et.id})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid> */}
              <Grid size={{ xs: 12 }}>
                <fieldset>
                  <legend>Sources</legend>
                  {entityType.sources?.map((source, i) => (
                    <SourceEditor
                      key={i} // NOSONAR
                      entityTypes={entityTypes}
                      schema={schema}
                      source={source}
                      sources={entityType.sources ?? []}
                      isRoot={i === 0}
                      onChange={(newSource) =>
                        setEntityType({
                          ...entityType,
                          sources: entityType.sources?.map((s, j) => (j === i ? newSource : s)),
                        })
                      }
                      onRemove={() =>
                        setEntityType({ ...entityType, sources: entityType.sources!.filter((_, j) => j !== i) })
                      }
                    />
                  ))}
                  <Button
                    variant="outlined"
                    sx={{ width: '100%', height: '4em', mt: 2 }}
                    onClick={() =>
                      setEntityType({
                        ...entityType,
                        sources: [
                          ...(entityType.sources ?? []),
                          {
                            alias: '',
                            type: 'db',
                          },
                        ],
                      })
                    }
                  >
                    Add source
                  </Button>
                </fieldset>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <fieldset>
                  <legend>Columns</legend>

                  {entityType.columns?.map((column, i) =>
                    hiddenColumns[column.name] ? (
                      <fieldset
                        key={i} // NOSONAR
                      >
                        <legend>
                          <IconButton onClick={() => setHiddenColumns({ ...hiddenColumns, [column.name]: false })}>
                            <UnfoldMore fontSize="small" />
                          </IconButton>
                          &nbsp;
                          <span style={{ fontFamily: 'monospace' }}>{column.name}</span>
                        </legend>
                      </fieldset>
                    ) : (
                      <EntityTypeFieldEditor
                        key={i}
                        labelDecoration={
                          <>
                            <IconButton onClick={() => setHiddenColumns({ ...hiddenColumns, [column.name]: true })}>
                              <UnfoldLess fontSize="small" />
                            </IconButton>
                            &nbsp;
                          </>
                        }
                        parentName={entityType.name}
                        entityType={entityType}
                        entityTypes={entityTypes}
                        sources={entityType.sources ?? []}
                        codeMirrorExtension={codeMirrorExtension}
                        field={column}
                        onChange={(newColumn) =>
                          setEntityType((et) => ({
                            ...et,
                            columns: et.columns?.map((c, j) => (j === i ? newColumn : c)),
                          }))
                        }
                        translations={effectiveTranslations}
                        setTranslation={(key, value) => setTranslationsBuffer({ ...translationsBuffer, [key]: value })}
                        first={i === 0}
                        last={i === entityType.columns!.length - 1}
                        onDuplicate={() =>
                          setEntityType({
                            ...entityType,
                            columns: [
                              ...entityType.columns!,
                              {
                                ...column,
                                name: `${column.name}_copy`,
                              },
                            ],
                          })
                        }
                        onMoveUp={() => {
                          const newColumns = entityType.columns!;
                          newColumns[i] = entityType.columns![i - 1];
                          newColumns[i - 1] = column;
                          setEntityType({
                            ...entityType,
                            columns: newColumns,
                          });
                        }}
                        onMoveDown={() => {
                          const newColumns = entityType.columns!;
                          newColumns[i] = entityType.columns![i + 1];
                          newColumns[i + 1] = column;
                          setEntityType({
                            ...entityType,
                            columns: newColumns,
                          });
                        }}
                        onDelete={() =>
                          setEntityType({ ...entityType, columns: entityType.columns!.filter((_, j) => j !== i) })
                        }
                      />
                    ),
                  )}
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6 }}>
                      <Button
                        variant="outlined"
                        sx={{ width: '100%', height: '4em', mt: 2 }}
                        size="large"
                        onClick={() =>
                          setEntityType({
                            ...entityType,
                            columns: [
                              ...(entityType.columns ?? []),
                              { name: '', dataType: { dataType: DataTypeValue.stringType } },
                            ],
                          })
                        }
                      >
                        Add column
                      </Button>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Button
                        variant="outlined"
                        sx={{ width: '100%', height: '4em', mt: 2 }}
                        size="large"
                        onClick={() => setShowImporter(true)}
                      >
                        Import JSON schema
                      </Button>
                    </Grid>
                  </Grid>
                </fieldset>
              </Grid>
            </Grid>
          </fieldset>

          <Alert severity="warning" sx={{ mt: 1, mb: 1 }}>
            Comments, if any, will be removed from the JSON after saving the entity type here. Please double check your
            git diff carefully!
          </Alert>
          <Button type="submit" variant="contained" fullWidth>
            Save
          </Button>
        </fieldset>
      </form>
      {showImporter && (
        <JSONSchemaImporter
          entityType={entityType}
          onClose={() => setShowImporter(false)}
          onImport={(newColumns, newTranslations) => {
            setEntityType((et) => ({
              ...et,
              columns: [...(et.columns ?? []), ...newColumns],
            }));
            setTranslationsBuffer((t) => ({ ...t, ...newTranslations }));
          }}
        />
      )}
    </>
  );
}
