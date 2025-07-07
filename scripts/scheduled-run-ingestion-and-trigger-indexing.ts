#!/usr/bin/env tsx

/**
 * Scheduled Automation Script - Phase 3.1-3.6
 * 
 * This script is designed to run automatically and:
 * 1. Load automation credentials from .env.automation
 * 2. Run local ingestion for all 6 sites (RSS retrieval + audio processing)
 * 3. Detect which sites have new SRT files
 * 4. Trigger cloud indexing lambdas for sites with new SRT files using automation role
 * 
 * Usage: tsx scripts/scheduled-run-ingestion-and-trigger-indexing.ts
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { discoverSites, loadSiteEnvVars, Site } from './utils/site-selector.js';
import { execCommand } from './utils/shell-exec.js';
import { logInfo, logSuccess, logError, logWarning, logProgress, logHeader } from './utils/logging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SiteProcessingResult {
  siteId: string;
  siteTitle: string;
  rssRetrievalSuccess: boolean;
  rssRetrievalDuration: number;
  audioProcessingSuccess: boolean;
  audioProcessingDuration: number;
  newAudioFilesDownloaded: number;
  newEpisodesTranscribed: number;
  hasNewSrtFiles: boolean;
  s3SyncSuccess?: boolean;
  s3SyncDuration?: number;
  indexingTriggerSuccess?: boolean;
  indexingTriggerDuration?: number;
  errors: string[];
}

interface AutomationCredentials {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  SCHEDULED_RUN_MAIN_AWS_PROFILE: string;
}

interface SiteAccountMapping {
  [siteId: string]: {
    accountId: string;
    bucketName: string;
  };
}

// S3 Sync Types and Interfaces (extracted from s3-sync.ts)
type SyncDirection = 'local-to-s3' | 's3-to-local';
type ConflictResolution = 'overwrite-always' | 'overwrite-if-newer' | 'skip-existing';

interface SyncOptions {
  siteId: string;
  direction: SyncDirection;
  conflictResolution: ConflictResolution;
  localBasePath: string;
  s3BucketName: string;
  awsProfile?: string;
  roleArn?: string;
  tempCredentials?: any;
}

// Site account mappings - these match the terraform configurations
const SITE_ACCOUNT_MAPPINGS: SiteAccountMapping = {
  'hardfork': {
    accountId: '927984855345',
    bucketName: 'hardfork-browse-dot-show'
  },
  'claretandblue': {
    accountId: '152849157974',
    bucketName: 'claretandblue-browse-dot-show'
  },
  'listenfairplay': {
    accountId: '927984855345',
    bucketName: 'listenfairplay-browse-dot-show'
  },
  'naddpod': {
    accountId: '152849157974',
    bucketName: 'naddpod-browse-dot-show'
  },
  'myfavoritemurder': {
    accountId: '152849157974',
    bucketName: 'myfavoritemurder-browse-dot-show'
  },
  'searchengine': {
    accountId: '927984855345',
    bucketName: 'searchengine-browse-dot-show'
  }
};

/**
 * Load automation credentials from .env.automation file
 */
function loadAutomationCredentials(): AutomationCredentials {
  console.log('🔐 Loading automation credentials from .env.automation...');
  
  try {
    const envContent = readFileSync('.env.automation', 'utf-8');
    const credentials: Partial<AutomationCredentials> = {};
    
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=');
          if (['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'SCHEDULED_RUN_MAIN_AWS_PROFILE'].includes(key)) {
            (credentials as any)[key] = value;
          }
        }
      }
    }
    
    // Validate all required credentials are present
    const required: (keyof AutomationCredentials)[] = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'SCHEDULED_RUN_MAIN_AWS_PROFILE'];
    for (const key of required) {
      if (!credentials[key]) {
        throw new Error(`Missing required credential: ${key}`);
      }
    }
    
    console.log('✅ Automation credentials loaded successfully');
    return credentials as AutomationCredentials;
    
  } catch (error: any) {
    console.error('❌ Failed to load automation credentials:', error.message);
    console.error('Please ensure .env.automation exists and contains all required credentials');
    process.exit(1);
  }
}

/**
 * Get lambda function name from site terraform outputs
 */
