// Client-side logging utility
// See `/packages/logging` for server-side logging utility

import log, { LogLevelDesc } from 'loglevel';

// NOTE: This could move to a .env file, but it's simple enough to modify in-place here for now
const LOG_LEVEL: LogLevelDesc = 'info';

log.setLevel(LOG_LEVEL);

export { log };
