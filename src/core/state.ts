import { builtInInfo, type ExpressLanesInfo, type FetchResult } from './models.ts';

/** What the Lambda saves after each try at reading WSDOT, and what /status sends. */
export interface ServerState {
  /** The last page that could be read. Null until one has been. */
  info: ExpressLanesInfo | null;
  /** When `info` was read from WSDOT */
  fetchedAt: number | null;
  /** When the Lambda last tried, good or bad */
  checkedAt: number | null;
  /** Why the last try failed */
  error: string | null;
  /** WSDOT's page loaded but couldn't be read. Stays set until a good page comes in. */
  pageChanged: boolean;
  /** What was wrong with the unreadable page */
  problems: string[];
}

export const EMPTY_STATE: ServerState = {
  info: null,
  fetchedAt: null,
  checkedAt: null,
  error: null,
  pageChanged: false,
  problems: [],
};

export function toFetchResult(state: ServerState): FetchResult {
  let info = state.info ?? builtInInfo();
  if (state.pageChanged) info = { ...info, warnings: [...info.warnings, ...state.problems] };
  const { fetchedAt, checkedAt } = state;
  return {
    info,
    source:
      state.info === null || fetchedAt === null
        ? { kind: 'builtIn' }
        : { kind: fetchedAt >= (checkedAt ?? 0) ? 'live' : 'cached', at: fetchedAt },
    error: state.error,
    pageChanged: state.pageChanged,
  };
}
