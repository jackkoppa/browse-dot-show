import { join } from 'path';
import { spawn } from 'child_process';
import { readJsonFile } from '../utils/file-operations.js';
import { execCommand } from '../utils/shell-exec.js';
import { printInfo, printSuccess, printWarning, printError } from '../utils/logging.js';
// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import { loadProgress } from './setup-steps.js';
import type { SetupProgress, StepStatus, SiteConfig } from './types.js';

// Helper functions for complete transcriptions step
function formatTimeEstimate(seconds: number): string {
  const roundedSeconds = Math.round(seconds / 10) * 10; // Round to nearest 10 seconds
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;
  
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  } else if (minutes > 0) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  } else {
    return `${remainingSeconds}s`;
  }
}

async function parseRSSFileForEpisodeCount(siteId: string): Promise<number> {
  const fs = await import('fs');
  const path = await import('path');
  
  const rssDir = path.join('aws-local-dev', 's3', 'sites', siteId, 'rss');
  const rssFile = path.join(rssDir, `${siteId}.xml`);
  
  if (!fs.existsSync(rssFile)) {
    throw new Error(`RSS file not found: ${rssFile}`);
  }
  
  const rssContent = fs.readFileSync(rssFile, 'utf8');
  
  // Count <item> tags which represent episodes
  const itemMatches = rssContent.match(/<item\b[^>]*>/gi);
  return itemMatches ? itemMatches.length : 0;
}

