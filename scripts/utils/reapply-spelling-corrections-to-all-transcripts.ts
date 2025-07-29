#!/usr/bin/env tsx

/**
 * Reapply Spelling Corrections to All Transcripts
 * 
 * This script processes all existing SRT transcript files for a site
 * and reapplies the current spelling corrections configuration.
 * Useful when new corrections are added to a site or when migrating
 * from global to site-specific corrections.
 */

import { logInfo, logError, logDebug, logProgress, logSuccess } from './logging.js';
import { discoverSites } from './site-selector.js';
import {
  listFiles,
  getFile,
  saveFile,
} from '@browse-dot-show/s3';
import { 
  applyCorrectionToFile,
  aggregateCorrectionResults,
  type ApplyCorrectionsResult
} from '@browse-dot-show/spelling';

logInfo(`▶️ Starting reapply-spelling-corrections-to-all-transcripts`);

const TRANSCRIPTS_DIR_PREFIX = 'transcripts/';

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
    // Get all transcript files
    const transcriptFiles = await listFiles(TRANSCRIPTS_DIR_PREFIX);
    const srtFiles = transcriptFiles.filter(file => file.endsWith('.srt'));
    
    logInfo(`📄 Found ${srtFiles.length} SRT transcript files to process`);
    
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
        // Show progress
        const progress = Math.floor((i / srtFiles.length) * 100);
        logProgress(`Progress: ${progress}% - Processing file ${i + 1}/${srtFiles.length}: ${transcriptKey}`);
        
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
        if ((i + 1) % 10 === 0 || i === srtFiles.length - 1) {
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