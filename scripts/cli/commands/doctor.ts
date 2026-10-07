import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getLocalFilesBasePath } from '@browse-dot-show/config';
import { parseFlags } from '../../lib/args.js';
import { getSiteAwsEnvPath, loadAutomationCredentials, loadEnvFile } from '../../lib/env.js';
import { repoPath } from '../../lib/paths.js';
import { assumeSiteRole, loadSiteAccountMappings } from '../../lib/site-accounts.js';
import { discoverSites } from '../../lib/sites.js';
import type { Command } from '../command.js';

type Status = 'ok' | 'warn' | 'fail';
interface Check {
  status: Status;
  label: string;
  detail?: string;
}

const ICONS: Record<Status, string> = { ok: '✅', warn: '⚠️ ', fail: '❌' };
const MIN_FREE_DISK_GB = 50;
const MIN_NODE_MAJOR = 22;

function which(command: string): string | null {
  try {
    return execFileSync('/usr/bin/which', [command], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

function checkTools(): Check[] {
  const checks: Check[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    status: nodeMajor >= MIN_NODE_MAJOR ? 'ok' : 'fail',
    label: `node ${process.versions.node}`,
    detail: `${process.execPath}${nodeMajor >= MIN_NODE_MAJOR ? '' : ` (need ${MIN_NODE_MAJOR}+)`}`,
  });

  const tools: [string, Status, string][] = [
    ['pnpm', 'fail', 'installs and runs workspace packages'],
    ['aws', 'fail', 'S3 sync, role assumption, CloudFront'],
    ['ffmpeg', 'fail', 'audio splitting for transcription'],
    ['ffprobe', 'fail', 'audio durations'],
    ['git', 'warn', 'worktrees'],
    ['terraform', 'warn', 'only needed to deploy'],
  ];
  for (const [tool, missingStatus, purpose] of tools) {
    const found = which(tool);
    checks.push(found ? { status: 'ok', label: tool, detail: found } : { status: missingStatus, label: tool, detail: `not on PATH (${purpose})` });
  }
  return checks;
}

function checkWhisper(): Check[] {
  const env = loadEnvFile(repoPath('.env.local'));
  if (Object.keys(env).length === 0) {
    return [{ status: 'fail', label: '.env.local', detail: 'missing or empty (copy the tracked .env template to .env.local)' }];
  }

  const provider = env.WHISPER_API_PROVIDER || 'openai';
  if (provider !== 'local-whisper.cpp') {
    return [{ status: 'warn', label: 'whisper', detail: `WHISPER_API_PROVIDER=${provider} (local runs normally use local-whisper.cpp)` }];
  }

  const dir = env.WHISPER_CPP_PATH;
  if (!dir || !fs.existsSync(dir)) return [{ status: 'fail', label: 'whisper.cpp', detail: `WHISPER_CPP_PATH not found: ${dir || '(unset)'}` }];

  const cli = path.join(dir, 'build/bin/whisper-cli');
  const model = path.join(dir, 'models', `ggml-${env.WHISPER_CPP_MODEL}.bin`);
  return [
    fs.existsSync(cli) ? { status: 'ok', label: 'whisper-cli', detail: cli } : { status: 'fail', label: 'whisper-cli', detail: `not found: ${cli} (build whisper.cpp)` },
    fs.existsSync(model) ? { status: 'ok', label: 'whisper model', detail: model } : { status: 'fail', label: 'whisper model', detail: `not found: ${model}` },
  ];
}

function checkLocalFiles(): Check[] {
  let base: string;
  try {
    base = getLocalFilesBasePath();
  } catch (error) {
    return [{ status: 'fail', label: 'local files', detail: error instanceof Error ? error.message : String(error) }];
  }
  if (!fs.existsSync(base)) return [{ status: 'fail', label: 'local files', detail: `${base} doesn't exist (is the drive mounted?)` }];

  const checks: Check[] = [{ status: 'ok', label: 'local files', detail: base }];
  try {
    const { bavail, bsize } = fs.statfsSync(base);
    const freeGb = (bavail * bsize) / 1024 ** 3;
    checks.push({
      status: freeGb >= MIN_FREE_DISK_GB ? 'ok' : 'warn',
      label: 'free disk space',
      detail: `${freeGb.toFixed(0)} GB free${freeGb >= MIN_FREE_DISK_GB ? '' : ` (under ${MIN_FREE_DISK_GB} GB)`}`,
    });
  } catch {
    // statfs isn't available everywhere; skip the disk check
  }
  if (base.startsWith('/Volumes/')) {
    checks.push({
      status: 'warn',
      label: 'local files on an external volume',
      detail: 'unattended runs need Full Disk Access to read removable volumes, and the drive must be mounted',
    });
  }
  return checks;
}

function checkCredentialsAndSites(): Check[] {
  const checks: Check[] = [];

  try {
    loadAutomationCredentials();
    const mode = fs.statSync(repoPath('.env.automation')).mode & 0o777;
    checks.push(
      mode & 0o077
        ? { status: 'warn', label: '.env.automation', detail: `readable by others (mode ${mode.toString(8)}); run: chmod 600 .env.automation` }
        : { status: 'ok', label: '.env.automation', detail: 'all keys present' }
    );
  } catch (error) {
    checks.push({ status: 'fail', label: '.env.automation', detail: error instanceof Error ? error.message : String(error) });
  }

  const sites = discoverSites();
  let mappings: ReturnType<typeof loadSiteAccountMappings> = {};
  try {
    mappings = loadSiteAccountMappings();
  } catch (error) {
    checks.push({ status: 'fail', label: '.site-account-mappings.json', detail: error instanceof Error ? error.message : String(error) });
  }

  const unmapped = sites.filter(site => !mappings[site.id]?.accountId || !mappings[site.id]?.bucketName);
  const noCloudFront = sites.filter(site => mappings[site.id] && !mappings[site.id].cloudfrontId);
  const noSsoEnv = sites.filter(site => {
    const envPath = getSiteAwsEnvPath(site.id);
    return !envPath || !fs.existsSync(envPath);
  });

  checks.push(
    unmapped.length === 0
      ? { status: 'ok', label: 'site account mappings', detail: `all ${sites.length} sites have an account and bucket` }
      : { status: 'fail', label: 'site account mappings', detail: `missing for: ${unmapped.map(s => s.id).join(', ')}` }
  );
  if (noCloudFront.length > 0) {
    checks.push({ status: 'warn', label: 'CloudFront IDs', detail: `missing for: ${noCloudFront.map(s => s.id).join(', ')}` });
  }
  if (noSsoEnv.length > 0) {
    checks.push({ status: 'warn', label: '.env.aws-sso', detail: `missing for: ${noSsoEnv.map(s => s.id).join(', ')} (needed for deploys)` });
  }
  return checks;
}

/** Read-only: assume the automation role once per site account. */
async function checkAwsAccess(): Promise<Check[]> {
  let credentials;
  try {
    credentials = loadAutomationCredentials();
  } catch (error) {
    return [{ status: 'fail', label: 'AWS access', detail: error instanceof Error ? error.message : String(error) }];
  }

  const mappings = loadSiteAccountMappings();
  const sitesByAccount = new Map<string, string[]>();
  for (const site of discoverSites()) {
    const accountId = mappings[site.id]?.accountId;
    if (accountId) sitesByAccount.set(accountId, [...(sitesByAccount.get(accountId) ?? []), site.id]);
  }

  const checks: Check[] = [];
  for (const [accountId, siteIds] of sitesByAccount) {
    try {
      await assumeSiteRole(siteIds[0], credentials, `doctor-${Date.now()}`);
      checks.push({ status: 'ok', label: `assume role in ${accountId}`, detail: siteIds.join(', ') });
    } catch (error) {
      checks.push({ status: 'fail', label: `assume role in ${accountId}`, detail: `${siteIds.join(', ')}: ${error instanceof Error ? error.message.trim() : String(error)}` });
    }
  }
  return checks;
}

export const doctorCommand: Command = {
  path: ['doctor'],
  summary: 'Check tools, whisper, local files, credentials and site config',
  usage: `
USAGE
  pnpm bds doctor [--aws]

OPTIONS
  --aws     Also check that the automation user can assume the automation role in every
            site account (read-only: sts:AssumeRole, nothing else)

Exits with code 1 if any check fails.
`,
  async run(argv) {
    const flags = parseFlags(argv, { aws: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } });

    const sections: [string, Check[] | Promise<Check[]>][] = [
      ['Tools', checkTools()],
      ['Transcription', checkWhisper()],
      ['Local files', checkLocalFiles()],
      ['Credentials and sites', checkCredentialsAndSites()],
    ];
    if (flags.aws) sections.push(['AWS access', checkAwsAccess()]);

    let failures = 0;
    let warnings = 0;
    for (const [title, pending] of sections) {
      console.log(`\n${title}`);
      for (const check of await pending) {
        console.log(`  ${ICONS[check.status]} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`);
        if (check.status === 'fail') failures++;
        if (check.status === 'warn') warnings++;
      }
    }

    console.log(`\n${failures === 0 ? '✅' : '❌'} ${failures} failed, ${warnings} warning(s)${flags.aws ? '' : ' (add --aws to check AWS access)'}`);
    return failures === 0 ? 0 : 1;
  },
};
