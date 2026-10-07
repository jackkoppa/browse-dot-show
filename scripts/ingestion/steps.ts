import { invalidateCloudFrontWithCredentials } from '../lib/client-deployment.js';
import { loadSiteEnv, type AutomationCredentials } from '../lib/env.js';
import { runLambdaLocally } from '../lib/lambda.js';
import { logError, logProgress, logSuccess } from '../lib/logging.js';
import { assumeAwsRole } from '../lib/s3-sync.js';
import { execCommand } from '../lib/shell-exec.js';
import { getSiteCloudFrontId } from '../lib/site-accounts.js';
import { reapplySpellingCorrectionsToAllTranscripts as reapplySpellingCorrectionsFunction } from './spelling-corrections.js';

/** The individual steps the pipeline runs for each site. Each returns a result; none throw. */

/**
 * Trigger search-api Lambda to refresh its index after new files are uploaded
 * This ensures warm Lambda instances get the updated index file from S3
 */
export async function triggerSearchApiLambdaRefresh(
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
 * Run RSS retrieval locally for a site, streaming its output, and count new audio files.
 */
export async function runRssRetrieval(
  siteId: string
): Promise<{ success: boolean; duration: number; error?: string; newAudioFiles?: number }> {
  const operation = 'RSS retrieval';
  console.log(`\n🚀 Running ${operation} for site: ${siteId}`);

  const startTime = Date.now();
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`   🔄 ${operation} in progress for ${siteId}... (${elapsed}s elapsed)`);
  }, 10000);

  const result = await runLambdaLocally({ lambda: 'rss-retrieval', siteId });
  clearInterval(progressInterval);

  let newAudioFiles = 0;
  if (result.success) {
    const audioFilesMatch = result.stdout.match(/🎧 New Audio Files Downloaded: (\d+)/);
    if (audioFilesMatch) newAudioFiles = parseInt(audioFilesMatch[1], 10);

    console.log(`   ✅ ${operation} completed successfully for ${siteId} (${(result.duration / 1000).toFixed(1)}s)`);
  } else {
    console.log(`   ❌ ${operation} failed for ${siteId}: ${result.error} (${(result.duration / 1000).toFixed(1)}s)`);
  }

  return { success: result.success, duration: result.duration, error: result.error, newAudioFiles };
}

/**
 * Run local indexing for a site (SRT indexing to update local search index).
 * Output is captured; a one-line progress indicator is shown instead.
 */
export async function runLocalIndexingForSite(
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
export async function invalidateCloudFrontForSite(
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
export async function reapplySpellingCorrectionsToAllTranscripts(
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
