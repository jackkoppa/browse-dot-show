/**
 * Sync Consistency Checker - Phase 4.2
 * 
 * This utility compares local vs S3 file states and identifies sync gaps.
 * Adapted from packages/validation/check-file-consistency.ts for dual-environment comparison.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execCommand } from './shell-exec.js';
import { logInfo, logDebug, logError } from './logging.js';

interface FileInventory {
  audioFiles: string[];
  transcriptFiles: string[];
  manifestFiles: string[];
  rssFiles: string[];
  searchEntriesFiles: string[];
  searchIndexFiles: string[];
}

interface SyncConsistencyMode {
  checkS3ToLocal: boolean;   // Check for files missing locally that exist in S3
  checkLocalToS3: boolean;   // Check for files existing locally that are missing in S3
}

interface SyncGapReport {
  localOnly: {
    audio: string[];
    transcripts: string[];
    manifest: string[];
    rss: string[];
    searchEntries: string[];
    searchIndex: string[];
  };
  s3Only: {
    audio: string[];
    transcripts: string[];
    manifest: string[];
    rss: string[];
    searchEntries: string[];
    searchIndex: string[];
  };
  consistent: {
    audio: string[];
    transcripts: string[];
    manifest: string[];
    rss: string[];
    searchEntries: string[];
    searchIndex: string[];
  };
  summary: {
    totalLocalOnlyFiles: number;
    totalS3OnlyFiles: number;
    totalConsistentFiles: number;
    hasLocalOnlyFiles: boolean;
    hasS3OnlyFiles: boolean;
  };
}

/**
 * Scan local directory for files
 */
async function scanLocalFiles(siteId: string): Promise<FileInventory> {
  const localBasePath = path.join('aws-local-dev', 's3', 'sites', siteId);
  const inventory: FileInventory = {
    audioFiles: [],
    transcriptFiles: [],
    manifestFiles: [],
    rssFiles: [],
    searchEntriesFiles: [],
    searchIndexFiles: []
  };
  
  // Now including search-entries and search-index as they will be synced
  const folders = [
    { name: 'audio', key: 'audioFiles', extensions: ['.mp3'] },
    { name: 'transcripts', key: 'transcriptFiles', extensions: ['.srt'] },
    { name: 'episode-manifest', key: 'manifestFiles', extensions: ['.json'] },
    { name: 'rss', key: 'rssFiles', extensions: ['.xml', '.json'] },
    { name: 'search-entries', key: 'searchEntriesFiles', extensions: ['.json'] },
    { name: 'search-index', key: 'searchIndexFiles', extensions: ['.msp', '.json'] }
  ];
  
  // Helper function to recursively read directory
  function readDirRecursive(dirPath: string, basePath: string): string[] {
    const files: string[] = [];
    
    try {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const relativePath = path.relative(basePath, fullPath);
        
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...readDirRecursive(fullPath, basePath));
        } else if (stat.isFile()) {
          files.push(relativePath);
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible, that's okay
    }
    
    return files;
  }
  
  for (const folder of folders) {
    const folderPath = path.join(localBasePath, folder.name);
    
    try {
      if (fs.existsSync(folderPath)) {
        const files = readDirRecursive(folderPath, localBasePath);
        const filteredFiles = files
          .filter(file => {
            // Filter by extensions and exclude system files
            return folder.extensions.some(ext => file.endsWith(ext)) && 
                   !file.startsWith('.') &&
                   !file.includes('.DS_Store');
          });
        
        (inventory as any)[folder.key] = filteredFiles;
        logDebug(`Local ${folder.name}: found ${filteredFiles.length} files`);
      } else {
        logDebug(`Local ${folder.name}: directory does not exist`);
      }
    } catch (error: any) {
      logError(`Error scanning local ${folder.name}: ${error.message}`);
    }
  }
  
  return inventory;
}

/**
 * Scan S3 bucket for files using AWS CLI
 */
