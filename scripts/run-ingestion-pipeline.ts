#!/usr/bin/env tsx

/**
 * Ingestion Pipeline Script - Complete Podcast Processing Workflow
 * 
 * This script provides a comprehensive ingestion pipeline that can be run in multiple modes:
 * - Automated/scheduled execution (for production automation)
 * - Interactive mode (for manual runs with guided configuration)
 * - Targeted execution (for specific sites or phases)
 * 
 * Pipeline Phases:
 * 1. Pre-sync check: Download any files from S3 that don't exist locally
 * 2. RSS download: Retrieve new episodes from RSS feeds for each site
 * 3. Transcription: Transcribe any new audio files for each site
 * 4. Local indexing: Run search indexing locally for sites with new files
 * 5. Final S3 sync: Upload all new files to S3, including search indices
 * 
 * Usage: tsx scripts/run-ingestion-pipeline.ts [OPTIONS]
 */

import prompts from 'prompts';
import { discoverSites, type Site } from './lib/sites.js';
import { loadAutomationCredentials, loadSiteEnv, type AutomationCredentials } from './lib/env.js';
import { getSiteCloudFrontId } from './lib/site-accounts.js';
import { runLambdaLocally } from './lib/lambda.js';
import {
  ALL_SYNC_FOLDERS,
  assumeAwsRole,
  performComprehensiveS3Sync,
  performS3ToLocalPreSync,
  syncEpisodeManifestFolder,
} from './lib/s3-sync.js';
import { execCommand } from './lib/shell-exec.js';
import { logInfo, logSuccess, logError, logProgress } from './lib/logging.js';
import { generateSyncConsistencyReport, displaySyncConsistencyReport, SYNC_MODES } from './lib/sync-consistency-checker.js';
import { PipelineResultLogger } from './lib/pipeline-result-logger.js';
import { invalidateCloudFrontWithCredentials } from './lib/client-deployment.js';
import { reapplySpellingCorrectionsToAllTranscripts as reapplySpellingCorrectionsFunction } from './utils/reapply-spelling-corrections-to-all-transcripts.js';

/**
 * Configuration options for the automation workflow
 */
interface WorkflowConfig {
  selectedSites?: string[];
  interactive: boolean;
  help: boolean;
  dryRun: boolean;
  forceLocalIndexing: boolean;
  reapplySpellingCorrections: boolean;
  phases: {
    preSync: boolean;
    rssRetrieval: boolean;
    audioProcessing: boolean;
    localIndexing: boolean;
    s3Sync: boolean;
    cloudfrontInvalidation: boolean;
  };
  syncOptions: {
    foldersToSync: string[];
  };
}

/**
 * Get default configuration (function to avoid forward reference issues)
 */
function getDefaultConfig(): WorkflowConfig {
  return {
    interactive: false,
    help: false,
    dryRun: false,
    forceLocalIndexing: false,
    reapplySpellingCorrections: false,
    phases: {
      preSync: true,
      rssRetrieval: true,
      audioProcessing: true,
      localIndexing: true,
      s3Sync: true,
      cloudfrontInvalidation: true
    },
    syncOptions: {
      foldersToSync: ALL_SYNC_FOLDERS
    }
  };
}

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(`
🤖 Ingestion Pipeline - Comprehensive Podcast Processing

USAGE:
  tsx scripts/run-ingestion-pipeline.ts [OPTIONS]

OPTIONS:
  --help                    Show this help message
  --interactive             Run in interactive mode to configure options
  --sites=site1,site2       Process only specific sites (comma-separated)
  --dry-run                 Show what would be done without executing
  --skip-pre-sync           Skip S3-to-local pre-sync phase
  --skip-rss-retrieval     Skip RSS retrieval phase
  --skip-audio-processing  Skip audio processing phase
  --skip-local-indexing    Skip local search index update phase
  --skip-s3-sync           Skip local-to-S3 upload phase
  --skip-cloudfront-invalidation  Skip CloudFront cache invalidation phase
  --force-local-indexing   Force local indexing to run even if no new files detected
  --reapply-spelling-corrections  Apply site-specific spelling corrections to all existing transcripts
  --sync-folders=a,b,c     Specific folders to sync (audio,transcripts,episode-manifest,rss,search-entries,search-index)

EXAMPLES:
  # Run full workflow for all sites (default)
  tsx scripts/run-ingestion-pipeline.ts
  
  # Interactive mode for manual configuration
  tsx scripts/run-ingestion-pipeline.ts --interactive
  
  # Process only specific sites
  tsx scripts/run-ingestion-pipeline.ts --sites=hardfork,naddpod
  
  # Dry run to see what would happen
  tsx scripts/run-ingestion-pipeline.ts --dry-run --sites=hardfork
  
  # Skip local indexing 
  tsx scripts/run-ingestion-pipeline.ts --skip-local-indexing

PHASES:
  Phase 1: Pre-sync check (downloads files from S3 that don't exist locally)
  Phase 2: RSS retrieval (downloads new episodes)
  Phase 3: Audio processing (transcribes audio files)
  Phase 4: Local indexing (updates search indices for sites with new files)
  Phase 5: S3 upload (uploads new files to S3, including search indices)
  Phase 6: CloudFront cache invalidation (invalidates caches for updated sites)

For automation/cron jobs, use without --interactive flag.
For manual runs, --interactive provides a guided configuration experience.
`);
}

/**
 * Parse command line arguments
 */
function parseArguments(): WorkflowConfig {
  const args = process.argv.slice(2);
  const config: WorkflowConfig = JSON.parse(JSON.stringify(getDefaultConfig()));
  
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      config.help = true;
    } else if (arg === '--interactive' || arg === '-i') {
      config.interactive = true;
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg === '--skip-pre-sync') {
      config.phases.preSync = false;
    } else if (arg === '--skip-rss-retrieval') {
      config.phases.rssRetrieval = false;
    } else if (arg === '--skip-audio-processing') {
      config.phases.audioProcessing = false;
    } else if (arg === '--skip-local-indexing') {
      config.phases.localIndexing = false;
    } else if (arg === '--skip-s3-sync') {
      config.phases.s3Sync = false;
    } else if (arg === '--skip-cloudfront-invalidation') {
      config.phases.cloudfrontInvalidation = false;
    } else if (arg === '--force-local-indexing') {
      config.forceLocalIndexing = true;
    } else if (arg === '--reapply-spelling-corrections') {
      config.reapplySpellingCorrections = true;
    } else if (arg.startsWith('--sites=')) {
      const sitesArg = arg.split('=')[1];
      if (sitesArg) {
        config.selectedSites = sitesArg.split(',').map(s => s.trim()).filter(s => s.length > 0);
      }
    } else if (arg.startsWith('--sync-folders=')) {
      const foldersArg = arg.split('=')[1];
      if (foldersArg) {
        const folders = foldersArg.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const validFolders = folders.filter(f => ALL_SYNC_FOLDERS.includes(f));
        if (validFolders.length !== folders.length) {
          const invalidFolders = folders.filter(f => !ALL_SYNC_FOLDERS.includes(f));
          console.error(`❌ Invalid sync folders: ${invalidFolders.join(', ')}`);
          console.error(`Valid options: ${ALL_SYNC_FOLDERS.join(', ')}`);
          process.exit(1);
        }
        config.syncOptions.foldersToSync = validFolders;
      }
    }
  }
  
  return config;
}

