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
