import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import prompts from 'prompts';
import { clearConfigCache, getLocalFilesBasePath } from '@browse-dot-show/config';
import { csv, parseFlags, positiveInt, UsageError } from '../../lib/args.js';
import { loadEnvFile } from '../../lib/env.js';
import { getDefaultTranscriptionWorkers, updateMachineConfig } from '../../lib/machine-config.js';
import { repoPath } from '../../lib/paths.js';
import {
  DEFAULT_WHISPER_MODEL,
  defaultHomebrewWhisperDir,
  ensureHomebrewWhisperLayout,
  findHomebrewWhisperCli,
  whisperModelUrl,
  whisperPaths,
} from '../../lib/whisper.js';
import { defaultNodePath } from '../../schedule/install.js';
import { isFileVaultOn, macAdvice, readPowerSettings } from '../../schedule/mac-settings.js';
import { loadNotifyTargets } from '../../schedule/notify.js';
import { audioMinutes, findMp3s, pickFiles, recommendWorkers, runBenchmark, type AudioFile, type BenchmarkResult } from '../../setup/benchmark.js';
import { setEnvValues } from '../../setup/env-file.js';
import { runProcess, type Command } from '../command.js';
import { doctorCommand } from './doctor.js';

const SETUP_FLAGS = {
  'local-files': { type: 'string' },
  'whisper-model': { type: 'string' },
  'skip-model-download': { type: 'boolean' },
  'automation-env': { type: 'string' },
  aws: { type: 'boolean' },
  yes: { type: 'boolean', short: 'y' },
  help: { type: 'boolean', short: 'h' },
} as const;

type Step = (log: (line: string) => void) => Promise<boolean>;

export const setupMachineCommand: Command = {
  path: ['setup', 'machine'],
  summary: 'Set up this Mac: local files, whisper + model, env files, then checks',
  usage: `
USAGE
  pnpm bds setup machine [options]

Run after ./scripts/bootstrap.sh (Homebrew packages, pnpm, build). Safe to re-run; each
step only changes what's missing:

  1. .local-files-config.json: where local files live (--local-files)
  2. .env.local: from the .env template; local whisper.cpp settings. With Homebrew's
     whisper-cli, WHISPER_CPP_PATH points to a checkout-like folder in
     ~/Library/Application Support/browse-dot-show/whisper.cpp
  3. The whisper model (~1.6 GB for large-v3-turbo), unless --skip-model-download
  4. .env.automation: present and chmod 600 (--automation-env copies one in, e.g. from
     another Mac); notification settings
  5. This Mac's settings for unattended runs: FileVault, sleep, restart after power loss,
     Full Disk Access (printed; you run any sudo commands)
  6. bds doctor (--aws also checks role assumption in every site account)

OPTIONS
  --local-files=<path>      Local files folder (e.g. /Volumes/<SSD>/browse-dot-show-local-files)
  --whisper-model=<name>    whisper model (default: ${DEFAULT_WHISPER_MODEL})
  --skip-model-download     Don't download the model; print the command instead
  --automation-env=<path>   Copy this file to .env.automation (chmod 600)
  --aws                     Also run the AWS checks in doctor (read-only: sts:AssumeRole)
  --yes, -y                 Don't ask before each change

Then: pnpm bds setup benchmark, and pnpm bds schedule install.
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, SETUP_FLAGS);
    const confirm = async (message: string): Promise<boolean> => {
      if (flags.yes || !ctx.interactive) return true;
      const { ok } = await prompts({ type: 'confirm', name: 'ok', message, initial: true });
      return Boolean(ok);
    };
    const model = flags['whisper-model'] ?? (loadEnvFile(repoPath('.env.local')).WHISPER_CPP_MODEL || DEFAULT_WHISPER_MODEL);

    const steps: [string, Step][] = [
      ['Local files', log => setupLocalFiles(flags['local-files'], ctx.interactive, confirm, log)],
      ['Transcription (.env.local, whisper.cpp)', log => setupWhisper(model, confirm, log)],
      ['Whisper model', log => setupWhisperModel(Boolean(flags['skip-model-download']), confirm, log)],
      ['Credentials and notifications (.env.automation)', log => setupAutomationEnv(flags['automation-env'], log)],
      ['This Mac', log => checkMacSettings(log)],
    ];

    let ok = true;
    for (const [title, step] of steps) {
      console.log(`\n━━ ${title}`);
      try {
        if (!(await step(line => console.log(`  ${line}`)))) ok = false;
      } catch (error) {
        console.log(`  ❌ ${error instanceof Error ? error.message : String(error)}`);
        ok = false;
      }
    }

    console.log('\n━━ Doctor');
    clearConfigCache();
    const doctorCode = await doctorCommand.run(flags.aws ? ['--aws'] : [], ctx);

    console.log(`\n${ok && doctorCode === 0 ? '✅ This Mac is set up.' : '⚠️  Some steps need attention (above).'}`);
    console.log('Next:');
    console.log(`  pnpm bds setup benchmark              # pick transcriptionWorkers for this Mac (now ${getDefaultTranscriptionWorkers()})`);
    console.log('  pnpm bds schedule install --at=03:00  # nightly runs (asks for sudo)');
    return ok && doctorCode === 0 ? 0 : 1;
  },
};

