import { loadAutomationCredentials, type AutomationCredentials } from '../lib/env.js';
import { logError, logInfo } from '../lib/logging.js';
import { PipelineResultLogger } from '../lib/pipeline-result-logger.js';
import {
  assumeAwsRole,
  performComprehensiveS3Sync,
  performS3ToLocalPreSync,
  syncEpisodeManifestFolder,
} from '../lib/s3-sync.js';
import { displaySyncConsistencyReport, generateSyncConsistencyReport, SYNC_MODES } from '../lib/sync-consistency-checker.js';
import {
  invalidateCloudFrontForSite,
  reapplySpellingCorrectionsToAllTranscripts,
  runRssRetrieval,
  runLocalIndexingForSite,
  triggerSearchApiLambdaRefresh,
} from './steps.js';
import { sitesWithStaleSearchIndex } from './index-freshness.js';
import { buildRunSummary, writeRunSummary } from './run-summary.js';
import { printPipelineSummary } from './summary.js';
import { runParallelTranscription } from './transcription.js';
import type { PipelineConfig, SiteProcessingResult } from './types.js';

/**
 * The ingestion pipeline, for the given sites:
 *
 * 1. Pre-sync: download files from S3 that don't exist locally (so a machine that's been
 *    offline catches up instead of re-downloading or re-transcribing)
 * 2. RSS retrieval: download new episodes
 * 3. Transcription: transcribe new audio with local whisper
 * 4. Local indexing: rebuild the search index for sites with new files, or whose
 *    transcripts are newer than their index (e.g. after a manual `bds lambda run`)
 * 5. S3 sync: upload new local files (incl. search index), then refresh the search lambda
 * 6. CloudFront invalidation for sites with uploads
 *
 * S3 phases use the automation user (`.env.automation`) and assume
 * `browse-dot-show-automation-role` in each site's account.
 *
 * Returns the process exit code: 0 if every step succeeded, 1 otherwise.
 */
