import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Checks before a scheduled run. A failed check skips the run (logged and notified)
 * instead of letting the pipeline fail halfway through.
 */

export interface GuardResult {
  ok: boolean;
  label: string;
  detail: string;
}

export const MIN_FREE_DISK_GB = 20;
export const MIN_BATTERY_PERCENT = 50;

/** The local files folder exists, and this process can list and write it. */
export function checkLocalFiles(base: string, nodePath = process.execPath): GuardResult {
  const label = 'local files';
  if (!fs.existsSync(base)) {
    const volume = base.startsWith('/Volumes/') ? base.split('/').slice(0, 3).join('/') : null;
    return { ok: false, label, detail: `${base} doesn't exist${volume ? ` (is ${volume} mounted?)` : ''}` };
  }
  try {
    fs.readdirSync(base);
    const probeDir = path.join(base, 'locks');
    fs.mkdirSync(probeDir, { recursive: true });
    const probe = path.join(probeDir, `.write-probe-${process.pid}`);
    fs.writeFileSync(probe, '');
    fs.rmSync(probe);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const hint = code === 'EPERM' || code === 'EACCES'
      ? ` (grant Full Disk Access to ${nodePath}: System Settings → Privacy & Security → Full Disk Access)`
      : '';
    return { ok: false, label, detail: `can't read/write ${base}: ${(error as Error).message}${hint}` };
  }
  return { ok: true, label, detail: base };
}

export function evaluateFreeDisk(freeBytes: number, minGb = MIN_FREE_DISK_GB): GuardResult {
  const freeGb = freeBytes / 1024 ** 3;
  return {
    ok: freeGb >= minGb,
    label: 'free disk space',
    detail: `${freeGb.toFixed(0)} GB free${freeGb >= minGb ? '' : ` (need ${minGb} GB)`}`,
  };
}

export function checkFreeDisk(base: string, minGb = MIN_FREE_DISK_GB): GuardResult {
  try {
    const { bavail, bsize } = fs.statfsSync(base);
    return evaluateFreeDisk(bavail * bsize, minGb);
  } catch (error) {
    return { ok: false, label: 'free disk space', detail: `couldn't check: ${(error as Error).message}` };
  }
}

export interface PowerState {
  onAc: boolean;
  batteryPercent: number | null;
}

/** Parse `pmset -g batt`. A desktop Mac reports AC Power and no battery. */
export function parsePowerState(output: string): PowerState {
  const onAc = /Now drawing from 'AC Power'/.test(output);
  const percent = output.match(/(\d+)%/);
  return { onAc, batteryPercent: percent ? Number(percent[1]) : null };
}

export function evaluatePower(state: PowerState, minBattery = MIN_BATTERY_PERCENT): GuardResult {
  if (state.onAc) return { ok: true, label: 'power', detail: 'on AC power' };
  if (state.batteryPercent === null) return { ok: true, label: 'power', detail: 'unknown power source' };
  return {
    ok: state.batteryPercent >= minBattery,
    label: 'power',
    detail: `on battery at ${state.batteryPercent}%${state.batteryPercent >= minBattery ? '' : ` (need AC power or ${minBattery}%)`}`,
  };
}

export async function checkPower(): Promise<GuardResult> {
  try {
    const { stdout } = await execFileAsync('/usr/bin/pmset', ['-g', 'batt']);
    return evaluatePower(parsePowerState(stdout));
  } catch {
    return { ok: true, label: 'power', detail: "couldn't check (pmset unavailable)" };
  }
}

const NETWORK_PROBE_URL = 'https://sts.amazonaws.com/';

/**
 * Wait for the network, which can take a while after a scheduled wake. Any HTTP response
 * counts; only connection failures retry.
 */
export async function waitForNetwork(
  { timeoutMs = 3 * 60_000, intervalMs = 15_000, url = NETWORK_PROBE_URL } = {},
  onRetry?: (attempt: number, error: string) => void,
): Promise<GuardResult> {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  for (let attempt = 1; ; attempt++) {
    try {
      await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
      return { ok: true, label: 'network', detail: attempt === 1 ? 'reachable' : `reachable after ${attempt} attempts` };
    } catch (error) {
      lastError = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error);
    }
    if (Date.now() + intervalMs > deadline) break;
    onRetry?.(attempt, lastError);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return { ok: false, label: 'network', detail: `${new URL(url).host} unreachable for ${Math.round(timeoutMs / 1000)} s: ${lastError}` };
}
