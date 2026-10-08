import * as os from 'os';
import * as path from 'path';

/**
 * Per-user folders for machine state that doesn't belong in a checkout (so it survives
 * recreating the checkout, and is shared by the main checkout and the scheduled runner).
 */

/** `~/Library/Application Support/browse-dot-show` (override: `BDS_APP_SUPPORT_DIR`). */
export function appSupportDir(): string {
  return process.env.BDS_APP_SUPPORT_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'browse-dot-show');
}

/**
 * Logs from ingestion runs, manual and scheduled (override: `BDS_LOGS_DIR`):
 * `~/Library/Logs/browse-dot-show` on macOS (Console.app shows it), else
 * `~/.local/state/browse-dot-show/logs`.
 */
export function logsDir(): string {
  if (process.env.BDS_LOGS_DIR) return process.env.BDS_LOGS_DIR;
  return process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Logs', 'browse-dot-show')
    : path.join(os.homedir(), '.local', 'state', 'browse-dot-show', 'logs');
}
