/**
 * Graceful shutdown. Code that starts child processes registers a cleanup function; on
 * SIGINT (Ctrl+C) or SIGTERM (e.g. launchd stopping a job), every cleanup runs, then the
 * process exits with 130.
 */

type Cleanup = () => Promise<void> | void;

const cleanups = new Set<Cleanup>();
const CLEANUP_TIMEOUT_MS = 15_000;
let shuttingDown = false;

/** Register a cleanup function. Returns a function that unregisters it. */
export function onShutdown(cleanup: Cleanup): () => void {
  cleanups.add(cleanup);
  return () => cleanups.delete(cleanup);
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    // A second Ctrl+C exits immediately
    process.exit(130);
  }
  shuttingDown = true;
  console.log(`\n⚠️  ${signal === 'SIGINT' ? 'Cancelled' : `Received ${signal}`}; stopping…`);

  const timeout = new Promise(resolve => setTimeout(resolve, CLEANUP_TIMEOUT_MS).unref());
  await Promise.race([Promise.allSettled([...cleanups].map(cleanup => cleanup())), timeout]);
  process.exit(130);
}

/** Install the SIGINT/SIGTERM handlers. Call once, from the entry point. */
export function installShutdownHandlers(): void {
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
