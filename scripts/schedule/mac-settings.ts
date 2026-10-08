import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Mac settings that decide whether unattended runs happen, read without sudo:
 *
 * - FileVault: after any reboot the disk stays locked until someone types a password, so
 *   nothing runs (not even LaunchDaemons). Decision for the dedicated runner: off.
 * - Sleep on AC power: a desktop runner shouldn't sleep (`sleep 0`). With sleep on, the
 *   scheduled wake still starts the run, and caffeinate keeps it awake while it runs.
 * - autorestart: power back on after a power failure.
 */

export interface MacPowerSettings {
  /** Minutes until system sleep on AC power; 0 = never. */
  sleepMinutes?: number;
  autorestart?: boolean;
}

/** Parse the `AC Power:` section of `pmset -g custom` (a desktop Mac has only that section). */
export function parsePmsetCustom(output: string): MacPowerSettings {
  const lines = output.split('\n');
  const start = lines.findIndex(line => line.startsWith('AC Power'));
  const section: string[] = [];
  for (const line of lines.slice(start === -1 ? 0 : start + 1)) {
    if (start !== -1 && /^\S/.test(line)) break;
    section.push(line);
  }
  const value = (key: string) => {
    const match = section.join('\n').match(new RegExp(`^\\s*${key}\\s+(\\d+)`, 'm'));
    return match ? Number(match[1]) : undefined;
  };
  const autorestart = value('autorestart');
  return { sleepMinutes: value('sleep'), autorestart: autorestart === undefined ? undefined : autorestart === 1 };
}

export async function readPowerSettings(): Promise<MacPowerSettings> {
  try {
    const { stdout } = await execFileAsync('/usr/bin/pmset', ['-g', 'custom']);
    return parsePmsetCustom(stdout);
  } catch {
    return {};
  }
}

/** True/false, or null if it couldn't be read. */
export async function isFileVaultOn(): Promise<boolean | null> {
  try {
    const { stdout } = await execFileAsync('/usr/bin/fdesetup', ['isactive']);
    return stdout.trim() === 'true';
  } catch (error) {
    // `fdesetup isactive` exits 1 when FileVault is off
    const stdout = (error as { stdout?: string }).stdout?.trim();
    return stdout === 'false' ? false : null;
  }
}

export interface MacFacts {
  fileVaultOn: boolean | null;
  power: MacPowerSettings;
}

export interface Advice {
  level: 'warn' | 'info';
  message: string;
  /** A command that fixes it (run by the developer; needs sudo). */
  fix?: string;
}

export function macAdvice(facts: MacFacts): Advice[] {
  const advice: Advice[] = [];
  if (facts.fileVaultOn) {
    advice.push({
      level: 'warn',
      message: 'FileVault is on: after a reboot (power cut, macOS update), nothing runs until someone logs in. ' +
        'On a dedicated runner, turn it off (System Settings → Privacy & Security → FileVault); on a development Mac you can ignore this.',
    });
  }
  if (facts.power.sleepMinutes !== undefined && facts.power.sleepMinutes !== 0) {
    advice.push({
      level: 'info',
      message: `The Mac sleeps after ${facts.power.sleepMinutes} min on power. The scheduled wake starts the run and caffeinate keeps it awake, but a desktop runner is most reliable never sleeping.`,
      fix: 'sudo pmset -c sleep 0',
    });
  }
  if (facts.power.autorestart === false) {
    advice.push({
      level: 'warn',
      message: "Automatic restart after a power failure is off, so after an outage the Mac stays off until someone turns it on.",
      fix: 'sudo pmset autorestart 1',
    });
  }
  return advice;
}