export async function runPipeline(config: PipelineConfig): Promise<number> {
  const startTime = new Date();
  const sites = config.sites;

  console.log('🤖 Ingestion Pipeline');
  console.log('='.repeat(60));
  console.log(`Started at: ${startTime.toISOString()}`);

  // Only S3/CloudFront phases need AWS credentials; load them up front (even for a dry run)
  // so a missing or incomplete .env.automation fails before any work starts
  const needsAws = config.phases.preSync || config.phases.s3Sync || config.phases.cloudfrontInvalidation;
  const credentials: AutomationCredentials = needsAws
    ? loadAutomationCredentials()
    : (undefined as unknown as AutomationCredentials);

  // Lambdas run locally and read/write the local S3 mirror
  process.env.FILE_STORAGE_ENV = 'local';

  console.log(`\n📍 ${sites.length} site(s) to process:`);
  sites.forEach(site => console.log(`   - ${site.id} (${site.title})`));

  // Display configuration summary
  console.log('\n⚙️  Configuration Summary:');
  console.log(`   Execution mode: ${config.dryRun ? 'DRY RUN (preview only)' : 'Full execution'}`);
  console.log(`   Enabled phases:`);
  if (config.phases.preSync) console.log(`     ✅ Phase 1: Pre-sync check`);
  if (config.phases.rssRetrieval) console.log(`     ✅ Phase 2: RSS retrieval`);
  if (config.phases.audioProcessing) console.log(`     ✅ Phase 3: Audio processing (${config.parallel} parallel worker(s))`);
  if (config.reapplySpellingCorrections) console.log(`     ✅ Phase 3.5: Spelling corrections reapplication`);
  if (config.phases.localIndexing) console.log(`     ✅ Phase 4: Local indexing`);
  if (config.phases.s3Sync) console.log(`     ✅ Phase 5: S3 sync`);
  if (config.phases.cloudfrontInvalidation) console.log(`     ✅ Phase 6: CloudFront invalidation`);
  
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
        const rssResult = await runRssRetrieval(site.id);
        
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
      // All selected sites' untranscribed files, split across `config.parallel` workers
      console.log(`Transcribing with ${config.parallel} parallel worker(s)`);
      const transcriptionResults = await runParallelTranscription({ sites, parallel: config.parallel });

      for (const transcription of transcriptionResults) {
        const result = results.find(r => r.siteId === transcription.siteId)!;
        result.audioProcessingSuccess = transcription.success;
        result.audioProcessingDuration = transcription.duration;
        result.newEpisodesTranscribed = transcription.transcribed;
        if (transcription.transcribed > 0) result.hasNewFiles = true;
        result.errors.push(...transcription.errors);
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
  
  // Phase 4: Local Indexing for sites with new files or a stale index
  if (config.phases.localIndexing) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 Phase 4: Local Indexing for sites with new files or a stale index');
    console.log('='.repeat(60));

    // Why each site needs indexing. A stale index (transcripts newer than it) catches
    // transcription done outside this run, e.g. a manual `bds lambda run`.
    const staleSiteIds = new Set(sitesWithStaleSearchIndex(results.map(r => r.siteId)));
    const indexingReason = (result: SiteProcessingResult): string | undefined => {
      if (config.forceLocalIndexing) return 'forced indexing';
      if (result.hasNewFiles) return 'has new files';
      if (staleSiteIds.has(result.siteId)) return 'transcripts newer than search index';
      return undefined;
    };
    const sitesToIndex = results.filter(result => indexingReason(result) !== undefined);

    if (config.dryRun) {
      console.log(`🔍 DRY RUN: Would run local indexing for ${sitesToIndex.length} site(s)`);
      sitesToIndex.forEach(result => {
        console.log(`   - ${result.siteId}: ${indexingReason(result)}`);
      });
    } else {
      if (sitesToIndex.length === 0) {
        console.log('ℹ️  No sites have new files or a stale index. Skipping local indexing phase.');
      } else {
        console.log(`📝 Indexing ${sitesToIndex.length} site(s):`);
        sitesToIndex.forEach(result => console.log(`   - ${result.siteId}: ${indexingReason(result)}`));

        for (const result of sitesToIndex) {
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
          // Search reads only the search index, not the episode manifest (uploaded every run)
          let searchFilesUploaded = 0;
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
            searchFilesUploaded = syncResult.totalFilesTransferred;
            
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
          
          // Trigger search-api Lambda refresh if files besides the episode manifest were uploaded
          if (results[i].s3SyncSuccess && searchFilesUploaded > 0) {
            logInfo(`Files uploaded to S3 for ${site.id}. Triggering search-api Lambda refresh...`);
            const refreshResult = await triggerSearchApiLambdaRefresh(site.id, credentials);
            
            results[i].searchApiRefreshSuccess = refreshResult.success;
            results[i].searchApiRefreshDuration = refreshResult.duration;
            
            if (refreshResult.error) {
              results[i].errors.push(`Search-api Lambda refresh error: ${refreshResult.error}`);
            }
          } else if (searchFilesUploaded === 0) {
            logInfo(`No files besides the episode manifest uploaded to S3 for ${site.id}. Skipping search-api Lambda refresh.`);
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
  
  printPipelineSummary(results, config, overallStartTime);

  // Log pipeline results to file
  const endTime = new Date();
  try {
    const logger = new PipelineResultLogger();
    logger.logPipelineRun(results, startTime, endTime);
    console.log(`\n📝 Pipeline results logged to: ${logger.getLogFilePath()}`);
  } catch (error) {
    console.warn(`⚠️  Failed to log pipeline results: ${error instanceof Error ? error.message : error}`);
  }

  const exitCode = results.some(r => r.errors.length > 0) ? 1 : 0;
  if (config.summaryJsonPath) {
    try {
      writeRunSummary(config.summaryJsonPath, buildRunSummary(results, { startedAt: startTime, endedAt: endTime, dryRun: config.dryRun, exitCode }));
    } catch (error) {
      console.warn(`⚠️  Failed to write the run summary: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (exitCode !== 0) {
    console.log('\n⚠️  Some operations failed. Check the errors above.');
    return exitCode;
  }
  console.log('\n🎉 All operations completed successfully!');
  return 0;
}
