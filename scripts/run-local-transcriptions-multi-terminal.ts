#!/usr/bin/env tsx

/**
 * Multi-Terminal Local Transcription Runner
 * 
 * This script runs audio transcription across multiple terminal windows for parallel processing.
 * It calculates the total untranscribed audio duration upfront and tracks progress against that baseline.
 * 
 * Features:
 * - Interactive site selection (single site focus)
 * - Configurable terminal count (default: 3)
 * - Progress tracking based on untranscribed audio only
 * - ETA estimation based on transcription speed
 * - Real-time progress monitoring across terminals
 * 
 * Usage: pnpm run ingestion:run-local-transcriptions:multi-terminal
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import prompts from 'prompts';
import { discoverSites, Site } from './utils/site-selector.js';
import { MultiTerminalRunner, ProcessConfig } from './utils/multi-terminal-runner.js';

interface AudioFileInfo {
  filename: string;
  fullPath: string;
  durationMinutes?: number;
  hasTranscript: boolean;
}

interface TranscriptionSession {
  siteId: string;
  siteTitle: string;
  totalAudioFiles: number;
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
   * Create process configurations for real transcription commands
   */
  protected createProcessConfigs(): ProcessConfig[] {
    const configs: ProcessConfig[] = [];
    
    // Distribute untranscribed files across terminals using round-robin
    const filesPerTerminal = this.distributeFilesAcrossTerminals();
    
    for (let i = 0; i < this.session.terminalCount; i++) {
      const processId = `transcription-${i + 1}`;
      const logFile = path.join(this.logDir, `${processId}.log`);
      const terminalFiles = filesPerTerminal[i];
      
      if (terminalFiles.length === 0) {
        console.log(`⚠️  Terminal ${i + 1} has no files to process - reducing terminal count`);
        continue;
      }
      
      // Calculate duration for this terminal's files
      const terminalDuration = terminalFiles.reduce((sum, file) => sum + (file.durationMinutes || 0), 0);
      
      configs.push({
        id: processId,
        command: 'pnpm',
        args: [
          'tsx',
          'scripts/trigger-individual-ingestion-lambda.ts',
          `--sites=${this.session.siteId}`,
          '--lambda=process-audio',
          '--env=local'
        ],
        logFile,
        env: {
          NODE_OPTIONS: '--max-old-space-size=8192',
          PROCESS_ID: processId,
          SITE_ID: this.session.siteId,
          LOG_FILE: logFile,
          TERMINAL_TOTAL_MINUTES: terminalDuration.toString(),
          // Pass specific files for this terminal to process
          TERMINAL_FILE_LIST: terminalFiles.map(f => f.filename).join(','),
          TERMINAL_INDEX: i.toString(),
          TOTAL_TERMINALS: this.session.terminalCount.toString()
        }
      });
    }
    
    return configs;
  }

  /**
   * Distribute files across terminals for balanced processing
   */
  private distributeFilesAcrossTerminals(): AudioFileInfo[][] {
    const filesPerTerminal: AudioFileInfo[][] = Array.from({ length: this.session.terminalCount }, () => []);
    
    // Simple round-robin distribution
    // TODO: Could enhance with duration-based balancing
    this.session.untranscribedFiles.forEach((file, index) => {
      const terminalIndex = index % this.session.terminalCount;
      filesPerTerminal[terminalIndex].push(file);
    });
    
    return filesPerTerminal;
  }
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
function hasExistingTranscript(audioPath: string, siteId: string): boolean {
  // Convert audio path to transcript path
  const audioDir = path.dirname(audioPath);
  const basename = path.basename(audioPath, path.extname(audioPath));
  
  // Replace 'audio' with 'transcripts' in the path
  const transcriptDir = audioDir.replace('/audio/', '/transcripts/');
  const transcriptPath = path.join(transcriptDir, `${basename}.srt`);
  
  return fs.existsSync(transcriptPath);
}

/**
 * Scan for audio files and determine which need transcription
 */
function analyzeTranscriptionStatus(siteId: string): TranscriptionSession {
  const audioDir = path.join(process.cwd(), 'aws-local-dev', 's3', 'sites', siteId, 'audio');
  
  if (!fs.existsSync(audioDir)) {
    throw new Error(`Audio directory not found: ${audioDir}`);
  }
  
  console.log('🔍 Scanning for audio files and existing transcripts...');
  
  const allAudioFiles: AudioFileInfo[] = [];
  const untranscribedFiles: AudioFileInfo[] = [];
  
  // Recursively find all .mp3 files
  function scanDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.mp3')) {
        const hasTranscript = hasExistingTranscript(fullPath, siteId);
        const fileInfo: AudioFileInfo = {
          filename: entry.name,
          fullPath,
          hasTranscript
        };
        
        allAudioFiles.push(fileInfo);
        
        if (!hasTranscript) {
          // Get duration for untranscribed files
          console.log(`📊 Calculating duration for: ${entry.name}`);
          fileInfo.durationMinutes = getAudioDuration(fullPath);
          untranscribedFiles.push(fileInfo);
        }
      }
    }
  }
  
  scanDirectory(audioDir);
  
  const untranscribedDurationMinutes = untranscribedFiles.reduce(
    (sum, file) => sum + (file.durationMinutes || 0), 
    0
  );
  
  console.log('\n📈 Transcription Analysis:');
  console.log(`   Total audio files: ${allAudioFiles.length}`);
  console.log(`   Already transcribed: ${allAudioFiles.length - untranscribedFiles.length}`);
  console.log(`   Needs transcription: ${untranscribedFiles.length}`);
  console.log(`   Untranscribed duration: ${Math.round(untranscribedDurationMinutes)} minutes (${Math.round(untranscribedDurationMinutes / 60 * 10) / 10} hours)`);
  
  if (untranscribedFiles.length === 0) {
    throw new Error('🎉 All audio files already have transcripts! Nothing to process.');
  }
  
  // Get site info
  const sites = discoverSites();
  const site = sites.find(s => s.id === siteId);
  
  return {
    siteId,
    siteTitle: site?.title || siteId,
    totalAudioFiles: allAudioFiles.length,
    untranscribedFiles,
    untranscribedDurationMinutes,
    terminalCount: 3 // Will be updated by user prompt
  };
}

/**
 * Interactive prompts for user configuration
 */
async function getUserConfiguration(): Promise<{ siteId: string; terminalCount: number }> {
  console.log('🔧 Multi-Terminal Local Transcription Setup');
  console.log('='.repeat(50));
  
  // Site selection
  const sites = discoverSites();
  if (sites.length === 0) {
    throw new Error('❌ No sites found! Please create a site first.');
  }
  
  const siteChoices = sites.map(site => ({
    title: `${site.id} (${site.title})`,
    value: site.id
  }));
  
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
    siteId: siteResponse.siteId,
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
    const session = analyzeTranscriptionStatus(config.siteId);
    session.terminalCount = config.terminalCount;
    
    // Confirm before starting
    console.log('\n📋 Session Configuration:');
    console.log(`   Site: ${session.siteTitle} (${session.siteId})`);
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