async function setupLocalFiles(
  flag: string | undefined,
  interactive: boolean,
  confirm: (message: string) => Promise<boolean>,
  log: (line: string) => void,
): Promise<boolean> {
  const configPath = repoPath('.local-files-config.json');
  let current: string | undefined;
  try {
    current = JSON.parse(fs.readFileSync(configPath, 'utf8')).localFilesPath;
  } catch {
    // no config yet
  }

  let target = flag ?? current;
  if (!target && interactive) {
    ({ target } = await prompts({
      type: 'text',
      name: 'target',
      message: 'Where should local files live? (an external SSD is fine, e.g. /Volumes/<SSD>/browse-dot-show-local-files)',
    }));
  }
  if (!target) {
    log('❌ No local files folder: pass --local-files=<path>');
    return false;
  }
  target = path.resolve(expandHome(target));

  if (target.startsWith('/Volumes/')) {
    const volume = target.split('/').slice(0, 3).join('/');
    if (!fs.existsSync(volume)) {
      log(`❌ ${volume} isn't mounted; plug in the drive and re-run`);
      return false;
    }
  }
  if (!fs.existsSync(target)) {
    if (!(await confirm(`Create ${target}?`))) return false;
    fs.mkdirSync(target, { recursive: true });
    log(`📁 Created ${target}`);
  }
  if (target !== current) {
    updateMachineConfig({ localFilesPath: target });
    log(`📝 .local-files-config.json: localFilesPath = ${target}`);
  }
  const sites = fs.existsSync(path.join(target, 's3', 'sites')) ? fs.readdirSync(path.join(target, 's3', 'sites')).length : 0;
  log(`✅ ${target}${sites ? ` (${sites} site folder(s))` : ' (empty: the first run downloads everything from S3)'}`);
  return true;
}

