import { log } from '@browse-dot-show/logging';
import {
  listFiles,
  getFile,
  saveFile,
  fileExists,
  listDirectories
} from '@browse-dot-show/s3';
import {
  applyCorrectionToFile,
  aggregateCorrectionResults,
  type ApplyCorrectionsResult
} from './utils/apply-spelling-corrections.js';

// Constants
const TRANSCRIPTS_DIR_PREFIX = 'transcripts/';

/**
 * S3-compatible file operations for the spelling correction functions
 */
const s3FileOperations = {
  getFileContent: async (filePath: string): Promise<string> => {
    const buffer = await getFile(filePath);
    return buffer.toString('utf-8');
  },
  saveFileContent: async (filePath: string, content: string): Promise<void> => {
    await saveFile(filePath, Buffer.from(content, 'utf-8'));
  }
};

/**
 * Gets all SRT files in the transcripts directory
 */
async function getAllSrtFiles(): Promise<string[]> {
  try {
    // First get the podcast directories
    const podcastDirs = await listDirectories(TRANSCRIPTS_DIR_PREFIX);
    
    const allSrtFiles: string[] = [];
    
    // For each podcast directory, list the SRT files
    for (const podcastDir of podcastDirs) {
      try {
        const filesInDir = await listFiles(podcastDir);
        const srtFilesInDir = filesInDir.filter(file => file.endsWith('.srt'));
        allSrtFiles.push(...srtFilesInDir);
      } catch (error) {
        log.error(`Error listing files in ${podcastDir}:`, error);
        // Continue with other directories
      }
    }
    
    return allSrtFiles;
  } catch (error) {
    log.error('Error listing transcript files:', error);
    throw error;
  }
}

/**
 * Applies spelling corrections to all SRT files and logs the results
 */
export async function runSpellingCorrectionsOnAllTranscripts(): Promise<void> {
  log.info('🔤 Starting spelling corrections for all transcript files...');
  const startTime = Date.now();

  try {
    // Get all SRT files
    const srtFiles = await getAllSrtFiles();
    log.info(`Found ${srtFiles.length} SRT files to process`);

    if (srtFiles.length === 0) {
      log.info('No SRT files found to process');
      return;
    }

    // Process each file
    const results: ApplyCorrectionsResult[] = [];
    let totalFilesProcessed = 0;
    let totalFilesWithCorrections = 0;

    for (const filePath of srtFiles) {
      try {
        log.debug(`Processing: ${filePath}`);
        
        const result = await applyCorrectionToFile(
          filePath,
          s3FileOperations.getFileContent,
          s3FileOperations.saveFileContent
        );

        results.push(result);
        totalFilesProcessed++;

        if (result.totalCorrections > 0) {
          totalFilesWithCorrections++;
          log.debug(`Applied ${result.totalCorrections} corrections to ${filePath}`);
        }

      } catch (error) {
        log.error(`Error processing ${filePath}:`, error);
        // Continue with other files
      }
    }

    // Aggregate and log results
    const aggregatedResults = aggregateCorrectionResults(results);
    const totalCorrections = aggregatedResults.reduce((sum, result) => sum + result.correctionsApplied, 0);
    const processingTime = (Date.now() - startTime) / 1000;

    // Log summary
    log.info('\n📊 Spelling Corrections Summary:');
    log.info(`⏱️  Total Duration: ${processingTime.toFixed(2)} seconds`);
    log.info(`📁 Total Files Processed: ${totalFilesProcessed}`);
    log.info(`✏️  Files with Corrections: ${totalFilesWithCorrections}`);
    log.info(`🔤 Total Corrections Applied: ${totalCorrections}`);

    if (aggregatedResults.length > 0) {
      log.info('\n📝 Corrections by Type:');
      aggregatedResults
        .sort((a, b) => b.correctionsApplied - a.correctionsApplied)
        .forEach(result => {
          log.info(`   "${result.correctedSpelling}": ${result.correctionsApplied} corrections`);
        });
    } else {
      log.info('\nℹ️  No spelling corrections were needed');
    }

    log.info('\n✨ Spelling corrections processing completed');

  } catch (error) {
    log.error('❌ Fatal error in spelling corrections processing:', error);
    throw error;
  }
}

// Main handler for Lambda execution
export async function handler(): Promise<void> {
  await runSpellingCorrectionsOnAllTranscripts();
}

// For direct script execution
import path from 'path';
import { fileURLToPath } from 'url';

const scriptPath = path.resolve(process.argv[1]);
const scriptUrl = import.meta.url;

if (scriptUrl.startsWith('file://') && scriptUrl.endsWith(scriptPath)) {
  log.info('🚀 Starting spelling corrections on all transcripts (direct script execution)...');
  runSpellingCorrectionsOnAllTranscripts()
    .then(() => log.info('✅ Spelling corrections completed successfully'))
    .catch(error => {
      log.error('❌ Spelling corrections failed:', error);
      process.exit(1);
    });
} 