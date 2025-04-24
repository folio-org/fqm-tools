import { json } from '@codemirror/lang-json';
import { Done, Error, Pending, Schedule } from '@mui/icons-material';
import { Button, Typography } from '@mui/material';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { useCallback, useMemo, useState } from 'react';
import { Socket } from 'socket.io-client';
import { EntityType } from '../../types';
import JSONTable from './JSONTable';

enum State {
  NOT_STARTED,
  STARTED,
  PERSISTED,
  DONE,
  ERROR_PERSIST,
  ERROR_QUERY,
}

export default function QueryTool({
  socket,
  entityType,
}: Readonly<{
  socket: Socket;
  entityType: EntityType | null;
}>) {
  const [started, setStarted] = useState(new Date().getTime());
  const [ended, setEnded] = useState(new Date().getTime());
  const [state, setState] = useState<{ state: State; result?: string | Record<string, string>[] }>({
    state: State.NOT_STARTED,
  });

  const [query, setQuery] = useState<string>('{"id":{"$empty":false}}');

  const codeMirrorExtension = useMemo(() => json(), []);

  const run = useCallback(
    (entityType: EntityType, query: string) => {
      setState({ state: State.STARTED });

      socket.emit('run-query', { entityType, query });
      socket.on(
        'run-query-result',
        (result: { persisted?: boolean; queryError?: string; persistError?: string; queryResults?: string }) => {
          if (result.queryError || result.persistError || result.queryResults) {
            socket.off('run-query-result');
          }

          if (result.queryError) {
            setState({ state: State.ERROR_QUERY, result: result.queryError });
          } else if (result.persistError) {
            setState({ state: State.ERROR_PERSIST, result: result.persistError });
          } else if (result.queryResults) {
            setState({ state: State.DONE, result: result.queryResults });
            console.log(result.queryResults);
            setEnded(new Date().getTime());
          } else {
            setState({ state: State.PERSISTED });
            setStarted(new Date().getTime());
          }
        },
      );
    },
    [socket],
  );

  const runQueryIcon = useMemo(() => {
    if (state.state === State.NOT_STARTED || state.state === State.STARTED) {
      return <Pending color="disabled" />;
    } else if (state.state === State.PERSISTED) {
      return <Schedule color="warning" />;
    } else if (state.state === State.ERROR_PERSIST || state.state === State.ERROR_QUERY) {
      return <Error color="error" />;
    } else {
      return <Done color="success" />;
    }
  }, [state.state]);

  const persistIcon = useMemo(() => {
    if (state.state === State.NOT_STARTED) {
      return <Pending color="disabled" />;
    } else if (state.state === State.STARTED) {
      return <Schedule color="warning" />;
    } else if (state.state === State.ERROR_PERSIST) {
      return <Error color="error" />;
    } else {
      return <Done color="success" />;
    }
  }, [state.state]);

  if (entityType === null) {
    return <p>Select an entity type first</p>;
  }

  return (
    <>
      <Typography>Runs a query against the entity type.</Typography>

      <CodeMirror value={query} onChange={setQuery} extensions={[codeMirrorExtension, EditorView.lineWrapping]} />

      <Button variant="outlined" onClick={() => run(entityType, query)}>
        Run
      </Button>
      <Typography sx={{ display: 'flex', alignItems: 'center', gap: '0.5em', m: 2 }}>
        {persistIcon}
        Persist to database
      </Typography>
      <Typography sx={{ display: 'flex', alignItems: 'center', gap: '0.5em', m: 2 }}>
        {runQueryIcon} Run query {state.state === State.DONE ? `(${(ended - started) / 1000}s)` : ''}
      </Typography>
      {!!state.result &&
        (typeof state.result === 'string' ? <pre>{state.result}</pre> : <JSONTable data={state.result} />)}
    </>
  );
}
