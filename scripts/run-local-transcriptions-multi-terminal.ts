#!/usr/bin/env tsx

/**
 * Multi-Terminal Local Transcription Runner
 *
 * This script runs audio transcription across multiple terminal windows for parallel processing.
 * It calculates the total untranscribed audio duration upfront and tracks progress against that baseline.
 *
 * Features:
 * - Interactive site selection (a single site, or all sites at once)
 * - Configurable terminal count (default: 3)
 * - Untranscribed files are balanced across terminals by duration, regardless of site
 * - Progress tracking based on untranscribed audio only
 * - ETA estimation based on transcription speed
 * - Real-time progress monitoring across terminals
 *
 * When running for multiple sites, each terminal processes its assigned files one site at a time
 * (the process-audio lambda only handles a single SITE_ID per run).
 *
 * Usage: pnpm run ingestion:run-local-transcriptions:multi-terminal
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLocalS3SitePath } from '@browse-dot-show/config';
import { execSync } from 'child_process';
import prompts from 'prompts';
import { discoverSites } from './lib/sites.js';
import { MultiTerminalRunner, ProcessConfig } from './utils/multi-terminal-runner.js';

const ALL_SITES = '__all__';

interface AudioFileInfo {
  siteId: string;
  filename: string;
  fullPath: string;
  durationMinutes?: number;
  hasTranscript: boolean;
}

interface SiteTranscriptionStatus {
  siteId: string;
  siteTitle: string;
  totalAudioFiles: number;
  untranscribedFiles: AudioFileInfo[];
  untranscribedDurationMinutes: number;
}

interface TranscriptionSession {
  sites: SiteTranscriptionStatus[];
  untranscribedFiles: AudioFileInfo[];
  untranscribedDurationMinutes: number;
  terminalCount: number;
}

class TranscriptionMultiTerminalRunner extends MultiTerminalRunner {
  private session: TranscriptionSession;

  constructor(session: TranscriptionSession, updateIntervalSeconds: number = 10) {
    super(session.terminalCount, updateIntervalSeconds);
    this.session = session;
  }

  /**
   * Create process configurations for real transcription commands.
   * Each terminal runs a generated shell script that invokes the process-audio lambda
   * once per site that has files assigned to that terminal.
   */
  protected createProcessConfigs(): ProcessConfig[] {
    const configs: ProcessConfig[] = [];
    const projectDir = process.cwd();

    const filesPerTerminal = this.distributeFilesAcrossTerminals();

    for (let i = 0; i < this.session.terminalCount; i++) {
      const processId = `transcription-${i + 1}`;
      const logFile = path.join(this.logDir, `${processId}.log`);
      const terminalFiles = filesPerTerminal[i];

      if (terminalFiles.length === 0) {
        console.log(`⚠️  Terminal ${i + 1} has no files to process - reducing terminal count`);
        continue;
      }

      const terminalDuration = sumDuration(terminalFiles);

      // Group this terminal's files by site, preserving the session's site order
      const filesBySite = new Map<string, AudioFileInfo[]>();
      for (const site of this.session.sites) {
        const siteFiles = terminalFiles.filter(f => f.siteId === site.siteId);
        if (siteFiles.length > 0) {
          filesBySite.set(site.siteId, siteFiles);
        }
      }

      const scriptLines = ['#!/usr/bin/env bash', `cd "${projectDir}"`];
      for (const [siteId, siteFiles] of filesBySite) {
        // Write file list to a temporary file instead of an environment variable
        // This avoids shell command line length limits with large file lists
        const fileListPath = path.join(this.logDir, `${processId}-${siteId}-files.txt`);
        fs.writeFileSync(fileListPath, siteFiles.map(f => f.filename).join('\n'), 'utf8');

        scriptLines.push(
          `echo "🎙️  Starting ${siteId} (${siteFiles.length} files)"`,
          [
            `SITE_ID="${siteId}"`,
            `TERMINAL_TOTAL_MINUTES="${sumDuration(siteFiles)}"`,
            `TERMINAL_FILE_LIST_PATH="${fileListPath}"`,
            'pnpm bds lambda run',
            `--sites=${siteId}`,
            '--lambda=process-audio',
            '--env=local'
          ].join(' ')
        );
      }

      const runScriptPath = path.join(this.logDir, `${processId}.sh`);
      fs.writeFileSync(runScriptPath, scriptLines.join('\n') + '\n', 'utf8');

      configs.push({
        id: processId,
        command: 'bash',
        args: [`"${runScriptPath}"`],
        logFile,
        totalMinutes: terminalDuration,
        expectedSiteIds: [...filesBySite.keys()],
        env: {
          NODE_OPTIONS: '--max-old-space-size=9728',
          PROCESS_ID: processId,
          LOG_FILE: logFile,
          TERMINAL_INDEX: i.toString(),
          TOTAL_TERMINALS: this.session.terminalCount.toString()
        }
      });
    }

    return configs;
  }

  /**
   * Distribute files across terminals, balanced by audio duration.
   * Longest files are assigned first, each to the terminal with the least total duration so far.
   */
  private distributeFilesAcrossTerminals(): AudioFileInfo[][] {
    const filesPerTerminal: AudioFileInfo[][] = Array.from({ length: this.session.terminalCount }, () => []);
    const minutesPerTerminal: number[] = Array.from({ length: this.session.terminalCount }, () => 0);

    const sortedFiles = [...this.session.untranscribedFiles].sort(
      (a, b) => (b.durationMinutes || 0) - (a.durationMinutes || 0)
    );

    for (const file of sortedFiles) {
      const terminalIndex = minutesPerTerminal.indexOf(Math.min(...minutesPerTerminal));
      filesPerTerminal[terminalIndex].push(file);
      // Count zero-duration files (ffprobe failures) as 1 minute so they still spread out
      minutesPerTerminal[terminalIndex] += file.durationMinutes || 1;
    }

    return filesPerTerminal;
  }
}