/**
 * Configure workflow options interactively
 */
async function configureInteractively(config: WorkflowConfig, allSites: Site[]): Promise<WorkflowConfig> {
  console.log('\n🤖 Interactive Configuration');
  console.log('='.repeat(40));
  console.log('Configure your ingestion pipeline options:\n');

  // Site selection
  if (!config.selectedSites || config.selectedSites.length === 0) {
    const siteResponse = await prompts({
      type: 'select',
      name: 'siteSelection',
      message: 'Which sites would you like to process?',
      choices: [
        { title: 'All sites', value: 'all' },
        { title: 'Select specific sites', value: 'select' }
      ],
      initial: 0
    });

    if (siteResponse.siteSelection === 'select') {
      const specificSitesResponse = await prompts({
        type: 'multiselect',
        name: 'sites',
        message: 'Select sites to process:',
        choices: allSites.map(site => ({
          title: `${site.title} (${site.id})`,
          value: site.id,
          selected: false
        })),
        min: 1
      });

      if (specificSitesResponse.sites && specificSitesResponse.sites.length > 0) {
        config.selectedSites = specificSitesResponse.sites;
      }
    }
  }

  // Execution mode
  const executionResponse = await prompts({
    type: 'select',
    name: 'executionMode',
    message: 'Select execution mode:',
    choices: [
      { title: 'Full execution (default)', value: 'full' },
      { title: 'Dry run (show what would happen)', value: 'dry-run' }
    ],
    initial: 0
  });

  config.dryRun = executionResponse.executionMode === 'dry-run';

  // Phase selection
  const phaseResponse = await prompts({
    type: 'select',
    name: 'phaseSelection',
    message: 'Which phases would you like to run?',
    choices: [
      { title: 'All phases (recommended)', value: 'all' },
      { title: 'Select specific phases', value: 'select' }
    ],
    initial: 0
  });

  if (phaseResponse.phaseSelection === 'select') {
    const phaseChoices = [
      { title: 'Phase 1: Pre-sync check', value: 'preSync', selected: config.phases.preSync },
      { title: 'Phase 2: RSS retrieval', value: 'rssRetrieval', selected: config.phases.rssRetrieval },
      { title: 'Phase 3: Audio processing', value: 'audioProcessing', selected: config.phases.audioProcessing },
      { title: 'Phase 4: Local indexing', value: 'localIndexing', selected: config.phases.localIndexing },
      { title: 'Phase 5: S3 sync', value: 's3Sync', selected: config.phases.s3Sync },
      { title: 'Phase 6: CloudFront invalidation', value: 'cloudfrontInvalidation', selected: config.phases.cloudfrontInvalidation }
    ];

    const selectedPhasesResponse = await prompts({
      type: 'multiselect',
      name: 'phases',
      message: 'Select phases to run:',
      choices: phaseChoices,
      min: 1
    });

    if (selectedPhasesResponse.phases) {
      // Reset all phases to false
      Object.keys(config.phases).forEach(phase => {
        (config.phases as any)[phase] = false;
      });
      // Enable selected phases
      selectedPhasesResponse.phases.forEach((phase: string) => {
        (config.phases as any)[phase] = true;
      });
    }
  }

  // Sync options (only if S3 sync phases are enabled)
  if (config.phases.preSync || config.phases.s3Sync) {
    const syncOptionsResponse = await prompts({
      type: 'select',
      name: 'configureSync',
      message: 'Configure S3 sync options?',
      choices: [
        { title: 'Use defaults (recommended)', value: 'defaults' },
        { title: 'Configure sync options', value: 'configure' }
      ],
      initial: 0
    });

    if (syncOptionsResponse.configureSync === 'configure') {
      // Folder selection
      const folderResponse = await prompts({
        type: 'multiselect',
        name: 'folders',
        message: 'Which folders should be synced?',
        choices: ALL_SYNC_FOLDERS.map(folder => ({
          title: folder,
          value: folder,
          selected: config.syncOptions.foldersToSync.includes(folder)
        })),
        min: 1
      });

      if (folderResponse.folders && folderResponse.folders.length > 0) {
        config.syncOptions.foldersToSync = folderResponse.folders;
      }
    }
  }

  // Spelling corrections options
  const spellingCorrectionsResponse = await prompts({
    type: 'select',
    name: 'spellingCorrections',
    message: 'Apply spelling corrections to existing transcripts?',
    choices: [
      { title: 'Only new transcripts (default)', value: 'new-only' },
      { title: 'All existing transcripts (reapply corrections)', value: 'all-transcripts' }
    ],
    initial: 0
  });

  config.reapplySpellingCorrections = spellingCorrectionsResponse.spellingCorrections === 'all-transcripts';

  return config;
}

interface SiteProcessingResult {
  siteId: string;
  siteTitle: string;
  s3PreSyncSuccess?: boolean;
  s3PreSyncDuration?: number;
  s3PreSyncFilesDownloaded?: number;
  preConsistencyCheckSuccess?: boolean;
  preConsistencyCheckDuration?: number;
  filesMissingLocally?: number;
  rssRetrievalSuccess: boolean;
  rssRetrievalDuration: number;
  audioProcessingSuccess: boolean;
  audioProcessingDuration: number;
  newAudioFilesDownloaded: number;
  newEpisodesTranscribed: number;
  hasNewFiles: boolean; // Track if ANY new files were created during ingestion
  hasNewSrtFiles: boolean;
  spellingCorrectionsReapplicationSuccess?: boolean;
  spellingCorrectionsReapplicationDuration?: number;
  spellingCorrectionsFilesProcessed?: number;
  spellingCorrectionsTotalCorrections?: number;
  localIndexingSuccess?: boolean;
  localIndexingDuration?: number;
  localIndexingEntriesProcessed?: number;
  postConsistencyCheckSuccess?: boolean;
  postConsistencyCheckDuration?: number;
  filesToUpload?: number;
  filesInSync?: number;
  s3SyncSuccess?: boolean;
  s3SyncDuration?: number;
  s3SyncTotalFilesUploaded?: number;
  searchApiRefreshSuccess?: boolean;
  searchApiRefreshDuration?: number;
  cloudfrontInvalidationSuccess?: boolean;
  cloudfrontInvalidationDuration?: number;
  errors: string[];
}



/**
 * Trigger search-api Lambda to refresh its index after new files are uploaded
 * This ensures warm Lambda instances get the updated index file from S3
 */