async function calculateTotalAudioDuration(siteId: string): Promise<number> {
  const fs = await import('fs');
  const path = await import('path');
  
  const audioDir = path.join('aws-local-dev', 's3', 'sites', siteId, 'audio');
  let totalDurationInSeconds = 0;
  
  if (!fs.existsSync(audioDir)) {
    return 0;
  }
  
  // Get all subdirectories (podcast IDs)
  const podcastDirs = fs.readdirSync(audioDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  // Scan each podcast directory for audio files
  for (const podcastId of podcastDirs) {
    const podcastAudioDir = path.join(audioDir, podcastId);
    
    if (fs.existsSync(podcastAudioDir)) {
      const audioFiles = fs.readdirSync(podcastAudioDir)
        .filter(file => file.endsWith('.mp3'));
      
      for (const audioFile of audioFiles) {
        const filePath = path.join(podcastAudioDir, audioFile);
        
        try {
          const result = await execCommand('ffprobe', [
            '-v', 'quiet',
            '-show_entries', 'format=duration',
            '-of', 'csv=p=0',
            filePath
          ]);
          
          if (result.exitCode === 0) {
            const duration = parseFloat(result.stdout.trim());
            if (!isNaN(duration)) {
              totalDurationInSeconds += duration;
            }
          } else {
            throw new Error('ffprobe failed');
          }
        } catch (ffprobeError) {
          // If ffprobe fails, estimate duration based on file size (rough estimate: ~1MB per minute for MP3)
          const stats = fs.statSync(filePath);
          const estimatedDuration = (stats.size / 1024 / 1024) * 60; // MB * 60 seconds
          totalDurationInSeconds += estimatedDuration;
        }
      }
    }
  }
  
  return totalDurationInSeconds;
}

async function validateTranscriptionCompletion(siteId: string): Promise<{ isComplete: boolean; audioCount: number; transcriptCount: number; rssCount: number }> {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    // Count RSS episodes
    const rssCount = await parseRSSFileForEpisodeCount(siteId);
    
    // Count audio files
    const audioDir = path.join('aws-local-dev', 's3', 'sites', siteId, 'audio');
    let audioCount = 0;
    
    if (fs.existsSync(audioDir)) {
      const podcastDirs = fs.readdirSync(audioDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      
      for (const podcastId of podcastDirs) {
        const podcastAudioDir = path.join(audioDir, podcastId);
        if (fs.existsSync(podcastAudioDir)) {
          const audioFiles = fs.readdirSync(podcastAudioDir).filter(file => file.endsWith('.mp3'));
          audioCount += audioFiles.length;
        }
      }
    }
    
    // Count transcript files
    const transcriptDir = path.join('aws-local-dev', 's3', 'sites', siteId, 'transcripts');
    let transcriptCount = 0;
    
    if (fs.existsSync(transcriptDir)) {
      const podcastDirs = fs.readdirSync(transcriptDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      
      for (const podcastId of podcastDirs) {
        const podcastTranscriptDir = path.join(transcriptDir, podcastId);
        if (fs.existsSync(podcastTranscriptDir)) {
          const transcriptFiles = fs.readdirSync(podcastTranscriptDir).filter(file => file.endsWith('.srt'));
          transcriptCount += transcriptFiles.length;
        }
      }
    }
    
    const isComplete = audioCount === transcriptCount && audioCount === rssCount && audioCount > 0;
    return { isComplete, audioCount, transcriptCount, rssCount };
    
  } catch (error) {
    return { isComplete: false, audioCount: 0, transcriptCount: 0, rssCount: 0 };
  }
}

async function validateFinalIndexing(siteId: string): Promise<{ isComplete: boolean; hasSearchIndex: boolean; searchEntriesCount: number; expectedCount: number }> {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    // Check if search index exists
    const searchIndexFile = path.join('aws-local-dev', 's3', 'sites', siteId, 'search-index', 'orama_index.msp');
    const hasSearchIndex = fs.existsSync(searchIndexFile);
    
    // Count search entries
    const searchEntriesDir = path.join('aws-local-dev', 's3', 'sites', siteId, 'search-entries', siteId);
    let searchEntriesCount = 0;
    
    if (fs.existsSync(searchEntriesDir)) {
      const searchEntryFiles = fs.readdirSync(searchEntriesDir).filter(file => file.endsWith('.json'));
      searchEntriesCount = searchEntryFiles.length;
    }
    
    // Get expected count from audio files
    const audioDir = path.join('aws-local-dev', 's3', 'sites', siteId, 'audio');
    let expectedCount = 0;
    
    if (fs.existsSync(audioDir)) {
      const podcastDirs = fs.readdirSync(audioDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      
      for (const podcastId of podcastDirs) {
        const podcastAudioDir = path.join(audioDir, podcastId);
        if (fs.existsSync(podcastAudioDir)) {
          const audioFiles = fs.readdirSync(podcastAudioDir).filter(file => file.endsWith('.mp3'));
          expectedCount += audioFiles.length;
        }
      }
    }
    
    const isComplete = hasSearchIndex && searchEntriesCount === expectedCount && expectedCount > 0;
    return { isComplete, hasSearchIndex, searchEntriesCount, expectedCount };
    
  } catch (error) {
    return { isComplete: false, hasSearchIndex: false, searchEntriesCount: 0, expectedCount: 0 };
  }
}

async function runSpawnCommand(command: string, args: string[]): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=8192'
      }
    });
    
    child.stdout?.on('data', (data) => {
      process.stdout.write(data.toString());
    });
    
    child.stderr?.on('data', (data) => {
      process.stderr.write(data.toString());
    });
    
    child.on('close', (code) => {
      console.log('');
      resolve(code === 0);
    });
    
    child.on('error', () => {
      resolve(false);
    });
  });
}

