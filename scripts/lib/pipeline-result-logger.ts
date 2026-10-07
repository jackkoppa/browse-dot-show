import * as fs from 'fs';
import * as path from 'path';

interface SiteProcessingResult {
  siteId: string;
  siteTitle: string;
  s3PreSyncSuccess?: boolean;
  s3PreSyncDuration?: number;
  s3PreSyncFilesDownloaded?: number;
  syncConsistencyCheckSuccess?: boolean;
  syncConsistencyCheckDuration?: number;
  filesToUpload?: number;
  filesMissingLocally?: number;
  filesInSync?: number;
  rssRetrievalSuccess: boolean;
  rssRetrievalDuration: number;
  audioProcessingSuccess: boolean;
  audioProcessingDuration: number;
  newAudioFilesDownloaded: number;
  newEpisodesTranscribed: number;
  hasNewSrtFiles: boolean;
  s3SyncSuccess?: boolean;
  s3SyncDuration?: number;
  s3SyncTotalFilesUploaded?: number;
  indexingTriggerSuccess?: boolean;
  indexingTriggerDuration?: number;
  localIndexingSuccess?: boolean;
  localIndexingDuration?: number;
  localIndexingEntriesProcessed?: number;
  errors: string[];
}

interface PipelineRunLog {
  timestamp: Date;
  startTime: Date;
  endTime: Date;
  duration: number;
  sitesProcessed: number;
  totalFilesUploaded: number;
  totalAudioFilesDownloaded: number;
  totalEpisodesTranscribed: number;
  hasErrors: boolean;
  errorCount: number;
  results: SiteProcessingResult[];
}

/**
 * Logs pipeline results to a markdown file with most recent entries first
 */
export class PipelineResultLogger {
  private readonly logFilePath: string;

  constructor(projectRoot: string = process.cwd()) {
    this.logFilePath = path.join(projectRoot, 'scripts/automation-logs/ingestion-pipeline-runs.md');
  }

  /**
   * Logs the results of a pipeline run
   */
  logPipelineRun(
    results: SiteProcessingResult[],
    startTime: Date,
    endTime: Date = new Date()
  ): void {
    const duration = endTime.getTime() - startTime.getTime();
    
    // Calculate summary statistics
    const sitesProcessed = results.length;
    const totalFilesUploaded = results.reduce((sum, r) => sum + (r.s3SyncTotalFilesUploaded || 0), 0);
    const totalAudioFilesDownloaded = results.reduce((sum, r) => sum + r.newAudioFilesDownloaded, 0);
    const totalEpisodesTranscribed = results.reduce((sum, r) => sum + r.newEpisodesTranscribed, 0);
    const hasErrors = results.some(r => r.errors.length > 0);
    const errorCount = results.reduce((sum, r) => sum + r.errors.length, 0);

    const runLog: PipelineRunLog = {
      timestamp: endTime,
      startTime,
      endTime,
      duration,
      sitesProcessed,
      totalFilesUploaded,
      totalAudioFilesDownloaded,
      totalEpisodesTranscribed,
      hasErrors,
      errorCount,
      results
    };

    this.appendLogEntry(runLog);
  }

  /**
   * Appends a new log entry to the beginning of the file
   */
  private appendLogEntry(runLog: PipelineRunLog): void {
    const newEntry = this.formatLogEntry(runLog);
    
    let existingContent = '';
    if (fs.existsSync(this.logFilePath)) {
      existingContent = fs.readFileSync(this.logFilePath, 'utf8');
      
      // Remove the header if it exists, we'll add it back
      if (existingContent.startsWith('# Ingestion Pipeline Run History')) {
        const headerEndIndex = existingContent.indexOf('\n\n');
        if (headerEndIndex !== -1) {
          existingContent = existingContent.substring(headerEndIndex + 2);
        }
      }
    }

    // Combine new entry with existing content (new entry first)
    const header = this.generateHeader();
    const fullContent = header + newEntry + (existingContent ? '\n' + existingContent : '');
    
    fs.writeFileSync(this.logFilePath, fullContent);
  }

  /**
   * Generates the file header
   */
  private generateHeader(): string {
    return `# Ingestion Pipeline Run History

This file contains a chronological log of ingestion pipeline runs, with the most recent runs at the top.

`;
  }