async function getSiteIndexingLambdaName(siteId: string): Promise<string | null> {
  try {
    console.log(`🔍 Getting indexing lambda name for site: ${siteId}`);
    
    // Change to site terraform directory
    const originalCwd = process.cwd();
    process.chdir('terraform/sites');
    
    try {
      // Get terraform output for indexing lambda
      const result = await execCommand('terraform', [
        'output', 
        '-raw', 
        'indexing_lambda_function_name'
      ], { 
        silent: true,
        env: {
          ...process.env,
          TF_VAR_site_id: siteId
        }
      });
      
      if (result.exitCode === 0 && result.stdout.trim()) {
        const lambdaName = result.stdout.trim();
        console.log(`✅ Found indexing lambda for ${siteId}: ${lambdaName}`);
        return lambdaName;
      } else {
        console.warn(`⚠️  Could not get indexing lambda name for ${siteId}: ${result.stderr}`);
        return null;
      }
    } finally {
      process.chdir(originalCwd);
    }
  } catch (error: any) {
    console.error(`❌ Error getting indexing lambda name for ${siteId}:`, error.message);
    return null;
  }
}

/**
 * Trigger cloud indexing lambda for a site using automation role
 */
async function triggerIndexingLambda(
  siteId: string, 
  lambdaName: string, 
  credentials: AutomationCredentials
): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();
  
  console.log(`⚡ Triggering indexing lambda for ${siteId}: ${lambdaName}`);
  
  try {
    const siteConfig = SITE_ACCOUNT_MAPPINGS[siteId];
    if (!siteConfig) {
      throw new Error(`No account mapping found for site: ${siteId}`);
    }
    
    const roleArn = `arn:aws:iam::${siteConfig.accountId}:role/browse-dot-show-automation-role`;
    
    // First assume the role to get temporary credentials
    const assumeRoleResult = await execCommand('aws', [
      'sts', 'assume-role',
      '--role-arn', roleArn,
      '--role-session-name', `automation-indexing-${siteId}-${Date.now()}`
    ], {
      silent: true,
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: credentials.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: credentials.AWS_SECRET_ACCESS_KEY,
        AWS_REGION: credentials.AWS_REGION
      }
    });
    
    if (assumeRoleResult.exitCode !== 0) {
      throw new Error(`Failed to assume role: ${assumeRoleResult.stderr}`);
    }
    
    const assumeRoleOutput = JSON.parse(assumeRoleResult.stdout);
    const tempCredentials = assumeRoleOutput.Credentials;
    
    // Invoke the lambda function using the assumed role credentials
    const invokeResult = await execCommand('aws', [
      'lambda', 'invoke',
      '--function-name', lambdaName,
      '--invocation-type', 'Event', // Async invocation
      '--payload', '{}',
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
      console.log(`✅ Successfully triggered indexing lambda for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
      return { success: true, duration };
    } else {
      const error = `Lambda invoke failed: ${invokeResult.stderr}`;
      console.error(`❌ Failed to trigger indexing lambda for ${siteId}: ${error}`);
      return { success: false, duration, error };
    }
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ Error triggering indexing lambda for ${siteId}:`, error.message);
    return { success: false, duration, error: error.message };
  }
}

/**
 * Execute AWS S3 sync command (extracted from s3-sync.ts)
 */