export async function executeCompleteTranscriptionsStep(progress: SetupProgress): Promise<StepStatus> {
  console.log('');
  printInfo('🎙️  Time to complete transcriptions for your entire podcast archive!');
  console.log('');
  console.log('This is the most time-intensive phase, but will make your entire podcast');
  console.log('searchable. The process has 3 main steps:');
  console.log('');
  console.log('1. Download all remaining episode audio files');
  console.log('2. Transcribe all episodes using Whisper');
  console.log('3. Create the searchable index');
  console.log('');

  // Check if we have initial metrics
  if (!progress.initial2EpisodesResults) {
    printError('Cannot estimate times - please complete the "first transcriptions" step first.');
    return 'DEFERRED';
  }

  const metrics = progress.initial2EpisodesResults;

  // Phase A: Download All Episodes
  console.log('📥 Phase 1: Download All Episode Files');
  console.log('');

  try {
    const totalEpisodes = await parseRSSFileForEpisodeCount(progress.siteId);
    const remainingEpisodes = Math.max(0, totalEpisodes - 2); // Subtract the 2 already downloaded
    const estimatedDownloadTime = Math.round((remainingEpisodes / 2) * metrics.episodesAudioFileDownloadTimeInSeconds);
    
    console.log(`📊 Found ${totalEpisodes} episodes in your RSS feed`);
    console.log(`   • Already downloaded: 2 episodes`);
    console.log(`   • Remaining to download: ${remainingEpisodes} episodes`);
    console.log(`   • Estimated download time: ${formatTimeEstimate(estimatedDownloadTime)}`);
    console.log('');

    const downloadResponse = await prompts({
      type: 'confirm',
      name: 'startDownload',
      message: `Ready to download all ${remainingEpisodes} remaining episodes?`,
      initial: true
    });

    if (!downloadResponse.startDownload) {
      printInfo('No problem! You can continue with this step when you\'re ready.');
      return 'DEFERRED';
    }

    // Execute download
    printInfo('🚀 Starting download of all episode files...');
    const downloadSuccess = await runSpawnCommand('pnpm', [
      'tsx', 'scripts/trigger-individual-ingestion-lambda.ts',
      `--sites=${progress.siteId}`,
      '--lambda=rss-retrieval',
      '--env=local'
    ]);

    if (!downloadSuccess) {
      printError('Download failed. Please try again.');
      return 'DEFERRED';
    }

    printSuccess('✅ All episode files downloaded successfully!');

  } catch (error) {
    printError(`Failed to download episodes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return 'DEFERRED';
  }

  // Phase B: Transcription Planning and Execution
  console.log('');
  console.log('🎯 Phase 2: Transcription Planning');
  console.log('');

  try {
    // Review transcription prompt
    printInfo('🎯 Let\'s review your whisper transcription prompt!');
    console.log('');
    console.log('A good transcription prompt can slightly improve transcription quality.');
    console.log('');
    
    const configPath = join('sites/my-sites', progress.siteId, 'site.config.json');
    const currentConfig = await readJsonFile<SiteConfig>(configPath);
    
    console.log('📝 Your current transcription prompt:');
    console.log(`   "${currentConfig.whisperTranscriptionPrompt}"`);
    console.log('');
    console.log('💡 To customize this prompt, edit the "whisperTranscriptionPrompt" field in:');
    console.log(`   sites/my-sites/${progress.siteId}/site.config.json`);
    console.log('');
    
    const reviewResponse = await prompts({
      type: 'confirm',
      name: 'ready',
      message: 'Ready to proceed with transcription?',
      initial: true
    });
    
    if (!reviewResponse.ready) {
      printInfo('No problem! Take your time to customize the prompt, then run this step again.');
      return 'DEFERRED';
    }

    // Calculate transcription time estimates
    const totalAudioDuration = await calculateTotalAudioDuration(progress.siteId);
    const transcriptionRatio = metrics.episodesTranscriptionTimeInSeconds / metrics.episodesDurationInSeconds;
    const estimatedTranscriptionTime = Math.round(totalAudioDuration * transcriptionRatio);
    
    console.log(`📊 Total Audio Duration: ~${Math.round(totalAudioDuration / 3600)} hours`);
    console.log('');
    console.log('⏱️  ESTIMATED TOTAL TRANSCRIPTION TIME: ' + formatTimeEstimate(estimatedTranscriptionTime));
    console.log('');

    const transcriptionChoice = await prompts({
      type: 'select',
      name: 'choice',
      message: 'How would you like to run transcriptions?',
      choices: [
        {
          title: 'Single terminal (simpler, slower)',
          description: 'Process episodes one at a time in this terminal',
          value: 'single'
        },
        {
          title: 'Multiple terminals (faster, needs more RAM)',
          description: 'You\'ll run the same command in 2-3 separate terminals',
          value: 'multiple'
        }
      ],
      initial: 0
    });

    if (!transcriptionChoice.choice) {
      return 'DEFERRED';
    }

    // Execute transcriptions
    if (transcriptionChoice.choice === 'single') {
      console.log('');
      printInfo('🎵 Starting transcription of all episodes...');
      
      const transcriptionSuccess = await runSpawnCommand('pnpm', [
        'tsx', 'scripts/trigger-individual-ingestion-lambda.ts',
        `--sites=${progress.siteId}`,
        '--lambda=process-audio',
        '--env=local'
      ]);

      if (!transcriptionSuccess) {
        printError('Transcription failed. Please try again.');
        return 'DEFERRED';
      }

      printSuccess('✅ All episodes transcribed successfully!');

    } else {
      // Multiple terminals option
      console.log('');
      printInfo('🚀 Multiple Terminal Setup Instructions:');
      console.log('');
      console.log('1. Open 2-3 new terminal windows/tabs');
      console.log('2. In each terminal, navigate to this project directory');
      console.log('3. Run this command in each terminal:');
      console.log('');
      console.log(`NODE_OPTIONS=--max-old-space-size=8192 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=${progress.siteId} --lambda=process-audio --env=local`);
      console.log('');

      const continueResponse = await prompts({
        type: 'confirm',
        name: 'transcriptionsComplete',
        message: 'Have all transcription terminals completed successfully?',
        initial: false
      });

      if (!continueResponse.transcriptionsComplete) {
        printInfo('No problem! Continue when all transcriptions are complete.');
        return 'DEFERRED';
      }
    }

  } catch (error) {
    printError(`Failed during transcription phase: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return 'DEFERRED';
  }

  // Phase C: Final validation and indexing
  console.log('');
  console.log('✅ Phase 3: Final Validation and Indexing');
  console.log('');

  try {
    printInfo('🔍 Validating transcription completion...');
    const validation = await validateTranscriptionCompletion(progress.siteId);
    
    console.log(`📊 Validation Results:`);
    console.log(`   • RSS episodes: ${validation.rssCount}`);
    console.log(`   • Audio files: ${validation.audioCount}`);
    console.log(`   • Transcript files: ${validation.transcriptCount}`);
    console.log('');

    if (!validation.isComplete) {
      const retryResponse = await prompts({
        type: 'confirm',
        name: 'continueAnyway',
        message: 'Transcriptions appear incomplete. Continue with indexing anyway?',
        initial: false
      });

      if (!retryResponse.continueAnyway) {
        printInfo('Please complete the missing transcriptions and return to this step.');
        return 'DEFERRED';
      }
    } else {
      printSuccess('🎉 All transcriptions completed successfully!');
    }

    // Final indexing step
    const indexResponse = await prompts({
      type: 'confirm',
      name: 'startIndexing',
      message: 'Ready to create the searchable index? (This will take a few minutes)',
      initial: true
    });

    if (!indexResponse.startIndexing) {
      return 'DEFERRED';
    }

    printInfo('🔍 Creating searchable index...');
    const indexingSuccess = await runSpawnCommand('pnpm', [
      'tsx', 'scripts/trigger-individual-ingestion-lambda.ts',
      `--sites=${progress.siteId}`,
      '--lambda=srt-indexing',
      '--env=local'
    ]);

    if (!indexingSuccess) {
      printError('Indexing failed. Please try again.');
      return 'DEFERRED';
    }

    // Final validation
    printInfo('🔍 Validating final results...');
    const finalValidation = await validateFinalIndexing(progress.siteId);
    
    console.log(`📊 Final Results:`);
    console.log(`   • Search index: ${finalValidation.hasSearchIndex ? '✅' : '❌'}`);
    console.log(`   • Search entries: ${finalValidation.searchEntriesCount}/${finalValidation.expectedCount}`);
    console.log('');

    if (finalValidation.isComplete) {
      printSuccess('🎉 Complete transcription workflow finished successfully!');
      console.log('');
      console.log('✨ Your entire podcast archive is now searchable!');
      console.log(`🔍 Test it by running: pnpm client:dev --filter ${progress.siteId}`);
      console.log('');
      return 'COMPLETED';
    } else {
      printWarning('⚠️  Indexing completed but some files may be missing.');
      
      const acceptResponse = await prompts({
        type: 'confirm',
        name: 'acceptPartial',
        message: 'Mark this step as complete anyway?',
        initial: true
      });

      return acceptResponse.acceptPartial ? 'COMPLETED' : 'DEFERRED';
    }

  } catch (error) {
    printError(`Failed during final validation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return 'DEFERRED';
  }
} 