async function triggerSearchApiLambdaRefresh(
  siteId: string,
  credentials: AutomationCredentials
): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();
  
  logProgress(`Triggering search-api Lambda refresh for ${siteId}`);
  
  try {
    // Assume AWS role and get temporary credentials
    const { tempCredentials } = await assumeAwsRole(siteId, 'search-refresh', credentials);
    
    const searchLambdaName = `search-api-${siteId}`;
    
    // Create the payload to force fresh DB file download
    const payload = JSON.stringify({
      forceFreshDBFileDownload: true
    });
    
    // https://stackoverflow.com/a/64922434/4167438
    const encodedPayload = Buffer.from(payload).toString('base64');
    
    // Invoke the search-api lambda function using the assumed role credentials
    const invokeResult = await execCommand('aws', [
      'lambda', 'invoke',
      '--function-name', searchLambdaName,
      '--invocation-type', 'Event', // Async invocation
      '--payload', encodedPayload,
      '/tmp/lambda-invoke-output.json'
    ], {
      silent: true,
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: tempCredentials.AccessKeyId,
        AWS_SECRET_ACCESS_KEY: tempCredentials.SecretAccessKey,
        AWS_SESSION_TOKEN: tempCredentials.SessionToken,
        AWS_REGION: credentials.AWS_REGION
      }
    });

    
    
    const duration = Date.now() - startTime;
    
    if (invokeResult.exitCode === 0) {
      logSuccess(`Successfully triggered search-api Lambda refresh for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
      return { success: true, duration };
    } else {
      const error = `Search-api Lambda invoke failed: ${invokeResult.stderr}`;
      logError(`Failed to trigger search-api Lambda refresh for ${siteId}: ${error}`);
      return { success: false, duration, error };
    }
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(`Error triggering search-api Lambda refresh for ${siteId}: ${error.message}`);
    return { success: false, duration, error: error.message };
  }
}

/**
 * Run an ingestion lambda locally for a site, streaming its output, and extract metrics
 * from that output.
 */
async function runLambdaWithMetrics(
  siteId: string,
  lambda: 'rss-retrieval' | 'process-audio',
  operation: string
): Promise<{ success: boolean; duration: number; error?: string; newAudioFiles?: number; newTranscripts?: number }> {
  console.log(`\n🚀 Running ${operation} for site: ${siteId}`);

  // Transcription logs its own detailed progress; log a heartbeat for everything else
  const startTime = Date.now();
  const progressInterval = lambda === 'process-audio' ? undefined : setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`   🔄 ${operation} in progress for ${siteId}... (${elapsed}s elapsed)`);
  }, 10000);

  const result = await runLambdaLocally({ lambda, siteId });
  if (progressInterval) clearInterval(progressInterval);

  let newAudioFiles = 0;
  let newTranscripts = 0;
  if (result.success) {
    const audioFilesMatch = result.stdout.match(/🎧 New Audio Files Downloaded: (\d+)/);
    if (audioFilesMatch) newAudioFiles = parseInt(audioFilesMatch[1], 10);

    const transcriptsMatch = result.stdout.match(/✅ Successfully Processed: (\d+)/);
    if (transcriptsMatch) newTranscripts = parseInt(transcriptsMatch[1], 10);

    console.log(`   ✅ ${operation} completed successfully for ${siteId} (${(result.duration / 1000).toFixed(1)}s)`);
  } else {
    console.log(`   ❌ ${operation} failed for ${siteId}: ${result.error} (${(result.duration / 1000).toFixed(1)}s)`);
  }

  return { success: result.success, duration: result.duration, error: result.error, newAudioFiles, newTranscripts };
}

/**
 * Run local indexing for a site (SRT indexing to update local search index).
 * Output is captured; a one-line progress indicator is shown instead.
 */
async function runLocalIndexingForSite(
  siteId: string
): Promise<{ success: boolean; duration: number; error?: string; entriesProcessed?: number }> {
  const startTime = Date.now();
  logProgress(`Running local indexing for ${siteId}`);

  let lastProgressLine = '';
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const baseMessage = `🔍 Processing local indexing for ${siteId}... (${elapsed}s)`;
    process.stdout.write(`\r${lastProgressLine ? `${baseMessage} | ${lastProgressLine}` : baseMessage}`.padEnd(120));
  }, 5000);

  const result = await runLambdaLocally({
    lambda: 'srt-indexing',
    siteId,
    output: 'quiet',
    onStdout: output => {
      // Keep the most recent progress line, e.g. "25% (261/1022), 105435 entries"
      const progressLines = output.split('\n').filter(line => line.includes('Progress:') && line.includes('SRT files processed'));
      if (progressLines.length === 0) return;
      const rawProgress = progressLines[progressLines.length - 1];
      const progressMatch = rawProgress.match(/(\d+)% of SRT files processed \((\d+)\/(\d+)\)/);
      const entriesMatch = rawProgress.match(/Collected (\d+) entries/);
      if (progressMatch) {
        const [, percent, current, total] = progressMatch;
        lastProgressLine = entriesMatch
          ? `${percent}% (${current}/${total}), ${entriesMatch[1]} entries`
          : `${percent}% (${current}/${total})`;
      }
    },
  });

  clearInterval(progressInterval);
  process.stdout.write('\r'.padEnd(100) + '\r');

  if (result.success) {
    const entriesMatch = result.stdout.match(/📝 New Search Entries Added: (\d+)/);
    const entriesProcessed = entriesMatch ? parseInt(entriesMatch[1], 10) : 0;
    logSuccess(`Local indexing completed for ${siteId} (${(result.duration / 1000).toFixed(1)}s)`);
    return { success: true, duration: result.duration, entriesProcessed };
  }

  const error = `Local indexing failed (${result.error}): ${result.stderr}`;
  logError(`Local indexing failed for ${siteId}: ${error}`);
  return { success: false, duration: result.duration, error };
}

/**
 * Invalidate CloudFront cache for a site using automation credentials
 */
async function invalidateCloudFrontForSite(
  siteId: string,
  credentials: AutomationCredentials
): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();
  
  logProgress(`Invalidating CloudFront cache for ${siteId}`);
  
  try {
    // Get CloudFront distribution ID from site account mappings
    const cloudfrontId = getSiteCloudFrontId(siteId);
    
    // Get temporary credentials for the site account
    const { tempCredentials } = await assumeAwsRole(siteId, 'cf', credentials);
    
    // Invalidate CloudFront cache (map AWS STS credentials to expected format)
    const mappedCredentials = {
      AWS_ACCESS_KEY_ID: tempCredentials.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: tempCredentials.SecretAccessKey,
      AWS_SESSION_TOKEN: tempCredentials.SessionToken,
      AWS_REGION: credentials.AWS_REGION
    };
    
    const invalidationResult = await invalidateCloudFrontWithCredentials(
      cloudfrontId,
      mappedCredentials,
      { silent: true, invalidateEpisodeManifest: true } // invalidate episode manifest, since we're updating it
    );
    
    const duration = Date.now() - startTime;
    
    if (invalidationResult.success) {
      logSuccess(`CloudFront cache invalidated for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
      return { success: true, duration };
    } else {
      const error = invalidationResult.error || 'Unknown CloudFront invalidation error';
      logError(`Failed to invalidate CloudFront cache for ${siteId}: ${error}`);
      return { success: false, duration, error };
    }
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(`Error invalidating CloudFront cache for ${siteId}: ${error.message}`);
    return { success: false, duration, error: error.message };
  }
}