async function setupWhisper(model: string, confirm: (message: string) => Promise<boolean>, log: (line: string) => void): Promise<boolean> {
  const envPath = repoPath('.env.local');
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(repoPath('.env'), envPath);
    log('📝 Created .env.local from the .env template');
  }
  const env = loadEnvFile(envPath);
  const updates: Record<string, string> = {};
  if (env.WHISPER_API_PROVIDER !== 'local-whisper.cpp') updates.WHISPER_API_PROVIDER = 'local-whisper.cpp';
  if (env.WHISPER_CPP_MODEL !== model) updates.WHISPER_CPP_MODEL = model;

  const existing = env.WHISPER_CPP_PATH ? whisperPaths(env.WHISPER_CPP_PATH, model) : null;
  if (existing && fs.existsSync(existing.cli)) {
    log(`✅ whisper-cli: ${existing.cli}${existing.cliLinkTarget ? ` → ${existing.cliLinkTarget}` : ''}`);
  } else {
    const homebrewCli = findHomebrewWhisperCli();
    if (!homebrewCli) {
      log('❌ No whisper-cli: run ./scripts/bootstrap.sh (installs Homebrew whisper.cpp), or build whisper.cpp and set WHISPER_CPP_PATH');
      return false;
    }
    const dir = defaultHomebrewWhisperDir();
    if (!(await confirm(`Use Homebrew's whisper-cli (${homebrewCli}) via ${dir}?`))) return false;
    const paths = ensureHomebrewWhisperLayout(dir, homebrewCli, model);
    updates.WHISPER_CPP_PATH = dir;
    log(`🔗 ${paths.cli} → ${homebrewCli}`);
  }

  if (Object.keys(updates).length > 0) {
    fs.writeFileSync(envPath, setEnvValues(fs.readFileSync(envPath, 'utf8'), updates));
    for (const [key, value] of Object.entries(updates)) log(`📝 .env.local: ${key}=${value}`);
  }
  return true;
}

async function setupWhisperModel(skipDownload: boolean, confirm: (message: string) => Promise<boolean>, log: (line: string) => void): Promise<boolean> {
  const env = loadEnvFile(repoPath('.env.local'));
  if (!env.WHISPER_CPP_PATH) {
    log('⏭️  No WHISPER_CPP_PATH yet');
    return false;
  }
  const { model } = whisperPaths(env.WHISPER_CPP_PATH, env.WHISPER_CPP_MODEL);
  if (fs.existsSync(model)) {
    log(`✅ ${model} (${(fs.statSync(model).size / 1024 ** 3).toFixed(1)} GB)`);
    return true;
  }
  const url = whisperModelUrl(env.WHISPER_CPP_MODEL);
  const command = ['curl', '-L', '--fail', '--progress-bar', '-o', `${model}.download`, url];
  if (skipDownload) {
    log(`⏭️  Model missing. Download it with:\n    ${command.join(' ')} && mv '${model}.download' '${model}'`);
    return false;
  }
  if (!(await confirm(`Download ${path.basename(model)} (~1.6 GB for large-v3-turbo) from Hugging Face?`))) return false;
  fs.mkdirSync(path.dirname(model), { recursive: true });
  const code = await runProcess('curl', command.slice(1));
  if (code !== 0) {
    fs.rmSync(`${model}.download`, { force: true });
    log(`❌ Download failed (curl exit ${code})`);
    return false;
  }
  fs.renameSync(`${model}.download`, model);
  log(`✅ ${model}`);
  return true;
}

async function setupAutomationEnv(copyFromFlag: string | undefined, log: (line: string) => void): Promise<boolean> {
  const envPath = repoPath('.env.automation');
  const copyFrom = copyFromFlag && expandHome(copyFromFlag);
  if (copyFrom) {
    if (!fs.existsSync(copyFrom)) {
      log(`❌ --automation-env: ${copyFrom} doesn't exist`);
      return false;
    }
    if (fs.existsSync(envPath) && !fs.lstatSync(envPath).isSymbolicLink()) {
      fs.copyFileSync(envPath, `${envPath}.backup-${Date.now()}`);
      log('📝 Backed up the existing .env.automation');
    }
    fs.rmSync(envPath, { force: true });
    fs.copyFileSync(copyFrom, envPath);
    log(`📝 Copied ${copyFrom} to .env.automation`);
  }
  if (!fs.existsSync(envPath)) {
    log('❌ .env.automation is missing. Copy it from a Mac that has one (it holds the automation IAM user\'s keys;');
    log('   see docs/scheduled-ingestion.md), then re-run with --automation-env=<path> or put it at the repo root');
    return false;
  }
  const real = fs.realpathSync(envPath);
  if ((fs.statSync(real).mode & 0o077) !== 0) {
    fs.chmodSync(real, 0o600);
    log('🔒 chmod 600 .env.automation');
  }
  log('✅ .env.automation (keys are checked by doctor below)');

  const targets = loadNotifyTargets();
  log(`${targets.slackWebhookUrl ? '✅' : '⚠️ '} SLACK_WEBHOOK_URL${targets.slackWebhookUrl ? '' : ' not set: failed or skipped runs won\'t post to Slack'}`);
  log(`${targets.healthcheckPingUrl ? '✅' : '⚠️ '} HEALTHCHECK_PING_URL${targets.healthcheckPingUrl ? '' : ' not set: nothing alerts when a run doesn\'t happen'}`);
  if (!targets.slackWebhookUrl || !targets.healthcheckPingUrl) log('   How to create them: docs/scheduled-ingestion.md#notifications; test with: pnpm bds schedule test-notifications');
  return true;
}