async function scanS3Files(
  siteId: string, 
  bucketName: string, 
  tempCredentials: any
): Promise<FileInventory> {
  const inventory: FileInventory = {
    audioFiles: [],
    transcriptFiles: [],
    manifestFiles: [],
    rssFiles: [],
    searchEntriesFiles: [],
    searchIndexFiles: []
  };
  
  // Now including search-entries and search-index as they will be synced
  const folders = [
    { name: 'audio', key: 'audioFiles', extensions: ['.mp3'] },
    { name: 'transcripts', key: 'transcriptFiles', extensions: ['.srt'] },
    { name: 'episode-manifest', key: 'manifestFiles', extensions: ['.json'] },
    { name: 'rss', key: 'rssFiles', extensions: ['.xml', '.json'] },
    { name: 'search-entries', key: 'searchEntriesFiles', extensions: ['.json'] },
    { name: 'search-index', key: 'searchIndexFiles', extensions: ['.msp', '.json'] }
  ];
  
  for (const folder of folders) {
    try {
      const result = await execCommand('aws', [
        's3', 'ls',
        `s3://${bucketName}/${folder.name}/`,
        '--recursive'
      ], {
        silent: true,
        env: {
          ...process.env,
          AWS_ACCESS_KEY_ID: tempCredentials.AccessKeyId,
          AWS_SECRET_ACCESS_KEY: tempCredentials.SecretAccessKey,
          AWS_SESSION_TOKEN: tempCredentials.SessionToken
        }
      });
      
      if (result.exitCode === 0) {
        const lines = result.stdout.split('\n').filter(line => line.trim());
        const files = lines
          .map(line => {
            // AWS CLI ls output format: "2023-01-01 12:00:00 1234 path/to/file.ext"
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
              return parts.slice(3).join(' '); // Get the file path part
            }
            return null;
          })
          .filter(filePath => filePath !== null)
          .filter(filePath => {
            // Filter by extensions and exclude system files
            return folder.extensions.some(ext => filePath!.endsWith(ext)) && 
                   !filePath!.includes('.DS_Store');
          }) as string[];
        
        (inventory as any)[folder.key] = files;
        logDebug(`S3 ${folder.name}: found ${files.length} files`);
      } else {
        // If the folder doesn't exist on S3, that's okay - just log as debug
        logDebug(`S3 ${folder.name}: folder does not exist or is empty`);
      }
    } catch (error: any) {
      logError(`Error scanning S3 ${folder.name}: ${error.message}`);
    }
  }
  
  return inventory;
}

/**
 * Compare local and S3 inventories to identify sync gaps
 */
function compareInventories(
  localInventory: FileInventory, 
  s3Inventory: FileInventory, 
  mode: SyncConsistencyMode
): SyncGapReport {
  const report: SyncGapReport = {
    localOnly: {
      audio: [],
      transcripts: [],
      manifest: [],
      rss: [],
      searchEntries: [],
      searchIndex: []
    },
    s3Only: {
      audio: [],
      transcripts: [],
      manifest: [],
      rss: [],
      searchEntries: [],
      searchIndex: []
    },
    consistent: {
      audio: [],
      transcripts: [],
      manifest: [],
      rss: [],
      searchEntries: [],
      searchIndex: []
    },
    summary: {
      totalLocalOnlyFiles: 0,
      totalS3OnlyFiles: 0,
      totalConsistentFiles: 0,
      hasLocalOnlyFiles: false,
      hasS3OnlyFiles: false
    }
  };
  
  const comparisons = [
    { localKey: 'audioFiles', s3Key: 'audioFiles', reportKey: 'audio' },
    { localKey: 'transcriptFiles', s3Key: 'transcriptFiles', reportKey: 'transcripts' },
    { localKey: 'manifestFiles', s3Key: 'manifestFiles', reportKey: 'manifest' },
    { localKey: 'rssFiles', s3Key: 'rssFiles', reportKey: 'rss' },
    { localKey: 'searchEntriesFiles', s3Key: 'searchEntriesFiles', reportKey: 'searchEntries' },
    { localKey: 'searchIndexFiles', s3Key: 'searchIndexFiles', reportKey: 'searchIndex' }
  ];
  
  for (const comparison of comparisons) {
    const localFiles = (localInventory as any)[comparison.localKey] as string[];
    const s3Files = (s3Inventory as any)[comparison.s3Key] as string[];
    
    const localSet = new Set(localFiles);
    const s3Set = new Set(s3Files);
    
    // Files only in local (only check if mode allows)
    const localOnlyFiles = mode.checkLocalToS3 
      ? localFiles.filter(file => !s3Set.has(file))
      : [];
    (report.localOnly as any)[comparison.reportKey] = localOnlyFiles;
    
    // Files only in S3 (only check if mode allows)
    const s3OnlyFiles = mode.checkS3ToLocal 
      ? s3Files.filter(file => !localSet.has(file))
      : [];
    (report.s3Only as any)[comparison.reportKey] = s3OnlyFiles;
    
    // Files in both (consistent) - always calculate for completeness
    const consistentFiles = localFiles.filter(file => s3Set.has(file));
    (report.consistent as any)[comparison.reportKey] = consistentFiles;
    
    logDebug(`${comparison.reportKey}: ${localOnlyFiles.length} local-only, ${s3OnlyFiles.length} S3-only, ${consistentFiles.length} consistent`);
  }
  
  // Calculate summary
  report.summary.totalLocalOnlyFiles = Object.values(report.localOnly).reduce((sum, files) => sum + files.length, 0);
  report.summary.totalS3OnlyFiles = Object.values(report.s3Only).reduce((sum, files) => sum + files.length, 0);
  report.summary.totalConsistentFiles = Object.values(report.consistent).reduce((sum, files) => sum + files.length, 0);
  report.summary.hasLocalOnlyFiles = report.summary.totalLocalOnlyFiles > 0;
  report.summary.hasS3OnlyFiles = report.summary.totalS3OnlyFiles > 0;
  
  return report;
}