  /**
   * Formats a single log entry
   */
  private formatLogEntry(runLog: PipelineRunLog): string {
    const timestamp = runLog.timestamp.toLocaleString();
    const durationSeconds = (runLog.duration / 1000).toFixed(1);
    const status = runLog.hasErrors ? '❌ ERRORS' : '✅ SUCCESS';
    
    let entry = `## ${timestamp} - ${status}\n\n`;
    
    // Summary statistics
    entry += `**Duration:** ${durationSeconds}s  \n`;
    entry += `**Sites Processed:** ${runLog.sitesProcessed}  \n`;
    entry += `**Total Files Uploaded:** ${runLog.totalFilesUploaded}  \n`;
    entry += `**Audio Files Downloaded:** ${runLog.totalAudioFilesDownloaded}  \n`;
    entry += `**Episodes Transcribed:** ${runLog.totalEpisodesTranscribed}  \n`;
    
    if (runLog.hasErrors) {
      entry += `**Error Count:** ${runLog.errorCount}  \n`;
    }
    
    entry += '\n';

    // Detailed results by site
    if (runLog.sitesProcessed > 0) {
      entry += '### Site Results\n\n';
      
      runLog.results.forEach(result => {
        const siteStatus = result.errors.length > 0 ? '❌' : '✅';
        entry += `**${siteStatus} ${result.siteTitle}** (\`${result.siteId}\`)  \n`;
        
        // Key metrics
        if (result.newAudioFilesDownloaded > 0) {
          entry += `  📥 Audio Files: ${result.newAudioFilesDownloaded}  \n`;
        }
        if (result.newEpisodesTranscribed > 0) {
          entry += `  🎤 Transcribed: ${result.newEpisodesTranscribed}  \n`;
        }
        if ((result.s3SyncTotalFilesUploaded || 0) > 0) {
          entry += `  📤 Files Uploaded: ${result.s3SyncTotalFilesUploaded}  \n`;
        }
        
        // Errors
        if (result.errors.length > 0) {
          entry += `  ⚠️ Errors: ${result.errors.join(', ')}  \n`;
        }
        
        entry += '\n';
      });
    }

    // Success rates
    entry += '### Success Rates\n\n';
    
    const successfulRss = runLog.results.filter(r => r.rssRetrievalSuccess).length;
    const successfulAudio = runLog.results.filter(r => r.audioProcessingSuccess).length;
    const sitesWithUploads = runLog.results.filter(r => (r.filesToUpload || 0) > 0).length;
    const successfulUploads = runLog.results.filter(r => (r.filesToUpload || 0) > 0 && r.s3SyncSuccess).length;
    const successfulIndexing = runLog.results.filter(r => (r.s3SyncTotalFilesUploaded || 0) > 0 && r.indexingTriggerSuccess).length;
    const sitesTriggeredIndexing = runLog.results.filter(r => (r.s3SyncTotalFilesUploaded || 0) > 0).length;
    
    entry += `**RSS Retrieval:** ${successfulRss}/${runLog.sitesProcessed} (${((successfulRss / runLog.sitesProcessed) * 100).toFixed(1)}%)  \n`;
    entry += `**Audio Processing:** ${successfulAudio}/${runLog.sitesProcessed} (${((successfulAudio / runLog.sitesProcessed) * 100).toFixed(1)}%)  \n`;
    
    if (sitesWithUploads > 0) {
      entry += `**S3 Upload:** ${successfulUploads}/${sitesWithUploads} (${((successfulUploads / sitesWithUploads) * 100).toFixed(1)}%)  \n`;
    }
    
    if (sitesTriggeredIndexing > 0) {
      entry += `**Cloud Indexing:** ${successfulIndexing}/${sitesTriggeredIndexing} (${((successfulIndexing / sitesTriggeredIndexing) * 100).toFixed(1)}%)  \n`;
    }

    return entry + '\n---\n\n';
  }

  /**
   * Gets the path to the log file
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * Checks if the log file exists
   */
  logFileExists(): boolean {
    return fs.existsSync(this.logFilePath);
  }

  /**
   * Gets the most recent log entries (default: 5)
   */
  getRecentEntries(count: number = 5): string {
    if (!this.logFileExists()) {
      return 'No pipeline runs logged yet.';
    }

    const content = fs.readFileSync(this.logFilePath, 'utf8');
    const entries = content.split('---\n\n').slice(0, count + 1); // +1 for header
    return entries.join('---\n\n');
  }
}