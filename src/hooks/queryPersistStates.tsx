import { Done, Error, Pending, Schedule } from '@mui/icons-material';
import { ReactNode, useMemo } from 'react';

export enum State {
  NOT_STARTED,
  STARTED,
  PERSISTED,
  DONE,
  ERROR_PERSIST,
  ERROR_QUERY,
}

export function useQueryPersistIcons(state: State) {
  return useMemo(
    () => ({
      persistIcon: (
        {
          [State.NOT_STARTED]: <Pending color="disabled" />,
          [State.STARTED]: <Schedule color="warning" />,
          [State.ERROR_PERSIST]: <Error color="error" />,
          [State.DONE]: <Done color="success" />,
        } as Record<State, ReactNode>
      )[state] ?? <Done color="success" />,
      queryIcon: {
        [State.NOT_STARTED]: <Pending color="disabled" />,
        [State.STARTED]: <Pending color="disabled" />,
        [State.PERSISTED]: <Schedule color="warning" />,
        [State.ERROR_PERSIST]: <Error color="error" />,
        [State.ERROR_QUERY]: <Error color="error" />,
        [State.DONE]: <Done color="success" />,
      }[state] ?? <Done color="success" />,
    }),
    [state],
  );
}
