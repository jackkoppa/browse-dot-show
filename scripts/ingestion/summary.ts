import type { PipelineConfig, SiteProcessingResult } from './types.js';

/** Print the per-site results and overall statistics at the end of a pipeline run. */
export function printPipelineSummary(results: SiteProcessingResult[], config: PipelineConfig, overallStartTime: number): void {
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
    // Refreshed only when files besides the episode manifest were uploaded
    const searchApiRefreshRan = result.searchApiRefreshSuccess !== undefined;
    const searchApiRefreshStatus = !config.phases.s3Sync ? '⏭️' :
      (searchApiRefreshRan ? (result.searchApiRefreshSuccess ? '✅' : '❌') : '⚪'); // Not needed
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
    console.log(`      Search-API Refresh: ${searchApiRefreshStatus} ${!config.phases.s3Sync ? '(skipped)' : (searchApiRefreshRan ? `(${((result.searchApiRefreshDuration || 0) / 1000).toFixed(1)}s)` : '(not needed)')}`);
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
  const sitesWithSearchApiRefresh = results.filter(r => r.searchApiRefreshSuccess !== undefined).length;
  const successfulSearchApiRefreshCount = results.filter(r => r.searchApiRefreshSuccess === true).length;
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
  console.log(`   Search-API refresh success rate: ${successfulSearchApiRefreshCount}/${sitesWithSearchApiRefresh} (${sitesWithSearchApiRefresh > 0 ? ((successfulSearchApiRefreshCount / sitesWithSearchApiRefresh) * 100).toFixed(1) : 'N/A'}%)`);
  console.log(`   CloudFront invalidation success rate: ${successfulCloudFrontInvalidationCount}/${sitesWithCloudFrontInvalidation} (${sitesWithCloudFrontInvalidation > 0 ? ((successfulCloudFrontInvalidationCount / sitesWithCloudFrontInvalidation) * 100).toFixed(1) : 'N/A'}%)`);
  console.log(`   📥 Total Files Downloaded from S3: ${totalPreSyncFilesDownloaded}`);
  console.log(`   📤 Total Files Uploaded to S3: ${totalFilesUploaded}`);
  console.log(`   📥 Total Audio Files Downloaded: ${totalAudioFilesDownloaded}`);
  console.log(`   🎤 Total Episodes Transcribed: ${totalEpisodesTranscribed}`);
  console.log(`   🔍 Total Local Index Entries Processed: ${totalLocalIndexingEntriesProcessed}`);
}