function sumDuration(files: AudioFileInfo[]): number {
  return files.reduce((sum, file) => sum + (file.durationMinutes || 0), 0);
}

function formatHours(minutes: number): string {
  return `${Math.round(minutes / 60 * 10) / 10} hours`;
}

/**
 * Get audio duration from file metadata using ffprobe
 */
function getAudioDuration(filePath: string): number {
  try {
    // Use ffprobe to get duration in seconds
    const result = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf8' }
    );
    const durationSeconds = parseFloat(result.trim());
    return Math.round(durationSeconds / 60 * 100) / 100; // Convert to minutes, round to 2 decimal places
  } catch (error) {
    console.warn(`⚠️  Could not get duration for ${path.basename(filePath)}: ${error}`);
    return 0;
  }
}

/**
 * Check if transcript exists for an audio file
 */
function hasExistingTranscript(audioPath: string): boolean {
  // Convert audio path to transcript path
  const audioDir = path.dirname(audioPath);
  const basename = path.basename(audioPath, path.extname(audioPath));

  // Replace 'audio' with 'transcripts' in the path
  const transcriptDir = audioDir.replace('/audio/', '/transcripts/');
  const transcriptPath = path.join(transcriptDir, `${basename}.srt`);

  return fs.existsSync(transcriptPath);
}

/**
 * Scan a site's audio files and determine which need transcription
 */
function analyzeSiteTranscriptionStatus(siteId: string, siteTitle: string): SiteTranscriptionStatus {
  const audioDir = getLocalS3SitePath(siteId, 'audio');

  const allAudioFiles: AudioFileInfo[] = [];
  const untranscribedFiles: AudioFileInfo[] = [];

  if (!fs.existsSync(audioDir)) {
    console.warn(`⚠️  [${siteId}] Audio directory not found: ${audioDir}`);
    return { siteId, siteTitle, totalAudioFiles: 0, untranscribedFiles, untranscribedDurationMinutes: 0 };
  }

  console.log(`🔍 [${siteId}] Scanning for audio files and existing transcripts...`);

  // Recursively find all .mp3 files
  function scanDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.mp3')) {
        const fileInfo: AudioFileInfo = {
          siteId,
          filename: entry.name,
          fullPath,
          hasTranscript: hasExistingTranscript(fullPath)
        };

        allAudioFiles.push(fileInfo);

        if (!fileInfo.hasTranscript) {
          // Get duration for untranscribed files
          console.log(`📊 [${siteId}] Calculating duration for: ${entry.name}`);
          fileInfo.durationMinutes = getAudioDuration(fullPath);
          untranscribedFiles.push(fileInfo);
        }
      }
    }
  }

  scanDirectory(audioDir);

  return {
    siteId,
    siteTitle,
    totalAudioFiles: allAudioFiles.length,
    untranscribedFiles,
    untranscribedDurationMinutes: sumDuration(untranscribedFiles)
  };
}

/**
 * Analyze transcription status for all selected sites, and print a per-site breakdown
 */
