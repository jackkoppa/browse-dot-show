import * as fs from 'fs';
import * as path from 'path';
import { repoPath } from './paths.js';
import { getSiteDirectory } from './sites.js';

/**
 * The env files used by scripts. Each call site names the one it needs:
 *
 * - `.env.local` (repo root): shared settings for local runs (whisper paths, etc.)
 * - `sites/<group>/<siteId>/.env.aws-sso`: a site's AWS SSO profile, for interactive prod actions
 * - `.env.automation` (repo root): the automation IAM user, for scheduled/unattended runs
 * - `packages/homepage/.env.aws-sso`: the homepage's AWS SSO profile
 */

export type EnvVars = Record<string, string>;

/**
 * Parse the contents of a `.env` file. Supports `KEY=VALUE`, blank lines, `#` comments,
 * an optional `export ` prefix, and single- or double-quoted values.
 */
export function parseEnv(content: string): EnvVars {
  const vars: EnvVars = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }

  return vars;
}

/** Load a `.env` file. Returns `{}` if it doesn't exist, unless `required` is set. */
export function loadEnvFile(filePath: string, { required = false } = {}): EnvVars {
  if (!fs.existsSync(filePath)) {
    if (required) throw new Error(`Environment file not found: ${filePath}`);
    return {};
  }
  return parseEnv(fs.readFileSync(filePath, 'utf8'));
}

/** Path to a site's `.env.aws-sso`, or null if the site doesn't exist. */
export function getSiteAwsEnvPath(siteId: string): string | null {
  const siteDir = getSiteDirectory(siteId);
  return siteDir ? path.join(siteDir, '.env.aws-sso') : null;
}

/**
 * Env vars for running a site's code: the site's `.env.aws-sso`, with gaps (missing or empty
 * values) filled from the root `.env.<rootEnv>` (default `.env.local`).
 */
export function loadSiteEnv(siteId: string, { rootEnv = 'local' }: { rootEnv?: string } = {}): EnvVars {
  const siteEnvPath = getSiteAwsEnvPath(siteId);
  if (!siteEnvPath) throw new Error(`Site directory for "${siteId}" not found`);

  const vars = loadEnvFile(siteEnvPath);
  for (const [key, value] of Object.entries(loadEnvFile(repoPath(`.env.${rootEnv}`)))) {
    if (!vars[key]) vars[key] = value;
  }
  return vars;
}

/** Env vars from `packages/homepage/.env.aws-sso`, merged over `process.env`. */
export function loadHomepageEnv(): EnvVars {
  const homepageVars = loadEnvFile(repoPath('packages/homepage/.env.aws-sso'), { required: true });
  return { ...definedProcessEnv(), ...homepageVars };
}

/** `process.env` without undefined values. */
export function definedProcessEnv(): EnvVars {
  const vars: EnvVars = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) vars[key] = value;
  }
  return vars;
}

export interface AutomationCredentials {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  SCHEDULED_RUN_MAIN_AWS_PROFILE: string;
}

const AUTOMATION_CREDENTIAL_KEYS: (keyof AutomationCredentials)[] = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'SCHEDULED_RUN_MAIN_AWS_PROFILE',
];

/**
 * Load the automation IAM user's credentials from `.env.automation` (repo root).
 * File-based on purpose: unattended runs can't use AWS SSO or the login keychain.
 * Throws if the file or any key is missing.
 */
export function loadAutomationCredentials(): AutomationCredentials {
  const filePath = repoPath('.env.automation');
  const vars = loadEnvFile(filePath, { required: true });

  const missing = AUTOMATION_CREDENTIAL_KEYS.filter(key => !vars[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required credential(s) in ${filePath}: ${missing.join(', ')}`);
  }

  return Object.fromEntries(AUTOMATION_CREDENTIAL_KEYS.map(key => [key, vars[key]])) as unknown as AutomationCredentials;
}
