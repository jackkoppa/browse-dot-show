import { log } from '@browse-dot-show/logging';
import spellingCorrectionsConfig from './spelling-corrections.json' assert { type: 'json' };

// Types
interface SpellingCorrection {
  misspellings: string[];
  correctedSpelling: string;
}

interface SpellingCorrectionsConfig {
  correctionsToApply: SpellingCorrection[];
}

export interface CorrectionResult {
  correctedSpelling: string;
  correctionsApplied: number;
}

export interface ApplyCorrectionsResult {
  correctedContent: string;
  correctionResults: CorrectionResult[];
  totalCorrections: number;
}

/**
 * Loads the spelling corrections configuration from imported JSON and optional custom config
 */
async function loadSpellingCorrections(): Promise<SpellingCorrection[]> {
  // Start with the base config
  let allCorrections = [...spellingCorrectionsConfig.correctionsToApply];
  
  // Try to load custom config if it exists
  try {
    const customConfigModule = await import('./_custom-spelling-corrections.json', { assert: { type: 'json' } });
    const customConfig = customConfigModule.default as SpellingCorrectionsConfig;
    
    if (customConfig && customConfig.correctionsToApply) {
      log.debug(`Loaded ${customConfig.correctionsToApply.length} custom spelling corrections`);
      allCorrections.push(...customConfig.correctionsToApply);
    }
  } catch (error) {
    // File doesn't exist or other import error - this is expected and OK
    log.debug('No custom spelling corrections file found, using base config only');
  }
  
  log.debug(`Total spelling corrections loaded: ${allCorrections.length}`);
  return allCorrections;
}

/**
 * Creates a case-insensitive regex pattern that matches whole words
 */
function createMisspellingPattern(misspelling: string): RegExp {
  // Escape special regex characters
  const escaped = misspelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Create word boundary pattern for case-insensitive matching
  return new RegExp(`\\b${escaped}\\b`, 'gi');
}

/**
 * Applies spelling corrections to SRT content
 * 
 * @param srtContent - The raw SRT file content as a string
 * @returns Object containing corrected content and statistics
 */
export async function applySpellingCorrections(srtContent: string): Promise<ApplyCorrectionsResult> {
  if (!srtContent || !srtContent.trim()) {
    return {
      correctedContent: srtContent,
      correctionResults: [],
      totalCorrections: 0
    };
  }

  const corrections = await loadSpellingCorrections();
  let correctedContent = srtContent;
  const correctionResults: CorrectionResult[] = [];
  let totalCorrections = 0;

  for (const correction of corrections) {
    let correctionsForThisSpelling = 0;

    for (const misspelling of correction.misspellings) {
      const pattern = createMisspellingPattern(misspelling);
      const matches = correctedContent.match(pattern);
      
      if (matches) {
        // Only count actual corrections (where text changes)
        const beforeReplacement = correctedContent;
        correctedContent = correctedContent.replace(pattern, correction.correctedSpelling);
        
        // Count only if the content actually changed
        if (beforeReplacement !== correctedContent) {
          correctionsForThisSpelling += matches.length;
        }
      }
    }

    if (correctionsForThisSpelling > 0) {
      correctionResults.push({
        correctedSpelling: correction.correctedSpelling,
        correctionsApplied: correctionsForThisSpelling
      });
      totalCorrections += correctionsForThisSpelling;
    }
  }

  return {
    correctedContent,
    correctionResults,
    totalCorrections
  };
}

/**
 * Applies spelling corrections to a single SRT file and saves the corrected version
 * 
 * @param filePath - Path to the SRT file (can be local or S3 key)
 * @param getFileContent - Function to read file content (for S3 compatibility)
 * @param saveFileContent - Function to save file content (for S3 compatibility)
 * @returns Correction results for this file
 */
export async function applyCorrectionToFile(
  filePath: string,
  getFileContent: (path: string) => Promise<string>,
  saveFileContent: (path: string, content: string) => Promise<void>
): Promise<ApplyCorrectionsResult> {
  
  log.debug(`Applying spelling corrections to: ${filePath}`);
  
  try {
    // Read the SRT content
    const originalContent = await getFileContent(filePath);
    
    // Apply corrections
    const result = await applySpellingCorrections(originalContent);
    
    // Only save if corrections were made
    if (result.totalCorrections > 0) {
      await saveFileContent(filePath, result.correctedContent);
      log.debug(`Applied ${result.totalCorrections} corrections to ${filePath}`);
    }
    
    return result;
  } catch (error) {
    log.error(`Error applying corrections to ${filePath}:`, error);
    throw error;
  }
}

/**
 * Aggregates correction results from multiple files
 */
export function aggregateCorrectionResults(results: ApplyCorrectionsResult[]): CorrectionResult[] {
  const aggregated = new Map<string, number>();
  
  for (const result of results) {
    for (const correctionResult of result.correctionResults) {
      const existing = aggregated.get(correctionResult.correctedSpelling) || 0;
      aggregated.set(correctionResult.correctedSpelling, existing + correctionResult.correctionsApplied);
    }
  }
  
  return Array.from(aggregated.entries()).map(([correctedSpelling, correctionsApplied]) => ({
    correctedSpelling,
    correctionsApplied
  }));
}