/**
 * Generate sync consistency report for a site
 */
export async function generateSyncConsistencyReport(
  siteId: string,
  bucketName: string,
  tempCredentials: any,
  mode: SyncConsistencyMode = { checkS3ToLocal: true, checkLocalToS3: true }
): Promise<SyncGapReport> {
  const modeDesc = mode.checkS3ToLocal && mode.checkLocalToS3 
    ? 'bidirectional' 
    : mode.checkS3ToLocal 
    ? 'S3→local only'
    : 'local→S3 only';
  
  logInfo(`Checking sync consistency for ${siteId} (${modeDesc})...`);
  
  try {
    // Scan both local and S3 in parallel
    const [localInventory, s3Inventory] = await Promise.all([
      scanLocalFiles(siteId),
      scanS3Files(siteId, bucketName, tempCredentials)
    ]);
    
    // Compare the inventories using the specified mode
    const report = compareInventories(localInventory, s3Inventory, mode);
    
    logInfo(`Sync consistency check completed for ${siteId}: ${report.summary.totalLocalOnlyFiles} local-only, ${report.summary.totalS3OnlyFiles} S3-only, ${report.summary.totalConsistentFiles} consistent files`);
    
    return report;
    
  } catch (error: any) {
    logError(`Failed to generate sync consistency report for ${siteId}: ${error.message}`);
    throw error;
  }
}

/**
 * Display sync consistency report
 */
export function displaySyncConsistencyReport(siteId: string, report: SyncGapReport): void {
  logInfo(`\n📊 Sync Consistency Report for ${siteId}:`);
  logInfo('='.repeat(50));
  
  if (report.summary.totalLocalOnlyFiles > 0) {
    logInfo(`📤 Files to upload to S3: ${report.summary.totalLocalOnlyFiles}`);
    Object.entries(report.localOnly).forEach(([category, files]) => {
      if (files.length > 0) {
        logInfo(`   ${category}: ${files.length} files`);
        files.forEach(file => logDebug(`     - ${file}`));
      }
    });
  }
  
  if (report.summary.totalS3OnlyFiles > 0) {
    logInfo(`📥 Files missing locally: ${report.summary.totalS3OnlyFiles}`);
    Object.entries(report.s3Only).forEach(([category, files]) => {
      if (files.length > 0) {
        logInfo(`   ${category}: ${files.length} files`);
        files.forEach(file => logDebug(`     - ${file}`));
      }
    });
  }
  
  logInfo(`✅ Files in sync: ${report.summary.totalConsistentFiles}`);
  
  if (report.summary.totalLocalOnlyFiles === 0 && report.summary.totalS3OnlyFiles === 0) {
    logInfo(`🎉 All files are in perfect sync!`);
  }
}

/**
 * Pre-defined modes for common use cases
 */
export const SYNC_MODES = {
  PRE_SYNC: { checkS3ToLocal: true, checkLocalToS3: false },    // Phase 1: Download missing files
  UPLOAD_ONLY: { checkS3ToLocal: false, checkLocalToS3: true }, // Phase 5: Upload new files
  FULL_SYNC: { checkS3ToLocal: true, checkLocalToS3: true }     // Legacy: Check both directions
} as const; 