function analyzeTranscriptionStatus(siteIds: string[]): TranscriptionSession {
  const allSites = discoverSites();

  const siteStatuses = siteIds.map(siteId => {
    const site = allSites.find(s => s.id === siteId);
    return analyzeSiteTranscriptionStatus(siteId, site?.title || siteId);
  });

  const untranscribedFiles = siteStatuses.flatMap(s => s.untranscribedFiles);
  const untranscribedDurationMinutes = sumDuration(untranscribedFiles);
  const totalAudioFiles = siteStatuses.reduce((sum, s) => sum + s.totalAudioFiles, 0);

  console.log('\n📈 Transcription Analysis:');
  if (siteStatuses.length > 1) {
    const idWidth = Math.max(...siteStatuses.map(s => s.siteId.length));
    for (const site of siteStatuses) {
      console.log(
        `   ${site.siteId.padEnd(idWidth)}  ` +
        `${String(site.untranscribedFiles.length).padStart(4)} / ${String(site.totalAudioFiles).padEnd(4)} files need transcription  ` +
        `(${formatHours(site.untranscribedDurationMinutes)})`
      );
    }
    console.log('');
  }
  console.log(`   Total audio files: ${totalAudioFiles}`);
  console.log(`   Already transcribed: ${totalAudioFiles - untranscribedFiles.length}`);
  console.log(`   Needs transcription: ${untranscribedFiles.length}`);
  console.log(`   Untranscribed duration: ${Math.round(untranscribedDurationMinutes)} minutes (${formatHours(untranscribedDurationMinutes)})`);

  if (untranscribedFiles.length === 0) {
    throw new Error('🎉 All audio files already have transcripts! Nothing to process.');
  }

  return {
    // Only keep sites that actually have work to do
    sites: siteStatuses.filter(s => s.untranscribedFiles.length > 0),
    untranscribedFiles,
    untranscribedDurationMinutes,
    terminalCount: 3 // Will be updated by user prompt
  };
}

/**
 * Interactive prompts for user configuration
 */
async function getUserConfiguration(): Promise<{ siteIds: string[]; terminalCount: number }> {
  console.log('🔧 Multi-Terminal Local Transcription Setup');
  console.log('='.repeat(50));

  // Site selection
  const sites = discoverSites();
  if (sites.length === 0) {
    throw new Error('❌ No sites found! Please create a site first.');
  }

  const siteChoices = [
    { title: `All sites (${sites.length})`, value: ALL_SITES },
    ...sites.map(site => ({
      title: `${site.id} (${site.title})`,
      value: site.id
    }))
  ];

  const siteResponse = await prompts({
    type: 'select',
    name: 'siteId',
    message: 'Which site do you want to transcribe?',
    choices: siteChoices,
    initial: 0
  });

  if (!siteResponse.siteId) {
    process.exit(0);
  }

  const siteIds = siteResponse.siteId === ALL_SITES
    ? sites.map(site => site.id)
    : [siteResponse.siteId];

  // Terminal count
  const terminalResponse = await prompts({
    type: 'number',
    name: 'terminalCount',
    message: 'How many terminal windows?',
    initial: 3,
    min: 1,
    max: 8,
    validate: (value: any) => {
      // Handle empty/undefined value (when user presses Enter) - use default
      if (value === undefined || value === null || value === '') {
        return true; // Accept default
      }
      const num = Number(value);
      if (isNaN(num) || num < 1 || num > 8) return 'Must be between 1 and 8';
      return true;
    }
  });

  if (terminalResponse.terminalCount === undefined) {
    process.exit(0);
  }

  // Use default value if user pressed Enter without typing anything
  const finalTerminalCount = terminalResponse.terminalCount || 3;

  return {
    siteIds,
    terminalCount: finalTerminalCount
  };
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    // Get user configuration
    const config = await getUserConfiguration();

    // Analyze transcription status
    const session = analyzeTranscriptionStatus(config.siteIds);
    // No point opening more terminals than there are files
    session.terminalCount = Math.min(config.terminalCount, session.untranscribedFiles.length);

    // Confirm before starting
    console.log('\n📋 Session Configuration:');
    if (session.sites.length === 1) {
      console.log(`   Site: ${session.sites[0].siteTitle} (${session.sites[0].siteId})`);
    } else {
      console.log(`   Sites (${session.sites.length}): ${session.sites.map(s => s.siteId).join(', ')}`);
    }
    console.log(`   Files to transcribe: ${session.untranscribedFiles.length}`);
    console.log(`   Total duration: ${Math.round(session.untranscribedDurationMinutes)} minutes`);
    console.log(`   Terminal windows: ${session.terminalCount}`);
    console.log(`   Avg per terminal: ~${Math.round(session.untranscribedDurationMinutes / session.terminalCount)} minutes`);

    const confirmResponse = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Start multi-terminal transcription?',
      initial: true
    });

    if (!confirmResponse.proceed) {
      console.log('❌ Cancelled by user');
      process.exit(0);
    }

    // Create and start the runner
    console.log('\n🚀 Starting multi-terminal transcription...');
    const runner = new TranscriptionMultiTerminalRunner(session);
    await runner.startProcesses();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { TranscriptionMultiTerminalRunner, type TranscriptionSession };
