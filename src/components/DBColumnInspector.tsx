import { DataTypeValue, EntityType } from '@/types';
import { Grid, Typography } from '@mui/material';
import { snakeCase } from 'change-case';
import { useCallback, useMemo, useState } from 'react';
import { Socket } from 'socket.io-client';

export default function DBColumnInspector({
  socket,
  db,
  table,
  column,
  dataType,
  entityType,
}: Readonly<{
  socket: Socket;
  db: string;
  table: string;
  column: string;
  dataType: string;
  entityType: EntityType | null;
}>) {
  const [analysis, setAnalysis] = useState<{
    scanned: number;
    total: number;
    finished: boolean;
    result?: unknown;
    resultRaw?: unknown;
  } | null>(null);

  const analyze = useCallback(() => {
    setAnalysis({ scanned: 0, total: 0, finished: false });
    socket.emit('analyze-jsonb', { db, table, column });

    socket.on(
      `analyze-jsonb-result-${db}-${table}-${column}`,
      async (result: { scanned: number; total: number; finished: boolean; result?: unknown }) => {
        if (result.finished) {
          socket.off(`analyze-jsonb-result-${db}-${table}-${column}`);

          setAnalysis({
            ...result,
            resultRaw: result.result,
            result: JSON.stringify(result.result, null, 2),
          });
        } else {
          setAnalysis(result);
        }
      },
    );
  }, [db, table, column, socket]);

  const actionButton = useMemo(() => {
    if (dataType === 'jsonb') {
      if (!analysis) {
        return <button onClick={analyze}>analyze</button>;
      }
      if (analysis.finished) {
        return (
          <>
            <button onClick={analyze}>re-analyze</button>
            <Typography>
              Scanned {analysis.scanned} of {analysis.total} records
              <Grid container>
                <Grid size={{ xs: 6 }}>
                  <fieldset>
                    <legend>Pretty interface</legend>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>{analysis.result as string}</pre>
                  </fieldset>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <fieldset>
                    <legend>Raw JSON schema (as guessed from data)</legend>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(analysis.resultRaw, null, 2)}</pre>
                  </fieldset>
                </Grid>
              </Grid>
            </Typography>
          </>
        );
      } else {
        return (
          <>
            <button disabled>
              analyzing ({analysis.scanned}/{analysis.total})
            </button>
            <button
              onClick={() => {
                socket.emit(`abort-analyze-jsonb-${db}-${table}-${column}`);
                setAnalysis(null);
              }}
            >
              abort
            </button>
          </>
        );
      }
    } else {
      return (
        <button
          disabled={!!entityType?.columns?.some((c) => c.name === column)}
          onClick={() =>
            socket.emit('add-column-from-db-inspector', {
              name: snakeCase(column),
              sourceAlias: entityType?.sources?.find((s) => s.type === 'db' && s.target === table)?.alias,
              dataType: {
                dataType: (() => {
                  switch (dataType) {
                    case 'character varying':
                    case 'text':
                      return DataTypeValue.stringType;
                    case 'uuid':
                      return DataTypeValue.rangedUUIDType;
                    case 'integer':
                    case 'bigint':
                    case 'smallint':
                      return DataTypeValue.integerType;
                    case 'numeric':
                    case 'double precision':
                      return DataTypeValue.numberType;
                    case 'date':
                    case 'timestamp without time zone':
                    case 'timestamp with time zone':
                      return DataTypeValue.dateType;
                    case 'boolean':
                      return DataTypeValue.booleanType;
                    default:
                      alert(
                        `I don't know how to handle ${dataType} yet! I've added it as a string for now, but you should fix this manually.`,
                      );
                      return DataTypeValue.stringType;
                  }
                })(),
              },
              queryable: !dataType.includes('[]'),
              visibleByDefault: false,
              isIdColumn: column === 'id',
              valueGetter: `:sourceAlias.${column}`,
              ...(dataType === 'boolean'
                ? {
                    values: [
                      { value: 'true', label: 'True' },
                      { value: 'false', label: 'False' },
                    ],
                  }
                : {}),
            })
          }
        >
          ✨auto-add✨
        </button>
      );
    }
  }, [dataType, analysis, entityType, column, db, table, socket, analyze]);

  return (
    <li>
      {column}: {dataType} {actionButton}
    </li>
  );
}