async function executeS3Sync(
  source: string,
  destination: string,
  options: SyncOptions,
  folder: string
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const args = ['s3', 'sync', source, destination];
    
    // Add conflict resolution flags
    if (options.conflictResolution === 'overwrite-always') {
      args.push('--delete');
    } else if (options.conflictResolution === 'skip-existing') {
      args.push('--size-only');
    }
    // For 'overwrite-if-newer', AWS CLI default behavior handles this
    
    // Exclude system files
    args.push('--exclude', '.DS_Store');
    
    // Add verbosity for better tracking
    args.push('--cli-read-timeout', '0', '--cli-connect-timeout', '60');
    
    logProgress(`Syncing ${folder}: ${source} → ${destination}`);
    
    const syncCmd = spawn('aws', args, { 
      stdio: 'pipe',
      env: {
        ...process.env,
        ...(options.tempCredentials ? {
          AWS_ACCESS_KEY_ID: options.tempCredentials.AccessKeyId,
          AWS_SECRET_ACCESS_KEY: options.tempCredentials.SecretAccessKey,
          AWS_SESSION_TOKEN: options.tempCredentials.SessionToken
        } : {})
      }
    });
    
    let output = '';
    let errorOutput = '';
    
    syncCmd.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Show progress for uploads
      if (text.includes('upload:')) {
        logInfo(`   ${text.trim()}`);
      }
    });
    
    syncCmd.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    syncCmd.on('close', (code) => {
      if (code === 0) {
        logSuccess(`${folder} sync completed`);
        resolve({ success: true, output });
      } else {
        logError(`${folder} sync failed: ${errorOutput}`);
        resolve({ success: false, output: errorOutput });
      }
    });
  });
}

/**
 * Sync transcripts folder to S3 for a site with new SRT files
 */
async function syncTranscriptsToS3(
  siteId: string,
  credentials: AutomationCredentials
): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();
  
  logProgress(`Syncing new transcripts to S3 for ${siteId}`);
  
  try {
    const siteConfig = SITE_ACCOUNT_MAPPINGS[siteId];
    if (!siteConfig) {
      throw new Error(`No account mapping found for site: ${siteId}`);
    }
    
    const roleArn = `arn:aws:iam::${siteConfig.accountId}:role/browse-dot-show-automation-role`;
    
    // First assume the role to get temporary credentials
    const assumeRoleResult = await execCommand('aws', [
      'sts', 'assume-role',
      '--role-arn', roleArn,
      '--role-session-name', `automation-s3-sync-${siteId}-${Date.now()}`
    ], {
      silent: true,
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: credentials.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: credentials.AWS_SECRET_ACCESS_KEY,
        AWS_REGION: credentials.AWS_REGION
      }
    });
    
    if (assumeRoleResult.exitCode !== 0) {
      throw new Error(`Failed to assume role: ${assumeRoleResult.stderr}`);
    }
    
    const assumeRoleOutput = JSON.parse(assumeRoleResult.stdout);
    const tempCredentials = assumeRoleOutput.Credentials;
    
    // Set up sync options
    const localBasePath = path.resolve(__dirname, '..', 'aws-local-dev', 's3', 'sites', siteId);
    const localTranscriptsPath = path.join(localBasePath, 'transcripts');
    const s3TranscriptsPath = `s3://${siteConfig.bucketName}/transcripts`;
    
    // Ensure local directory exists
    if (!fs.existsSync(localTranscriptsPath)) {
      logWarning(`No transcripts directory found for ${siteId}: ${localTranscriptsPath}`);
      return { success: true, duration: Date.now() - startTime }; // Not an error - just no files to sync
    }
    
    const syncOptions: SyncOptions = {
      siteId,
      direction: 'local-to-s3',
      conflictResolution: 'overwrite-if-newer',
      localBasePath,
      s3BucketName: siteConfig.bucketName,
      tempCredentials
    };
    
    // Sync transcripts folder
    const result = await executeS3Sync(
      localTranscriptsPath + '/',
      s3TranscriptsPath + '/',
      syncOptions,
      'transcripts'
    );
    
    if (!result.success) {
      throw new Error(`S3 sync failed: ${result.output}`);
    }
    
    const duration = Date.now() - startTime;
    logSuccess(`Transcripts synced to S3 for ${siteId} in ${duration}ms`);
    return { success: true, duration };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(`Failed to sync transcripts to S3 for ${siteId}: ${error.message}`);
    return { success: false, duration, error: error.message };
  }
}

/**
 * Run a command with site context and capture output to extract metrics
 */