async function checkMacSettings(log: (line: string) => void): Promise<boolean> {
  if (process.platform !== 'darwin') {
    log('⏭️  Not macOS');
    return true;
  }
  const advice = macAdvice({ fileVaultOn: await isFileVaultOn(), power: await readPowerSettings() });
  for (const item of advice) log(`${item.level === 'warn' ? '⚠️ ' : 'ℹ️ '} ${item.message}${item.fix ? `\n     Fix: ${item.fix}` : ''}`);
  if (advice.length === 0) log('✅ FileVault off, no sleep on power, restarts after a power failure');

  let base: string | null = null;
  try {
    base = getLocalFilesBasePath();
  } catch {
    // reported above
  }
  if (base?.startsWith('/Volumes/')) {
    const node = defaultNodePath();
    let real = node;
    try {
      real = fs.realpathSync(node);
    } catch {
      // keep the symlink path
    }
    log('ℹ️  Local files are on an external volume. A LaunchDaemon may need Full Disk Access to read it:');
    log('     System Settings → Privacy & Security → Full Disk Access → + → (⌘⇧G) this path:');
    log(`     ${real}`);
    log('     A scheduled run whose drive isn\'t readable is skipped and says so (Slack, bds schedule status).');
    if (real.includes('/Cellar/')) log('     That path changes when Homebrew upgrades node@22; consider `brew pin node@22` on the runner.');
  }
  return true;
}

