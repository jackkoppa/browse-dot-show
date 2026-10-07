#!/usr/bin/env tsx

/**
 * Reapply Spelling Corrections to All Transcripts
 * 
 * This script processes all existing SRT transcript files for a site
 * and reapplies the current spelling corrections configuration.
 * Useful when new corrections are added to a site or when migrating
 * from global to site-specific corrections.
 */

import { logInfo, logError, logDebug, logProgress, logSuccess } from '../lib/logging.js';
import { discoverSites } from '../lib/sites.js';
import {
  listFiles,
  listDirectories,
  getFile,
  saveFile,
} from '@browse-dot-show/s3';
import { 
  applyCorrectionToFile,
  aggregateCorrectionResults,
  type ApplyCorrectionsResult
} from '@browse-dot-show/spelling';

const TRANSCRIPTS_DIR_PREFIX = 'transcripts/';

/**
 * Recursively find all SRT files in the transcripts directory and its subdirectories
 */
async function findAllSrtFiles(basePrefix: string): Promise<string[]> {
  const allSrtFiles: string[] = [];
  
  // First, check for SRT files directly in the base directory
  const directFiles = await listFiles(basePrefix);
  const directSrtFiles = directFiles.filter(file => file.endsWith('.srt'));
  allSrtFiles.push(...directSrtFiles);
  
  // Then, get all subdirectories and search them too
  const subdirectories = await listDirectories(basePrefix);
  logDebug(`Found ${subdirectories.length} subdirectories in ${basePrefix}: ${subdirectories.join(', ')}`);
  
  for (const subdir of subdirectories) {
    try {
      // The recursive call lists the subdirectory's own files too, so don't list them here
      // (doing both used to process every transcript twice)
      const subdirSrtFiles = await findAllSrtFiles(subdir);
      logDebug(`Found ${subdirSrtFiles.length} SRT files in ${subdir}`);
      allSrtFiles.push(...subdirSrtFiles);
    } catch (error) {
      logError(`Error searching subdirectory ${subdir}:`, error);
      // Continue with other subdirectories
    }
  }
  
  return allSrtFiles;
}

/**
 * Main function to reapply spelling corrections to all transcripts
 */
export async function reapplySpellingCorrectionsToAllTranscripts(): Promise<{
  totalFilesProcessed: number;
  totalCorrectionsApplied: number;
  success: boolean;
  error?: string;
}> {
  logInfo(`🟢 Starting reapply-spelling-corrections-to-all-transcripts > main function`);
  const startTime = Date.now();
  logInfo('⏱️ Starting at', new Date().toISOString());

  // Get the current site ID and configuration
  const siteId = process.env.SITE_ID;
  if (!siteId) {
    throw new Error('SITE_ID environment variable is required');
  }
  
  // Find site info from discovered sites
  const allSites = discoverSites();
  const siteInfo = allSites.find(site => site.id === siteId);
  const siteTitle = siteInfo ? siteInfo.title : siteId;
  
  logInfo(`🎯 Processing all transcripts for site: ${siteId} (${siteTitle})`);

  try {
    // Get all transcript files recursively
    logInfo(`🔍 Searching for SRT files in ${TRANSCRIPTS_DIR_PREFIX} and its subdirectories...`);
    const srtFiles = await findAllSrtFiles(TRANSCRIPTS_DIR_PREFIX);
    
    logInfo(`📄 Found ${srtFiles.length} SRT transcript files to process`);
    if (srtFiles.length > 0) {
      logDebug(`SRT files found: ${srtFiles.slice(0, 5).join(', ')}${srtFiles.length > 5 ? ` (and ${srtFiles.length - 5} more)` : ''}`);
    }
    
    if (srtFiles.length === 0) {
      logInfo('✅ No transcript files found. Nothing to process.');
      return {
        totalFilesProcessed: 0,
        totalCorrectionsApplied: 0,
        success: true
      };
    }

    const correctionResults: ApplyCorrectionsResult[] = [];
    let totalFilesProcessed = 0;
    let totalCorrectionsApplied = 0;

    // Set up S3 file operations
    const s3FileOperations = {
      getFileContent: async (filePath: string): Promise<string> => {
        const buffer = await getFile(filePath);
        return buffer.toString('utf-8');
      },
      saveFileContent: async (filePath: string, content: string): Promise<void> => {
        await saveFile(filePath, Buffer.from(content, 'utf-8'));
      }
    };

    // Process each SRT file
    for (let i = 0; i < srtFiles.length; i++) {
      const transcriptKey = srtFiles[i];
      
      try {
        
        
        // Apply corrections to this file
        const correctionResult = await applyCorrectionToFile(
          transcriptKey,
          siteId,
          s3FileOperations.getFileContent,
          s3FileOperations.saveFileContent
        );
        
        correctionResults.push(correctionResult);
        totalFilesProcessed++;
        totalCorrectionsApplied += correctionResult.totalCorrections;
        
        if (correctionResult.totalCorrections > 0) {
          logDebug(`Applied ${correctionResult.totalCorrections} corrections to ${transcriptKey}`);
        }
        
        // Log periodic progress updates
        const progress = Math.ceil((i / srtFiles.length) * 100);
        const milestone20 = Math.ceil(srtFiles.length * 0.2);
        const milestone40 = Math.ceil(srtFiles.length * 0.4);
        const milestone60 = Math.ceil(srtFiles.length * 0.6);
        const milestone80 = Math.ceil(srtFiles.length * 0.8);
        
        if ((i + 1) === milestone20 || (i + 1) === milestone40 || (i + 1) === milestone60 || (i + 1) === milestone80 || i === srtFiles.length - 1) {
          logInfo(`Progress: ${progress}% - ${i + 1}/${srtFiles.length} files processed, ${totalCorrectionsApplied} corrections applied`);
        }
        
      } catch (error) {
        logError(`Error processing ${transcriptKey}:`, error);
        // Continue with other files even if one fails
      }
    }

    // Generate summary
    const aggregatedResults = aggregateCorrectionResults(correctionResults);
    const totalTime = (Date.now() - startTime) / 1000;

    logInfo('\n' + '='.repeat(60));
    logInfo('📊 Spelling Corrections Reapplication Summary');
    logInfo('='.repeat(60));
    logInfo(`📝 Total Files Processed: ${totalFilesProcessed}`);
    logInfo(`🔤 Total Corrections Applied: ${totalCorrectionsApplied}`);
    logInfo(`⏱️ Total Processing Time: ${totalTime.toFixed(1)}s`);
    
    if (aggregatedResults.length > 0) {
      logInfo('\n📋 Corrections Applied by Type:');
      aggregatedResults.forEach(result => {
        logInfo(`   ${result.correctedSpelling}: ${result.correctionsApplied} corrections`);
      });
    } else {
      logInfo('ℹ️  No corrections were needed - all transcripts are already correct');
    }
    
    logSuccess('\n🎉 Spelling corrections reapplication completed successfully!');

    return {
      totalFilesProcessed,
      totalCorrectionsApplied,
      success: true
    };

  } catch (error: any) {
    logError('❌ Error during spelling corrections reapplication:', error.message);
    return {
      totalFilesProcessed: 0,
      totalCorrectionsApplied: 0,
      success: false,
      error: error.message
    };
  }
}

// Only run as script if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    logInfo('\n\n⚠️  Operation cancelled by user');
    process.exit(130);
  });

  // Run the main function
  reapplySpellingCorrectionsToAllTranscripts().catch((error) => {
    logError('\n❌ Unexpected error:', error.message);
    process.exit(1);
  });
} 