async function runCommandWithSiteContext(
  siteId: string,
  command: string,
  args: string[],
  operation: string
): Promise<{ success: boolean; duration: number; error?: string; newAudioFiles?: number; newTranscripts?: number }> {
  const startTime = Date.now();
  
  console.log(`\n🚀 Running ${operation} for site: ${siteId}`);
  console.log(`   Command: ${command} ${args.join(' ')}`);
  
  return new Promise((resolve) => {
    try {
      // Load site-specific environment variables
      const siteEnvVars = loadSiteEnvVars(siteId, 'local');
      
      // Merge with current environment, giving priority to site-specific vars
      const envVars = {
        ...process.env,
        ...siteEnvVars,
        SELECTED_SITE_ID: siteId,
        CURRENT_SITE_ID: siteId,
        FILE_STORAGE_ENV: 'local'  // Ensure we're using local storage for all operations
      };

      let stdout = '';
      let stderr = '';

      const child = spawn(command, args, {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
        env: envVars,
        cwd: process.cwd()
      });

      // Capture stdout and stderr while also displaying them
      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });

      child.on('close', (code: number | null) => {
        const duration = Date.now() - startTime;
        const success = code === 0;
        
        // Parse metrics from output
        let newAudioFiles = 0;
        let newTranscripts = 0;

        if (success) {
          // Extract metrics from RSS retrieval output
          const audioFilesMatch = stdout.match(/🎧 New Audio Files Downloaded: (\d+)/);
          if (audioFilesMatch) {
            newAudioFiles = parseInt(audioFilesMatch[1], 10);
          }

          // Extract metrics from audio processing output
          const transcriptsMatch = stdout.match(/✅ Successfully Processed: (\d+)/);
          if (transcriptsMatch) {
            newTranscripts = parseInt(transcriptsMatch[1], 10);
          }

          console.log(`   ✅ ${operation} completed successfully for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
        } else {
          console.log(`   ❌ ${operation} failed for ${siteId} with exit code ${code} (${(duration / 1000).toFixed(1)}s)`);
        }
        
        resolve({
          success,
          duration,
          error: success ? undefined : `Exit code: ${code}`,
          newAudioFiles,
          newTranscripts
        });
      });

      child.on('error', (error: Error) => {
        const duration = Date.now() - startTime;
        console.log(`   ❌ ${operation} failed for ${siteId} with error: ${error.message} (${(duration / 1000).toFixed(1)}s)`);
        
        resolve({
          success: false,
          duration,
          error: error.message,
          newAudioFiles: 0,
          newTranscripts: 0
        });
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.log(`   ❌ ${operation} failed for ${siteId} with error: ${error.message} (${(duration / 1000).toFixed(1)}s)`);
      
      resolve({
        success: false,
        duration,
        error: error.message,
        newAudioFiles: 0,
        newTranscripts: 0
      });
    }
  });
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('🤖 Scheduled Ingestion and Indexing Automation');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  
  // Load automation credentials
  const credentials = loadAutomationCredentials();
  
  // Ensure we're running in local mode for all file operations
  process.env.FILE_STORAGE_ENV = 'local';
  
  // Discover all available sites
  const sites = discoverSites();
  
  if (sites.length === 0) {
    console.error('❌ No sites found! Please create a site in /sites/my-sites/ or /sites/origin-sites/');
    process.exit(1);
  }
  
  console.log(`\n📍 Found ${sites.length} site(s):`);
  sites.forEach((site: Site) => {
    console.log(`   - ${site.id} (${site.title})`);
  });
  
  const results: SiteProcessingResult[] = [];
  const overallStartTime = Date.now();
  
  // Phase 1: RSS Retrieval for all sites
  console.log('\n' + '='.repeat(60));
  console.log('📡 Phase 1: RSS Retrieval for all sites');
  console.log('='.repeat(60));
  
  for (const site of sites) {
    const rssResult = await runCommandWithSiteContext(
      site.id,
      'pnpm',
      ['--filter', '@browse-dot-show/rss-retrieval-lambda', 'run', 'run:local'],
      'RSS retrieval'
    );
    
    results.push({
      siteId: site.id,
      siteTitle: site.title,
      rssRetrievalSuccess: rssResult.success,
      rssRetrievalDuration: rssResult.duration,
      audioProcessingSuccess: false,
      audioProcessingDuration: 0,
      newAudioFilesDownloaded: rssResult.newAudioFiles || 0,
      newEpisodesTranscribed: 0,
      hasNewSrtFiles: false,
      errors: rssResult.error ? [rssResult.error] : []
    });
  }
  
  // Phase 2: Audio Processing for all sites
  console.log('\n' + '='.repeat(60));
  console.log('🎵 Phase 2: Audio Processing for all sites');
  console.log('='.repeat(60));
  
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const audioResult = await runCommandWithSiteContext(
      site.id,
      'pnpm',
      ['--filter', '@browse-dot-show/process-audio-lambda', 'run', 'run:local'],
      'Audio processing'
    );
    
    // Update the existing result
    results[i].audioProcessingSuccess = audioResult.success;
    results[i].audioProcessingDuration = audioResult.duration;
    results[i].newEpisodesTranscribed = audioResult.newTranscripts || 0;
    results[i].hasNewSrtFiles = (audioResult.newTranscripts || 0) > 0;
    
    if (audioResult.error) {
      results[i].errors.push(audioResult.error);
    }
  }
  
  // Phase 3: Sync new transcripts to S3 for sites with new SRT files
  console.log('\n' + '='.repeat(60));
  console.log('☁️  Phase 3: Sync new transcripts to S3 for sites with new SRT files');
  console.log('='.repeat(60));
  
  const sitesWithNewSrtsForSync = results.filter(result => result.hasNewSrtFiles && result.audioProcessingSuccess);
  
  if (sitesWithNewSrtsForSync.length === 0) {
    console.log('ℹ️  No sites have new SRT files. Skipping S3 sync phase.');
  } else {
    console.log(`📝 Found ${sitesWithNewSrtsForSync.length} site(s) with new SRT files to sync:${sitesWithNewSrtsForSync.map(r => ` ${r.siteId}`).join(',')}`);
    
    for (const result of sitesWithNewSrtsForSync) {
      const resultIndex = results.findIndex(r => r.siteId === result.siteId);
      
      // Sync transcripts to S3
      const syncResult = await syncTranscriptsToS3(result.siteId, credentials);
      
      results[resultIndex].s3SyncSuccess = syncResult.success;
      results[resultIndex].s3SyncDuration = syncResult.duration;
      
      if (syncResult.error) {
        results[resultIndex].errors.push(`S3 sync error: ${syncResult.error}`);
      }
    }
  }
  
  // Phase 4: Trigger Cloud Indexing for sites with successfully synced SRT files
  console.log('\n' + '='.repeat(60));
  console.log('⚡ Phase 4: Trigger Cloud Indexing for sites with successfully synced SRT files');
  console.log('='.repeat(60));
  
  const sitesWithSuccessfulSync = results.filter(result => 
    result.hasNewSrtFiles && 
    result.audioProcessingSuccess && 
    (result.s3SyncSuccess !== false) // Include sites where sync wasn't attempted (no new files) or was successful
  );
  
  if (sitesWithSuccessfulSync.length === 0) {
    console.log('ℹ️  No sites have successfully synced SRT files. Skipping cloud indexing phase.');
  } else {
    console.log(`📝 Found ${sitesWithSuccessfulSync.length} site(s) with successfully synced SRT files:${sitesWithSuccessfulSync.map(r => ` ${r.siteId}`).join(',')}`);
    
    for (const result of sitesWithSuccessfulSync) {
      const resultIndex = results.findIndex(r => r.siteId === result.siteId);
      
      // Get lambda function name from terraform outputs
      const lambdaName = await getSiteIndexingLambdaName(result.siteId);
      
      if (!lambdaName) {
        console.error(`❌ Could not get indexing lambda name for ${result.siteId}, skipping cloud indexing`);
        results[resultIndex].errors.push('Could not get indexing lambda name');
        continue;
      }
      
      // Trigger the indexing lambda
      const indexingResult = await triggerIndexingLambda(result.siteId, lambdaName, credentials);
      
      results[resultIndex].indexingTriggerSuccess = indexingResult.success;
      results[resultIndex].indexingTriggerDuration = indexingResult.duration;
      
      if (indexingResult.error) {
        results[resultIndex].errors.push(indexingResult.error);
      }
    }
  }
  
  // Generate final summary
  const overallDuration = Date.now() - overallStartTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Final Summary');
  console.log('='.repeat(60));
  
  console.log(`\n⏱️  Overall Duration: ${(overallDuration / 1000).toFixed(1)}s (${(overallDuration / 1000 / 60).toFixed(1)} minutes)`);
  console.log(`🕐 Completed at: ${new Date().toISOString()}`);
  
  console.log('\n📈 Per-Site Results:');
  results.forEach(result => {
    const rssStatus = result.rssRetrievalSuccess ? '✅' : '❌';
    const audioStatus = result.audioProcessingSuccess ? '✅' : '❌';
    const s3SyncStatus = result.hasNewSrtFiles 
      ? (result.s3SyncSuccess ? '✅' : '❌')
      : '⚪'; // No sync needed
    const indexingStatus = result.hasNewSrtFiles 
      ? (result.indexingTriggerSuccess ? '✅' : '❌')
      : '⚪'; // No indexing needed
    const totalDuration = result.rssRetrievalDuration + result.audioProcessingDuration + (result.s3SyncDuration || 0) + (result.indexingTriggerDuration || 0);
    
    console.log(`\n   ${result.siteId} (${result.siteTitle}):`);
    console.log(`      RSS Retrieval: ${rssStatus} (${(result.rssRetrievalDuration / 1000).toFixed(1)}s)`);
    console.log(`      Audio Processing: ${audioStatus} (${(result.audioProcessingDuration / 1000).toFixed(1)}s)`);
    console.log(`      S3 Sync: ${s3SyncStatus} ${result.hasNewSrtFiles ? `(${((result.s3SyncDuration || 0) / 1000).toFixed(1)}s)` : '(not needed)'}`);
    console.log(`      Cloud Indexing: ${indexingStatus} ${result.hasNewSrtFiles ? `(${((result.indexingTriggerDuration || 0) / 1000).toFixed(1)}s)` : '(not needed)'}`);
    console.log(`      📥 New Audio Files Downloaded: ${result.newAudioFilesDownloaded}`);
    console.log(`      🎤 Episodes Transcribed: ${result.newEpisodesTranscribed}`);
    console.log(`      Total: ${(totalDuration / 1000).toFixed(1)}s`);
    
    if (result.errors.length > 0) {
      console.log(`      Errors: ${result.errors.join(', ')}`);
    }
  });
  
  // Overall statistics
  const successfulRssCount = results.filter(r => r.rssRetrievalSuccess).length;
  const successfulAudioCount = results.filter(r => r.audioProcessingSuccess).length;
  const sitesWithNewSrtsCount = results.filter(r => r.hasNewSrtFiles).length;
  const successfulS3SyncCount = results.filter(r => r.hasNewSrtFiles && r.s3SyncSuccess).length;
  const successfulIndexingCount = results.filter(r => r.hasNewSrtFiles && r.indexingTriggerSuccess).length;
  const totalAudioFilesDownloaded = results.reduce((sum, r) => sum + r.newAudioFilesDownloaded, 0);
  const totalEpisodesTranscribed = results.reduce((sum, r) => sum + r.newEpisodesTranscribed, 0);
  
  console.log('\n📊 Overall Statistics:');
  console.log(`   Sites processed: ${results.length}`);
  console.log(`   RSS Retrieval success rate: ${successfulRssCount}/${results.length} (${((successfulRssCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Audio Processing success rate: ${successfulAudioCount}/${results.length} (${((successfulAudioCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Sites with new SRT files: ${sitesWithNewSrtsCount}`);
  console.log(`   S3 Sync success rate: ${successfulS3SyncCount}/${sitesWithNewSrtsCount} (${sitesWithNewSrtsCount > 0 ? ((successfulS3SyncCount / sitesWithNewSrtsCount) * 100).toFixed(1) : 0}%)`);
  console.log(`   Cloud Indexing success rate: ${successfulIndexingCount}/${sitesWithNewSrtsCount} (${sitesWithNewSrtsCount > 0 ? ((successfulIndexingCount / sitesWithNewSrtsCount) * 100).toFixed(1) : 0}%)`);
  console.log(`   📥 Total Audio Files Downloaded: ${totalAudioFilesDownloaded}`);
  console.log(`   🎤 Total Episodes Transcribed: ${totalEpisodesTranscribed}`);
  
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