export const setupBenchmarkCommand: Command = {
  path: ['setup', 'benchmark'],
  summary: 'Benchmark parallel transcription workers and pick transcriptionWorkers',
  usage: `
USAGE
  pnpm bds setup benchmark [--workers=1,2,3,4] [--minutes=60] [--save | --no-save]

Transcribes the same episodes (from the local files, read-only) with 1..N parallel
whisper-cli workers and reports audio minutes per minute for each. Recommends the
smallest worker count within 7% of the best, and offers to save it as
"transcriptionWorkers" in .local-files-config.json. Transcripts go to a temp folder.

Takes a while: it prefers episodes under 40 minutes, but needs 2 per worker (8 for 4
workers), so with 4 settings expect roughly 30–60 minutes on a base M4. With only
hour-long episodes it takes about 2 hours.

OPTIONS
  --workers=a,b,...   Worker counts to try (default: 1,2,3,4)
  --minutes=N         Audio minutes per setting, at least (default: 60; always at least 2 episodes per worker)
  --save              Save the recommendation without asking
  --no-save           Don't save
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, {
      workers: { type: 'string' },
      minutes: { type: 'string' },
      save: { type: 'boolean' },
      'no-save': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    });
    const workerCounts = (csv(flags.workers) ?? ['1', '2', '3', '4']).map(value => positiveInt('workers', value)!);
    const targetMinutes = positiveInt('minutes', flags.minutes) ?? 60;

    const env = loadEnvFile(repoPath('.env.local'));
    if (!env.WHISPER_CPP_PATH) throw new UsageError('WHISPER_CPP_PATH isn\'t set in .env.local; run `bds setup machine` first.');
    const { cli, model } = whisperPaths(env.WHISPER_CPP_PATH, env.WHISPER_CPP_MODEL);
    if (!fs.existsSync(cli) || !fs.existsSync(model)) throw new UsageError(`whisper-cli or the model is missing (${cli}, ${model}); run \`bds setup machine\` first.`);

    const sitesDir = path.join(getLocalFilesBasePath(), 's3', 'sites');
    // Two files per worker at the most workers, so every worker stays busy
    const minFiles = Math.max(...workerCounts) * 2;
    // Prefer shorter episodes: with 2 per worker, hour-long ones make each setting take 30+ min
    const SHORT_EPISODE_MINUTES = 40;
    const pick = (candidates: AudioFile[], maxMinutes?: number) => pickFiles(candidates, targetMinutes, minFiles, maxMinutes);
    const enough = (picked: AudioFile[]) => picked.length >= minFiles && picked.reduce((sum, f) => sum + f.minutes, 0) >= targetMinutes;
    const candidates: AudioFile[] = [];
    for (const file of findMp3s(sitesDir, 500)) {
      try {
        candidates.push({ path: file, minutes: await audioMinutes(file) });
      } catch {
        // unreadable file: skip
      }
      if (enough(pick(candidates, SHORT_EPISODE_MINUTES))) break;
    }
    const short = pick(candidates, SHORT_EPISODE_MINUTES);
    const files = enough(short) ? short : pick(candidates);
    const total = files.reduce((sum, file) => sum + file.minutes, 0);
    if (files.length === 0) throw new UsageError(`No episodes found under ${sitesDir}; run an ingestion first (or a pre-sync).`);
    if (files.length < minFiles) console.log(`⚠️  Only ${files.length} episode(s) found; results for more workers than that aren't meaningful`);

    const memoryGb = os.totalmem() / 1024 ** 3;
    console.log(`\n🎙️  ${files.length} episode(s), ${total.toFixed(0)} audio minutes, model ${env.WHISPER_CPP_MODEL}; ${os.cpus()[0]?.model ?? 'this Mac'}, ${memoryGb.toFixed(0)} GB RAM`);
    const results: BenchmarkResult[] = [];
    for (const workers of workerCounts) {
      if (workers * 2 > memoryGb * 0.75) console.log(`⚠️  ${workers} workers need about ${workers * 2} GB; this Mac has ${memoryGb.toFixed(0)} GB`);
      console.log(`\n▶️  ${workers} worker(s)`);
      let lastLogged = 0;
      const result = await runBenchmark({ cli, model, files, workers }, line => {
        // a line per file is plenty; avoid flooding non-TTY logs
        if (Date.now() - lastLogged > 2000) {
          console.log(line);
          lastLogged = Date.now();
        }
      });
      results.push(result);
      console.log(`   ${result.throughput.toFixed(1)} audio-min/min (${result.wallMinutes.toFixed(1)} min${result.failures ? `, ${result.failures} failed` : ''})`);
    }

    const base = results.find(result => result.workers === 1)?.throughput;
    console.log('\nworkers  audio-min/min  vs 1 worker');
    for (const result of results) {
      console.log(`${String(result.workers).padStart(7)}  ${result.throughput.toFixed(1).padStart(13)}  ${base ? `${(result.throughput / base).toFixed(2)}x` : ''}${result.failures ? `  (${result.failures} failed)` : ''}`);
    }
    const recommended = recommendWorkers(results);
    console.log(`\n💡 Recommended: transcriptionWorkers = ${recommended} (currently ${getDefaultTranscriptionWorkers()})`);

    let save = Boolean(flags.save);
    if (!save && !flags['no-save'] && ctx.interactive) {
      ({ save } = await prompts({ type: 'confirm', name: 'save', message: `Save transcriptionWorkers = ${recommended} in .local-files-config.json?`, initial: true }));
    }
    if (save) {
      updateMachineConfig({ transcriptionWorkers: recommended });
      console.log(`📝 Saved transcriptionWorkers = ${recommended}`);
    }
    return results.some(result => result.failures > 0) ? 1 : 0;
  },
};

/** `~/x` → `$HOME/x` (a shell doesn't always expand `~` after `--flag=`). */
function expandHome(value: string): string {
  return value.replace(/^~(?=\/|$)/, os.homedir());
}
