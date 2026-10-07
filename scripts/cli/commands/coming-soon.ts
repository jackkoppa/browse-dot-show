import type { Command } from '../command.js';

/**
 * Placeholders for scheduled unattended runs on a Mac, planned for the next session
 * (scratchpad/scripts-overhaul/03-mac-automation.md). They reserve the command names.
 */
function comingSoon(path: string[], summary: string): Command {
  return {
    path,
    summary: `${summary} (coming soon)`,
    usage: `
USAGE
  pnpm bds ${path.join(' ')}

Not built yet. Scheduled, unattended runs on a Mac (LaunchDaemon + wake schedule) are
planned; see scratchpad/scripts-overhaul/03-mac-automation.md. Until then, run
\`pnpm bds ingest --all-sites\` manually.
`,
    async run() {
      console.log(`\n🚧 \`bds ${path.join(' ')}\` isn't built yet.`);
      console.log('   Scheduled runs are planned; see scratchpad/scripts-overhaul/03-mac-automation.md.');
      console.log('   For now, run: pnpm bds ingest --all-sites\n');
      return 2;
    },
  };
}

export const scheduleCommand = comingSoon(['schedule'], 'Schedule unattended ingestion runs on this Mac');
export const setupMachineCommand = comingSoon(['setup', 'machine'], 'Set up this Mac: tools, whisper model, local files, credentials');