/**
 * Reapply spelling corrections to all existing transcripts for a site
 */
async function reapplySpellingCorrectionsToAllTranscripts(
  siteId: string
): Promise<{ success: boolean; duration: number; error?: string; filesProcessed?: number; totalCorrections?: number }> {
  const startTime = Date.now();
  
  logProgress(`Reapplying spelling corrections to all existing transcripts for ${siteId}`);
  
  try {
    // Load site-specific environment variables
    const siteEnvVars = loadSiteEnv(siteId);
    
    // Set environment variables for the function
    const originalSiteId = process.env.SITE_ID;
    const originalFileStorageEnv = process.env.FILE_STORAGE_ENV;
    
    // Set environment variables
    process.env.SITE_ID = siteId;
    process.env.FILE_STORAGE_ENV = 'local';
    
    // Apply other site-specific env vars
    Object.entries(siteEnvVars).forEach(([key, value]) => {
      process.env[key] = value;
    });
    
    try {
      // Call the function directly
      const result = await reapplySpellingCorrectionsFunction();
      
      const duration = Date.now() - startTime;
      
      if (result.success) {
        logSuccess(`Spelling corrections reapplied for ${siteId}: ${result.totalFilesProcessed} files, ${result.totalCorrectionsApplied} corrections (${(duration / 1000).toFixed(1)}s)`);
        return { 
          success: true, 
          duration, 
          filesProcessed: result.totalFilesProcessed, 
          totalCorrections: result.totalCorrectionsApplied 
        };
      } else {
        logError(`Failed to reapply spelling corrections for ${siteId}: ${result.error}`);
        return { success: false, duration, error: result.error };
      }
      
    } finally {
      // Restore original environment variables
      if (originalSiteId !== undefined) {
        process.env.SITE_ID = originalSiteId;
      } else {
        delete process.env.SITE_ID;
      }
      
      if (originalFileStorageEnv !== undefined) {
        process.env.FILE_STORAGE_ENV = originalFileStorageEnv;
      } else {
        delete process.env.FILE_STORAGE_ENV;
      }
    }
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(`Error reapplying spelling corrections for ${siteId}: ${error.message}`);
    return { success: false, duration, error: error.message };
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const startTime = new Date();
  console.log('🤖 Ingestion Pipeline - Comprehensive Podcast Processing');
  console.log('='.repeat(60));
  console.log(`Started at: ${startTime.toISOString()}`);
  
  // Parse command line arguments
  let config = parseArguments();
  
  // Handle help flag
  if (config.help) {
    displayHelp();
    process.exit(0);
  }
  
  // Load automation credentials
  const credentials = loadAutomationCredentials();
  
  // Ensure we're running in local mode for all file operations
  process.env.FILE_STORAGE_ENV = 'local';
  
  // Discover all available sites
  const allSites = discoverSites();
  
  if (allSites.length === 0) {
    console.error('❌ No sites found! Please create a site in /sites/my-sites/ or /sites/origin-sites/');
    process.exit(1);
  }
  
  // Handle interactive configuration
  if (config.interactive) {
    config = await configureInteractively(config, allSites);
  } else if (!config.interactive && process.stdout.isTTY) {
    // Show interactive option hint for manual runs (when connected to TTY)
    console.log('💡 Tip: Add --interactive flag for guided configuration options');
    console.log('   Or use --help to see all available CLI flags\n');
  }
  
  // Filter sites based on configuration
  let sites = allSites;
  if (config.selectedSites && config.selectedSites.length > 0) {
    sites = allSites.filter(site => config.selectedSites!.includes(site.id));
    
    if (sites.length === 0) {
      console.error(`❌ No matching sites found for: ${config.selectedSites.join(', ')}`);
      console.error(`Available sites: ${allSites.map(s => s.id).join(', ')}`);
      process.exit(1);
    }
    
    console.log(`\n🎯 Running for selected sites only: ${config.selectedSites.join(', ')}`);
  }
  
  console.log(`\n📍 Found ${sites.length} site(s) to process:`);
  sites.forEach((site: Site) => {
    console.log(`   - ${site.id} (${site.title})`);
  });
  
  // Display configuration summary
  console.log('\n⚙️  Configuration Summary:');
  console.log(`   Execution mode: ${config.dryRun ? 'DRY RUN (preview only)' : 'Full execution'}`);
  console.log(`   Enabled phases:`);
  if (config.phases.preSync) console.log(`     ✅ Phase 1: Pre-sync check`);
  if (config.phases.rssRetrieval) console.log(`     ✅ Phase 2: RSS retrieval`);
  if (config.phases.audioProcessing) console.log(`     ✅ Phase 3: Audio processing`);
  if (config.reapplySpellingCorrections) console.log(`     ✅ Phase 3.5: Spelling corrections reapplication`);
  if (config.phases.localIndexing) console.log(`     ✅ Phase 4: Local indexing`);
  if (config.phases.s3Sync) console.log(`     ✅ Phase 5: S3 sync`);
  if (config.phases.cloudfrontInvalidation) console.log(`     ✅ Phase 6: CloudFront invalidation`);
  console.log(`   Sync folders: ${config.syncOptions.foldersToSync.join(', ')}`);
  
  if (config.dryRun) {
    console.log('\n🔍 DRY RUN MODE: This is a preview of what would happen');
    console.log('   No actual changes will be made to files or S3');
    console.log('   No cloud lambdas will be triggered\n');
  }
  
  const results: SiteProcessingResult[] = [];
  const overallStartTime = Date.now();
  
  // Initialize results for all sites
  for (const site of sites) {
    results.push({
      siteId: site.id,
      siteTitle: site.title,
      s3PreSyncSuccess: undefined,
      s3PreSyncDuration: undefined,
      s3PreSyncFilesDownloaded: undefined,
      preConsistencyCheckSuccess: undefined,
      preConsistencyCheckDuration: undefined,
      filesMissingLocally: undefined,
      rssRetrievalSuccess: false,
      rssRetrievalDuration: 0,
      audioProcessingSuccess: false,
      audioProcessingDuration: 0,
      newAudioFilesDownloaded: 0,
      newEpisodesTranscribed: 0,
      hasNewFiles: false,
      hasNewSrtFiles: false,
      errors: []
    });
  }

  // Phase 1: Pre-sync check - Download files from S3 that don't exist locally
  if (config.phases.preSync) {
    console.log('\n' + '='.repeat(60));
    console.log('📡 Phase 1: Pre-sync check - Download files from S3 that don\'t exist locally');
    console.log('='.repeat(60));
    
    if (config.dryRun) {
      console.log('🔍 DRY RUN: Would check for and download files missing locally from S3');
    } else {
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        const startTime = Date.now();
        
        try {
          // Assume AWS role and get temporary credentials
          const { siteConfig, tempCredentials } = await assumeAwsRole(site.id, 'pre-sync', credentials);
          
          // Generate pre-sync consistency report (only check for files missing locally)
          const preSyncReport = await generateSyncConsistencyReport(
            site.id,
            siteConfig.bucketName,
            tempCredentials,
            SYNC_MODES.PRE_SYNC
          );
          
          // Display the report
          displaySyncConsistencyReport(site.id, preSyncReport);
          
          // Download missing files if any
          if (preSyncReport.summary.totalS3OnlyFiles > 0) {
            const downloadResult = await performS3ToLocalPreSync(site.id, credentials);
            
            results[i].s3PreSyncSuccess = downloadResult.success;
            results[i].s3PreSyncDuration = downloadResult.duration;
            results[i].s3PreSyncFilesDownloaded = downloadResult.totalFilesTransferred;
            
            if (downloadResult.error) {
              results[i].errors.push(downloadResult.error);
            }
          } else {
            logInfo(`No files to download for ${site.id} - local files are up to date`);
            results[i].s3PreSyncSuccess = true;
            results[i].s3PreSyncDuration = Date.now() - startTime;
            results[i].s3PreSyncFilesDownloaded = 0;
          }
          
          const duration = Date.now() - startTime;
          results[i].preConsistencyCheckSuccess = true;
          results[i].preConsistencyCheckDuration = duration;
          results[i].filesMissingLocally = preSyncReport.summary.totalS3OnlyFiles;
          
        } catch (error: any) {
          const duration = Date.now() - startTime;
          logError(`Failed pre-sync check for ${site.id}: ${error.message}`);
          
          results[i].preConsistencyCheckSuccess = false;
          results[i].preConsistencyCheckDuration = duration;
          results[i].filesMissingLocally = 0;
          results[i].s3PreSyncSuccess = false;
          results[i].s3PreSyncDuration = duration;
          results[i].s3PreSyncFilesDownloaded = 0;
          results[i].errors.push(`Pre-sync check error: ${error.message}`);
        }
      }
    }
  } else {
    console.log('\n⏭️  Skipping Phase 1: Pre-sync check (disabled)');
  }
  
  
  // Phase 2: RSS Retrieval for all sites
  if (config.phases.rssRetrieval) {
    console.log('\n' + '='.repeat(60));
    console.log('📡 Phase 2: RSS Retrieval for all sites');
    console.log('='.repeat(60));
    
    if (config.dryRun) {
      console.log('🔍 DRY RUN: Would download new episodes from RSS feeds');
    } else {
      for (const site of sites) {
        const rssResult = await runLambdaWithMetrics(site.id, 'rss-retrieval', 'RSS retrieval');
        
        const siteIndex = sites.indexOf(site);
        results[siteIndex].rssRetrievalSuccess = rssResult.success;
        results[siteIndex].rssRetrievalDuration = rssResult.duration;
        results[siteIndex].newAudioFilesDownloaded = rssResult.newAudioFiles || 0;
        
        // Update hasNewFiles if new audio was downloaded
        if ((rssResult.newAudioFiles || 0) > 0) {
          results[siteIndex].hasNewFiles = true;
        }
        
        if (rssResult.error) {
          results[siteIndex].errors.push(rssResult.error);
        }
      }
    }
  } else {
    console.log('\n⏭️  Skipping Phase 2: RSS Retrieval (disabled)');
  }
  
  // Phase 3: Audio Processing for all sites
  if (config.phases.audioProcessing) {
    console.log('\n' + '='.repeat(60));
    console.log('🎵 Phase 3: Audio Processing for all sites');
    console.log('='.repeat(60));
    
    if (config.dryRun) {
      console.log('🔍 DRY RUN: Would transcribe new audio files using Whisper');
    } else {
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        const audioResult = await runLambdaWithMetrics(site.id, 'process-audio', 'Audio processing');
        
        // Update the existing result
        results[i].audioProcessingSuccess = audioResult.success;
        results[i].audioProcessingDuration = audioResult.duration;
        results[i].newEpisodesTranscribed = audioResult.newTranscripts || 0;
        
        // Update hasNewFiles if new transcripts were created
        if ((audioResult.newTranscripts || 0) > 0) {
          results[i].hasNewFiles = true;
        }
        
        // TODO: Investigate why search-entries folder may be uploading more files than expected.
        // We've seen cases where 450+ search-entry files get uploaded when only 1 new episode was processed.
        // This could indicate:
        // 1. Search entries are being regenerated unnecessarily during local indexing
        // 2. File timestamps/checksums causing AWS CLI to think files need re-uploading
        // 3. Search-entries directory structure changes affecting sync detection
        // Monitor this in future runs, especially multi-site runs.
        
        if (audioResult.error) {
          results[i].errors.push(audioResult.error);
        }
      }
    }
  } else {
    console.log('\n⏭️  Skipping Phase 3: Audio Processing (disabled)');
  }
  
  // Phase 3.5: Spelling Corrections Reapplication (optional)
  if (config.reapplySpellingCorrections) {
    console.log('\n' + '='.repeat(60));
    console.log('🔤 Phase 3.5: Spelling Corrections Reapplication for all sites');
    console.log('='.repeat(60));
    
    if (config.dryRun) {
      console.log('🔍 DRY RUN: Would reapply spelling corrections to all existing transcripts');
    } else {
      console.log('📝 Reapplying spelling corrections to all existing transcripts for all sites');
      
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        
        const spellingCorrectionsResult = await reapplySpellingCorrectionsToAllTranscripts(site.id);
        
        results[i].spellingCorrectionsReapplicationSuccess = spellingCorrectionsResult.success;
        results[i].spellingCorrectionsReapplicationDuration = spellingCorrectionsResult.duration;
        results[i].spellingCorrectionsFilesProcessed = spellingCorrectionsResult.filesProcessed || 0;
        results[i].spellingCorrectionsTotalCorrections = spellingCorrectionsResult.totalCorrections || 0;
        
        if (spellingCorrectionsResult.error) {
          results[i].errors.push(`Spelling corrections reapplication error: ${spellingCorrectionsResult.error}`);
        }
      }
    }
  } else {
    console.log('\n⏭️  Skipping Phase 3.5: Spelling Corrections Reapplication (disabled)');
  }
  
  // Phase 4: Local Indexing for sites with new files
  if (config.phases.localIndexing) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 Phase 4: Local Indexing for sites with new files');
    console.log('='.repeat(60));
    
    let sitesWithNewFiles = results.filter(result => result.hasNewFiles);
    
    // If force local indexing is enabled, include all sites
    if (config.forceLocalIndexing) {
      console.log('🔄 Force local indexing enabled - processing all sites');
      sitesWithNewFiles = results; // Include all sites
    }
    
    if (config.dryRun) {
      console.log(`🔍 DRY RUN: Would run local indexing for ${sitesWithNewFiles.length} site(s)`);
      if (config.forceLocalIndexing) {
        console.log('   (Force local indexing enabled - all sites included)');
      } else {
        console.log('   (Only sites with new files)');
      }
      sitesWithNewFiles.forEach(result => {
        console.log(`   - ${result.siteId}: ${config.forceLocalIndexing ? 'forced indexing' : 'has new files'}`);
      });
    } else {
      if (sitesWithNewFiles.length === 0) {
        console.log('ℹ️  No sites have new files. Skipping local indexing phase.');
      } else {
        if (config.forceLocalIndexing) {
          console.log(`📝 Processing ${sitesWithNewFiles.length} site(s) with forced local indexing:${sitesWithNewFiles.map(r => ` ${r.siteId}`).join(',')}`);
        } else {
          console.log(`📝 Found ${sitesWithNewFiles.length} site(s) with new files:${sitesWithNewFiles.map(r => ` ${r.siteId}`).join(',')}`);
        }
        
        for (const result of sitesWithNewFiles) {
          const resultIndex = results.findIndex(r => r.siteId === result.siteId);
          
          const localIndexingResult = await runLocalIndexingForSite(result.siteId);
          
          results[resultIndex].localIndexingSuccess = localIndexingResult.success;
          results[resultIndex].localIndexingDuration = localIndexingResult.duration;
          results[resultIndex].localIndexingEntriesProcessed = localIndexingResult.entriesProcessed || 0;
          
          // Mark that new search files were created if indexing succeeded
          if (localIndexingResult.success) {
            results[resultIndex].hasNewFiles = true; // Ensure this remains true since we created search files
          }
          
          if (localIndexingResult.error) {
            results[resultIndex].errors.push(`Local indexing error: ${localIndexingResult.error}`);
          }
        }
      }
    }
  } else {
    console.log('\n⏭️  Skipping Phase 4: Local indexing (disabled)');
  }
  
  // Phase 5: Final S3 sync for ALL new files (including search indices)
  if (config.phases.s3Sync) {
    console.log('\n' + '='.repeat(60));
    console.log('☁️  Phase 5: Upload new files to S3 (including search indices)');
    console.log('='.repeat(60));
    
    if (config.dryRun) {
      console.log('🔍 DRY RUN: Would check for files to upload (local→S3), upload missing files to S3, and refresh search-api Lambda for sites with uploads');
    } else {
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        const startTime = Date.now();
        
        try {
          // Assume AWS role and get temporary credentials
          const { siteConfig, tempCredentials } = await assumeAwsRole(site.id, 'post-sync', credentials);
          
          // Generate upload consistency report (only check local→S3)
          const uploadReport = await generateSyncConsistencyReport(
            site.id,
            siteConfig.bucketName,
            tempCredentials,
            SYNC_MODES.UPLOAD_ONLY
          );
          
          // Display the report
          displaySyncConsistencyReport(site.id, uploadReport);
          
          const duration = Date.now() - startTime;
          
          // Update results
          results[i].postConsistencyCheckSuccess = true;
          results[i].postConsistencyCheckDuration = duration;
          results[i].filesToUpload = uploadReport.summary.totalLocalOnlyFiles;
          results[i].filesInSync = uploadReport.summary.totalConsistentFiles;
          
          // Always sync episode-manifest folder (contains timestamp that updates every pipeline run)
          logInfo(`Always syncing episode-manifest folder for ${site.id} (contains updated timestamp)`);
          const episodeManifestSyncResult = await syncEpisodeManifestFolder(site.id, credentials);
          
          let totalFilesUploaded = episodeManifestSyncResult.totalFilesTransferred;
          let syncErrors: string[] = [];
          
          if (episodeManifestSyncResult.error) {
            syncErrors.push(`Episode-manifest sync error: ${episodeManifestSyncResult.error}`);
          }
          
          // Upload other files if any need to be uploaded
          if (uploadReport.summary.totalLocalOnlyFiles > 0) {
            const syncResult = await performComprehensiveS3Sync(
              site.id, 
              credentials, 
              uploadReport.summary.totalLocalOnlyFiles
            );
            
            totalFilesUploaded += syncResult.totalFilesTransferred;
            
            if (syncResult.error) {
              syncErrors.push(`Comprehensive S3 sync error: ${syncResult.error}`);
            }
          } else {
            logInfo(`No additional files to upload for ${site.id} beyond episode-manifest`);
          }
          
          // Set final sync results
          results[i].s3SyncSuccess = syncErrors.length === 0;
          results[i].s3SyncDuration = episodeManifestSyncResult.duration; // Comprehensive sync duration is tracked separately
          results[i].s3SyncTotalFilesUploaded = totalFilesUploaded;
          
          // Add any sync errors to results
          syncErrors.forEach(error => results[i].errors.push(error));
          
          // Trigger search-api Lambda refresh if any files were successfully uploaded
          if (results[i].s3SyncSuccess && totalFilesUploaded > 0) {
            logInfo(`Files uploaded to S3 for ${site.id}. Triggering search-api Lambda refresh...`);
            const refreshResult = await triggerSearchApiLambdaRefresh(site.id, credentials);
            
            results[i].searchApiRefreshSuccess = refreshResult.success;
            results[i].searchApiRefreshDuration = refreshResult.duration;
            
            if (refreshResult.error) {
              results[i].errors.push(`Search-api Lambda refresh error: ${refreshResult.error}`);
            }
          } else if (totalFilesUploaded === 0) {
            logInfo(`No files uploaded to S3 for ${site.id}. Skipping search-api Lambda refresh.`);
          } else {
            logInfo(`File upload failed for ${site.id}. Skipping search-api Lambda refresh.`);
          }
          
        } catch (error: any) {
          const duration = Date.now() - startTime;
          logError(`Failed final S3 sync for ${site.id}: ${error.message}`);
          
          results[i].postConsistencyCheckSuccess = false;
          results[i].postConsistencyCheckDuration = duration;
          results[i].filesToUpload = 0;
          results[i].filesInSync = 0;
          results[i].s3SyncSuccess = false;
          results[i].s3SyncDuration = duration;
          results[i].s3SyncTotalFilesUploaded = 0;
          results[i].errors.push(`Final S3 sync error: ${error.message}`);
        }
      }
    }
  } else {
    console.log('\n⏭️  Skipping Phase 5: S3 sync (disabled)');
  }
  
  // Phase 6: CloudFront Cache Invalidation for sites with successful uploads
  if (config.phases.cloudfrontInvalidation) {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 Phase 6: CloudFront Cache Invalidation');
    console.log('='.repeat(60));
    
    if (config.dryRun) {
      console.log('🔍 DRY RUN: Would invalidate CloudFront caches for sites with successful uploads');
    } else {
      const sitesWithUploads = results.filter(r => 
        (r.s3SyncTotalFilesUploaded || 0) > 0 && r.s3SyncSuccess
      );
      
      if (sitesWithUploads.length === 0) {
        console.log('ℹ️  No sites had successful uploads. Skipping CloudFront invalidation phase.');
      } else {
        console.log(`🔄 Found ${sitesWithUploads.length} site(s) with successful uploads:${sitesWithUploads.map(r => ` ${r.siteId}`).join(',')}`);
        
        for (let i = 0; i < sitesWithUploads.length; i++) {
          const result = sitesWithUploads[i];
          const resultIndex = results.findIndex(r => r.siteId === result.siteId);
          
          const invalidationResult = await invalidateCloudFrontForSite(result.siteId, credentials);
          
          results[resultIndex].cloudfrontInvalidationSuccess = invalidationResult.success;
          results[resultIndex].cloudfrontInvalidationDuration = invalidationResult.duration;
          
          if (invalidationResult.error) {
            results[resultIndex].errors.push(`CloudFront invalidation error: ${invalidationResult.error}`);
          }
        }
      }
    }
  } else {
    console.log('\n⏭️  Skipping Phase 6: CloudFront invalidation (disabled)');
  }
  
  // All phases complete - no more cloud indexing needed as we run indexing locally
  
  // Generate final summary
  const overallDuration = Date.now() - overallStartTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Final Summary');
  console.log('='.repeat(60));
  
  console.log(`\n⏱️  Overall Duration: ${(overallDuration / 1000).toFixed(1)}s (${(overallDuration / 1000 / 60).toFixed(1)} minutes)`);
  console.log(`🕐 Completed at: ${new Date().toISOString()}`);
  
  console.log('\n📈 Per-Site Results:');
  results.forEach(result => {
    // Check if phases were skipped via command line flags
    const preSyncStatus = !config.phases.preSync ? '⏭️' : (result.preConsistencyCheckSuccess ? '✅' : '❌');
    const rssStatus = !config.phases.rssRetrieval ? '⏭️' : (result.rssRetrievalSuccess ? '✅' : '❌');
    const audioStatus = !config.phases.audioProcessing ? '⏭️' : (result.audioProcessingSuccess ? '✅' : '❌');
    const spellingCorrectionsStatus = !config.reapplySpellingCorrections ? '⏭️' : 
      (result.spellingCorrectionsReapplicationSuccess === true ? '✅' : 
       result.spellingCorrectionsReapplicationSuccess === false ? '❌' : '⏸️');
    const localIndexingStatus = !config.phases.localIndexing ? '⏭️' : 
      (result.hasNewFiles
        ? (result.localIndexingSuccess === true ? '✅' : 
           result.localIndexingSuccess === false ? '❌' : '⏸️')
        : '⚪'); // Not needed
    const postSyncStatus = !config.phases.s3Sync ? '⏭️' : (result.postConsistencyCheckSuccess ? '✅' : '❌');
    const s3SyncStatus = !config.phases.s3Sync ? '⏭️' : 
      ((result.filesToUpload || 0) > 0
        ? (result.s3SyncSuccess ? '✅' : '❌')
        : '⚪'); // No sync needed
    const searchApiRefreshStatus = !config.phases.s3Sync ? '⏭️' :
      ((result.s3SyncTotalFilesUploaded || 0) > 0
        ? (result.searchApiRefreshSuccess === true ? '✅' : 
           result.searchApiRefreshSuccess === false ? '❌' : '⏸️')
        : '⚪'); // Not needed
    const cloudfrontInvalidationStatus = !config.phases.cloudfrontInvalidation ? '⏭️' :
      ((result.s3SyncTotalFilesUploaded || 0) > 0 && result.s3SyncSuccess
        ? (result.cloudfrontInvalidationSuccess === true ? '✅' : 
           result.cloudfrontInvalidationSuccess === false ? '❌' : '⏸️')
        : '⚪'); // Not needed
    
    const totalDuration = (result.preConsistencyCheckDuration || 0) + (result.s3PreSyncDuration || 0) + 
                         result.rssRetrievalDuration + result.audioProcessingDuration + 
                         (result.spellingCorrectionsReapplicationDuration || 0) +
                         (result.localIndexingDuration || 0) + (result.postConsistencyCheckDuration || 0) +
                         (result.s3SyncDuration || 0) + (result.searchApiRefreshDuration || 0) +
                         (result.cloudfrontInvalidationDuration || 0);
    
    console.log(`\n   ${result.siteId} (${result.siteTitle}):`);
    console.log(`      Phase 1 - Pre-sync: ${preSyncStatus} ${!config.phases.preSync ? '(skipped)' : `(${((result.preConsistencyCheckDuration || 0) / 1000).toFixed(1)}s) - ${result.s3PreSyncFilesDownloaded || 0} files downloaded`}`);
    console.log(`      Phase 2 - RSS: ${rssStatus} ${!config.phases.rssRetrieval ? '(skipped)' : `(${(result.rssRetrievalDuration / 1000).toFixed(1)}s) - ${result.newAudioFilesDownloaded} new audio files`}`);
    console.log(`      Phase 3 - Audio: ${audioStatus} ${!config.phases.audioProcessing ? '(skipped)' : `(${(result.audioProcessingDuration / 1000).toFixed(1)}s) - ${result.newEpisodesTranscribed} episodes transcribed`}`);
    console.log(`      Phase 3.5 - Spelling: ${spellingCorrectionsStatus} ${!config.reapplySpellingCorrections ? '(skipped)' : `(${((result.spellingCorrectionsReapplicationDuration || 0) / 1000).toFixed(1)}s) - ${result.spellingCorrectionsFilesProcessed || 0} files, ${result.spellingCorrectionsTotalCorrections || 0} corrections`}`);
    console.log(`      Phase 4 - Local Index: ${localIndexingStatus} ${!config.phases.localIndexing ? '(skipped)' : (result.hasNewFiles ? `(${((result.localIndexingDuration || 0) / 1000).toFixed(1)}s) - ${result.localIndexingEntriesProcessed || 0} entries` : '(not needed - no new files)')}`);
    console.log(`      Phase 5 - Final Sync: ${postSyncStatus} ${!config.phases.s3Sync ? '(skipped)' : `(${((result.postConsistencyCheckDuration || 0) / 1000).toFixed(1)}s)`}`);
    console.log(`      S3 Upload: ${s3SyncStatus} ${!config.phases.s3Sync ? '(skipped)' : ((result.filesToUpload || 0) > 0 ? `(${((result.s3SyncDuration || 0) / 1000).toFixed(1)}s) - ${result.s3SyncTotalFilesUploaded || 0} files uploaded` : '(no files to upload)')}`);
    console.log(`      Search-API Refresh: ${searchApiRefreshStatus} ${!config.phases.s3Sync ? '(skipped)' : ((result.s3SyncTotalFilesUploaded || 0) > 0 ? `(${((result.searchApiRefreshDuration || 0) / 1000).toFixed(1)}s)` : '(not needed)')}`);
    console.log(`      CloudFront Invalidation: ${cloudfrontInvalidationStatus} ${!config.phases.cloudfrontInvalidation ? '(skipped)' : ((result.s3SyncTotalFilesUploaded || 0) > 0 && result.s3SyncSuccess ? `(${((result.cloudfrontInvalidationDuration || 0) / 1000).toFixed(1)}s)` : '(not needed)')}`);
    console.log(`      📂 Has new files: ${result.hasNewFiles ? '✅' : '❌'}`);
    console.log(`      📁 Files in sync: ${result.filesInSync || 0}`);
    console.log(`      Total: ${(totalDuration / 1000).toFixed(1)}s`);
    
    if (result.errors.length > 0) {
      console.log(`      Errors: ${result.errors.join(', ')}`);
    }
  });
  
  // Overall statistics
  const successfulPreSyncCount = results.filter(r => r.preConsistencyCheckSuccess).length;
  const successfulRssCount = results.filter(r => r.rssRetrievalSuccess).length;
  const successfulAudioCount = results.filter(r => r.audioProcessingSuccess).length;
  const sitesWithNewFiles = results.filter(r => r.hasNewFiles).length;
  const successfulLocalIndexingCount = results.filter(r => r.hasNewFiles && r.localIndexingSuccess === true).length;
  const localIndexingAttempts = results.filter(r => r.hasNewFiles).length;
  const successfulPostSyncCount = results.filter(r => r.postConsistencyCheckSuccess).length;
  const sitesWithFilesToUpload = results.filter(r => (r.filesToUpload || 0) > 0).length;
  const successfulS3SyncCount = results.filter(r => (r.filesToUpload || 0) > 0 && r.s3SyncSuccess).length;
  const sitesWithUploads = results.filter(r => (r.s3SyncTotalFilesUploaded || 0) > 0).length;
  const successfulSearchApiRefreshCount = results.filter(r => (r.s3SyncTotalFilesUploaded || 0) > 0 && r.searchApiRefreshSuccess === true).length;
  const sitesWithCloudFrontInvalidation = results.filter(r => (r.s3SyncTotalFilesUploaded || 0) > 0 && r.s3SyncSuccess).length;
  const successfulCloudFrontInvalidationCount = results.filter(r => (r.s3SyncTotalFilesUploaded || 0) > 0 && r.s3SyncSuccess && r.cloudfrontInvalidationSuccess === true).length;
  const totalPreSyncFilesDownloaded = results.reduce((sum, r) => sum + (r.s3PreSyncFilesDownloaded || 0), 0);
  const totalFilesUploaded = results.reduce((sum, r) => sum + (r.s3SyncTotalFilesUploaded || 0), 0);
  const totalAudioFilesDownloaded = results.reduce((sum, r) => sum + r.newAudioFilesDownloaded, 0);
  const totalEpisodesTranscribed = results.reduce((sum, r) => sum + r.newEpisodesTranscribed, 0);
  const totalLocalIndexingEntriesProcessed = results.reduce((sum, r) => sum + (r.localIndexingEntriesProcessed || 0), 0);
  
  console.log('\n📊 Overall Statistics:');
  console.log(`   Sites processed: ${results.length}`);
  console.log(`   Phase 1 - Pre-sync success rate: ${successfulPreSyncCount}/${results.length} (${((successfulPreSyncCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Phase 2 - RSS Retrieval success rate: ${successfulRssCount}/${results.length} (${((successfulRssCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Phase 3 - Audio Processing success rate: ${successfulAudioCount}/${results.length} (${((successfulAudioCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Phase 4 - Local Indexing success rate: ${successfulLocalIndexingCount}/${localIndexingAttempts} (${localIndexingAttempts > 0 ? ((successfulLocalIndexingCount / localIndexingAttempts) * 100).toFixed(1) : 'N/A'}%)`);
  console.log(`   Phase 5 - Final Sync success rate: ${successfulPostSyncCount}/${results.length} (${((successfulPostSyncCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Sites with new files: ${sitesWithNewFiles}/${results.length}`);
  console.log(`   Sites with files to upload: ${sitesWithFilesToUpload}/${results.length}`);
  console.log(`   S3 Upload success rate: ${successfulS3SyncCount}/${sitesWithFilesToUpload} (${sitesWithFilesToUpload > 0 ? ((successfulS3SyncCount / sitesWithFilesToUpload) * 100).toFixed(1) : 'N/A'}%)`);
  console.log(`   Sites with successful uploads: ${sitesWithUploads}/${results.length}`);
  console.log(`   Search-API refresh success rate: ${successfulSearchApiRefreshCount}/${sitesWithUploads} (${sitesWithUploads > 0 ? ((successfulSearchApiRefreshCount / sitesWithUploads) * 100).toFixed(1) : 'N/A'}%)`);
  console.log(`   CloudFront invalidation success rate: ${successfulCloudFrontInvalidationCount}/${sitesWithCloudFrontInvalidation} (${sitesWithCloudFrontInvalidation > 0 ? ((successfulCloudFrontInvalidationCount / sitesWithCloudFrontInvalidation) * 100).toFixed(1) : 'N/A'}%)`);
  console.log(`   📥 Total Files Downloaded from S3: ${totalPreSyncFilesDownloaded}`);
  console.log(`   📤 Total Files Uploaded to S3: ${totalFilesUploaded}`);
  console.log(`   📥 Total Audio Files Downloaded: ${totalAudioFilesDownloaded}`);
  console.log(`   🎤 Total Episodes Transcribed: ${totalEpisodesTranscribed}`);
  console.log(`   🔍 Total Local Index Entries Processed: ${totalLocalIndexingEntriesProcessed}`);
  
  // Log pipeline results to file
  const endTime = new Date();
  try {
    const logger = new PipelineResultLogger();
    logger.logPipelineRun(results, startTime, endTime);
    console.log(`\n📝 Pipeline results logged to: ${logger.getLogFilePath()}`);
  } catch (error) {
    console.warn(`⚠️  Failed to log pipeline results: ${error instanceof Error ? error.message : error}`);
  }

  // Exit with appropriate code
  const hasErrors = results.some(r => r.errors.length > 0);
  if (hasErrors) {
    console.log('\n⚠️  Some operations failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All operations completed successfully!');
    console.log('🔄 Automation workflow complete - sites are up to date');
    process.exit(0);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Operation cancelled by user');
  process.exit(130);
});

main().catch((error) => {
  console.error('\n❌ Unexpected error:', error.message);
  process.exit(1);
});