import { Alert, Button, Checkbox, FormControlLabel, Typography } from '@mui/material';
import { useCallback, useState } from 'react';
import { Socket } from 'socket.io-client';
import { EntityType } from '../../types';
import { State, useQueryPersistIcons } from '../hooks/queryPersistStates';

export default function CheckFlattening({
  socket,
  entityType,
}: Readonly<{
  socket: Socket;
  entityType: EntityType | null;
}>) {
  const [state, setState] = useState<{ state: State; result?: string }>({ state: State.NOT_STARTED });
  const [includeHidden, setIncludeHidden] = useState(false);

  const { persistIcon, queryIcon } = useQueryPersistIcons(state.state);

  const run = useCallback(
    (entityType: EntityType) => {
      setState({ state: State.STARTED });

      socket.emit('check-entity-type-validity', { entityType, includeHidden });
      socket.on(
        'check-entity-type-validity-result',
        (result: {
          queried: boolean;
          persisted: boolean;
          queryError?: string;
          persistError?: string;
          queryResults?: string;
        }) => {
          if (result.queryError || result.persistError || result.queryResults) {
            socket.off('check-entity-type-validity-result');
          }

          if (result.queryError) {
            setState({ state: State.ERROR_QUERY, result: result.queryError });
          } else if (result.persistError) {
            setState({ state: State.ERROR_PERSIST, result: result.persistError });
          } else if (result.queryResults) {
            setState({ state: State.DONE, result: result.queryResults });
          } else {
            setState({ state: State.PERSISTED });
          }
        },
      );
    },
    [socket, includeHidden],
  );

  if (entityType === null) {
    return <p>Select an entity type first</p>;
  }

  return (
    <>
      <Typography>
        Checks that <code>mod-fqm-manager</code> can successfully parse and flatten the JSON representation of the
        entity type. Note that translations will not be updated here until the entity type is saved and the module is
        restarted.
      </Typography>

      <FormControlLabel
        label="Include hidden columns"
        control={<Checkbox checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} />}
      />

      <Button variant="outlined" onClick={() => run(entityType)}>
        Run
      </Button>

      <Typography sx={{ display: 'flex', alignItems: 'center', gap: '0.5em', m: 2 }}>
        {persistIcon} Persist to database
      </Typography>
      <Typography sx={{ display: 'flex', alignItems: 'center', gap: '0.5em', m: 2 }}>
        {queryIcon} Query <code>/entity-types/{entityType.id}</code>
      </Typography>

      {!!state.result && <pre>{state.result}</pre>}

      <Alert severity="info">
        Translations may not show correctly until the application is restarted, due to caching.
      </Alert>
    </>
  );
}
