#!/usr/bin/env tsx

import { log } from '../packages/logging/dist/index.js';
import { 
  fileExists, 
  getFile, 
  saveFile, 
  listFiles,
  deleteFile
} from '@browse-dot-show/s3';
import { getSiteById, getAvailableSiteIds } from '../sites/dist/index.js';
import { EpisodeManifest, EpisodeInManifest, PodcastId } from '../packages/types/dist/index.js';
import { 
  getEpisodeManifestKey,
  getAudioDirPrefix,
  getTranscriptsDirPrefix,
  getSearchEntriesDirPrefix,
  hasDownloadedAtTimestamp,
  parseFileKey,
  getEpisodeFilePaths
} from '@browse-dot-show/constants';
// File key generation functions (duplicated from ingestion package to avoid cross-package imports)

/** Parse publication date from RSS feed */
function parsePubDate(pubDateStr: string): Date {
    return new Date(pubDateStr);
}

/** Helper to format date as YYYY-MM-DD */
function formatDateYYYYMMDD(date: Date): string {
    return date.toISOString().split('T')[0];
}

/** Strict title sanitization - only alphanumeric and underscores */
function sanitizeTitleStrict(title: string): string {
    return title
        .normalize('NFC')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 50);
}

// Get episode fileKey with downloadedAt timestamp (NEW FORMAT)
function getEpisodeFileKeyWithDownloadedAt(
    episodeTitle: string, 
    pubDateStr: string, 
    downloadedAt: Date
): string {
    const date = parsePubDate(pubDateStr);
    const formattedDate = formatDateYYYYMMDD(date);
    const downloadedAtUnix = downloadedAt.getTime();
    const sanitizedTitle = sanitizeTitleStrict(episodeTitle);
    
    return `${formattedDate}_${sanitizedTitle}--${downloadedAtUnix}`;
}
import { getStats } from './utils/file-operations.js';
import * as path from 'path';
import * as fs from 'fs';

// CLI arguments interface
interface CliArgs {
  site?: string;
  dryRun: boolean;
  verbose: boolean;
  forceUpdate: boolean;
}

interface BackfillStats {
  totalEpisodes: number;
  alreadyMigrated: number;
  successfullyMigrated: number;
  failed: number;
  errors: string[];
}

interface FileToRename {
  originalPath: string;
  newPath: string;
  fileType: 'audio' | 'transcript' | 'searchEntry';
  episode: EpisodeInManifest;
  inferredDownloadedAt: Date;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    dryRun: true, // Default to dry run for safety
    verbose: false,
    forceUpdate: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--site=')) {
      parsed.site = arg.split('=')[1];
    } else if (arg === '--site' && i + 1 < args.length) {
      parsed.site = args[i + 1];
      i++;
    } else if (arg === '--execute') {
      parsed.dryRun = false;
    } else if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true;
    } else if (arg === '--force') {
      parsed.forceUpdate = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  // Fall back to environment variables if no site specified via CLI
  if (!parsed.site) {
    parsed.site = process.env.SITE_ID;
  }

  return parsed;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Downloaded-At Backfill Script

This script migrates existing files from legacy format (YYYY-MM-DD_title) 
to the new format with downloadedAt timestamps (YYYY-MM-DD_title--timestamp).

Usage:
  pnpm backfill:timestamps [options]

Options:
  --site <siteId>     Backfill specific site (e.g., naddpod, hardfork)
  --execute           Actually perform the migration (default is dry-run)
  --force             Force update even if files already have downloadedAt
  --verbose, -v       Enable verbose logging
  --help, -h          Show this help message

Examples:
  pnpm backfill:timestamps --site=hardfork                # Dry run for hardfork
  pnpm backfill:timestamps --site=hardfork --execute      # Execute migration for hardfork
  pnpm backfill:timestamps --site=naddpod --verbose       # Verbose dry run for naddpod

Alternative usage via site selection wrapper:
  pnpm backfill:timestamps                                    # Select site interactively
  pnpm backfill:timestamps --site=hardfork                    # Skip site selection

Note: When using the pnpm script or run-with-site-selection.ts wrapper, 
      the site can be selected interactively or via environment variables.

⚠️  IMPORTANT: Always run without --execute first to see what changes will be made!
`);
}

/**
 * Load episode manifest
 */
async function loadEpisodeManifest(): Promise<EpisodeManifest | null> {
  try {
    const manifestKey = getEpisodeManifestKey();
    if (await fileExists(manifestKey)) {
      const manifestBuffer = await getFile(manifestKey);
      return JSON.parse(manifestBuffer.toString('utf-8')) as EpisodeManifest;
    }
    return null;
  } catch (error) {
    log.error('Error loading episode manifest:', error);
    return null;
  }
}

/**
 * Save updated episode manifest
 */
async function saveEpisodeManifest(manifest: EpisodeManifest): Promise<void> {
  try {
    const manifestKey = getEpisodeManifestKey();
    const manifestContent = JSON.stringify(manifest, null, 2);
    await saveFile(manifestKey, manifestContent);
    log.info(`✅ Episode manifest updated: ${manifest.episodes.length} episodes`);
  } catch (error) {
    log.error('Error saving episode manifest:', error);
    throw error;
  }
}

/**
 * Get file creation/modification time
 */
async function getFileTimestamp(filePath: string, siteId: string): Promise<Date> {
  try {
    // For local files, use file system stats
    const fileStorageEnv = process.env.FILE_STORAGE_ENV || 'prod-s3';
    
    if (fileStorageEnv === 'local') {
      // Use project root directory instead of current working directory
      const projectRoot = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
      const localS3Path = path.join(projectRoot, 'aws-local-dev/s3');
      let localPath: string;
      
      if (siteId && !filePath.startsWith('sites/')) {
        localPath = path.join(localS3Path, 'sites', siteId, filePath);
      } else {
        localPath = path.join(localS3Path, filePath);
      }
      
      const stats = await getStats(localPath);
      // Use birthtime (creation) if available, otherwise mtime (modification)
      return stats.birthtime || stats.mtime;
    } else {
      // For S3, we can't get exact creation time, so use current time
      // In practice, this should be run locally where we have access to file metadata
      log.warn(`Cannot determine exact creation time for S3 file: ${filePath}. Using current time.`);
      return new Date();
    }
  } catch (error) {
    log.warn(`Could not get timestamp for ${filePath}, using current time:`, error);
    return new Date();
  }
}

/**
 * Infer downloadedAt timestamp for an episode based on its audio file
 */
async function inferDownloadedAtTimestamp(episode: EpisodeInManifest, siteId: string): Promise<Date> {
  const audioPath = `${getAudioDirPrefix()}${episode.podcastId}/${episode.fileKey}.mp3`;
  
  try {
    const timestamp = await getFileTimestamp(audioPath, siteId);
    log.debug(`Inferred downloadedAt for ${episode.fileKey}: ${timestamp.toISOString()}`);
    return timestamp;
  } catch (error) {
    log.warn(`Could not infer timestamp for ${episode.fileKey}, using published date`);
    return new Date(episode.publishedAt);
  }
}

/**
 * Generate new file key with downloadedAt timestamp
 */
function generateNewFileKey(episode: EpisodeInManifest, downloadedAt: Date): string {
  // Parse the existing file key to extract the title
  try {
    const parsed = parseFileKey(episode.fileKey);
    // Use the same pub date format but with the original title and new downloadedAt
    return getEpisodeFileKeyWithDownloadedAt(
      episode.title, 
      episode.publishedAt, 
      downloadedAt
    );
  } catch (error) {
    log.warn(`Could not parse file key ${episode.fileKey}, using title directly`);
    return getEpisodeFileKeyWithDownloadedAt(
      episode.title, 
      episode.publishedAt, 
      downloadedAt
    );
  }
}

/**
 * Plan file renames for an episode
 */
async function planFileRenames(
  episode: EpisodeInManifest, 
  newFileKey: string,
  downloadedAt: Date
): Promise<FileToRename[]> {
  const filesToRename: FileToRename[] = [];
  const oldPaths = getEpisodeFilePaths(episode.podcastId, episode.fileKey);
  const newPaths = getEpisodeFilePaths(episode.podcastId, newFileKey);

  // Check which files exist and plan renames
  const fileTypes = [
    { type: 'audio' as const, oldPath: oldPaths.audio, newPath: newPaths.audio },
    { type: 'transcript' as const, oldPath: oldPaths.transcript, newPath: newPaths.transcript },
    { type: 'searchEntry' as const, oldPath: oldPaths.searchEntry, newPath: newPaths.searchEntry }
  ];

  for (const { type, oldPath, newPath } of fileTypes) {
    if (await fileExists(oldPath)) {
      filesToRename.push({
        originalPath: oldPath,
        newPath: newPath,
        fileType: type,
        episode,
        inferredDownloadedAt: downloadedAt
      });
    }
  }

  return filesToRename;
}

/**
 * Execute file rename
 */
async function renameFile(fileToRename: FileToRename, dryRun: boolean): Promise<boolean> {
  const { originalPath, newPath, fileType } = fileToRename;
  
  try {
    if (dryRun) {
      log.info(`[DRY RUN] Would rename ${fileType}: ${originalPath} → ${newPath}`);
      return true;
    }

    // Check if target already exists
    if (await fileExists(newPath)) {
      log.warn(`Target file already exists: ${newPath}, skipping rename`);
      return false;
    }

    // Read file content
    const fileContent = await getFile(originalPath);
    
    // Save to new location
    await saveFile(newPath, fileContent);
    
    // Delete old file
    await deleteFile(originalPath);
    
    log.info(`✅ Renamed ${fileType}: ${path.basename(originalPath)} → ${path.basename(newPath)}`);
    return true;
  } catch (error) {
    log.error(`❌ Failed to rename ${fileType} ${originalPath}:`, error);
    return false;
  }
}

/**
 * Backfill downloadedAt timestamps for a site
 */
async function backfillSite(siteId: string, args: CliArgs): Promise<BackfillStats> {
  const stats: BackfillStats = {
    totalEpisodes: 0,
    alreadyMigrated: 0,
    successfullyMigrated: 0,
    failed: 0,
    errors: []
  };

  try {
    // Load episode manifest
    const manifest = await loadEpisodeManifest();
    if (!manifest) {
      throw new Error('Could not load episode manifest');
    }

    // Filter episodes for this site
    const siteConfig = getSiteById(siteId);
    if (!siteConfig) {
      throw new Error(`Site config not found for site: ${siteId}`);
    }
    
    // Get all podcast IDs for this site
    if (!siteConfig.includedPodcasts || siteConfig.includedPodcasts.length === 0) {
      throw new Error(`No podcasts configured for site: ${siteId}`);
    }
    
    const podcastIds = siteConfig.includedPodcasts.map(p => p.id as PodcastId);
    const siteEpisodes = manifest.episodes.filter((ep: EpisodeInManifest) => podcastIds.includes(ep.podcastId));
    
    stats.totalEpisodes = siteEpisodes.length;
    log.info(`\n📊 Processing ${stats.totalEpisodes} episodes for site: ${siteId}`);
    log.info(`   📻 Included podcasts: ${podcastIds.join(', ')}`);

    if (args.dryRun) {
      log.info(`\n🔍 DRY RUN MODE - No files will be modified\n`);
    } else {
      log.info(`\n⚡ EXECUTE MODE - Files will be modified!\n`);
    }

    // Process each episode
    for (const episode of siteEpisodes) {
      try {
        // Check if already migrated
        if (!args.forceUpdate && hasDownloadedAtTimestamp(episode.fileKey)) {
          stats.alreadyMigrated++;
          if (args.verbose) {
            log.info(`⏭️  Episode already migrated: ${episode.fileKey}`);
          }
          continue;
        }

        // Check if downloadedAt is already set in manifest
        if (!args.forceUpdate && episode.downloadedAt) {
          stats.alreadyMigrated++;
          if (args.verbose) {
            log.info(`⏭️  Episode already has downloadedAt: ${episode.fileKey}`);
          }
          continue;
        }

        log.info(`🔄 Processing: ${episode.fileKey}`);

        // Infer downloadedAt timestamp
        const downloadedAt = await inferDownloadedAtTimestamp(episode, siteId);
        
        // Generate new file key
        const newFileKey = generateNewFileKey(episode, downloadedAt);
        
        if (args.verbose) {
          log.info(`   📅 Inferred downloadedAt: ${downloadedAt.toISOString()}`);
          log.info(`   📝 New file key: ${newFileKey}`);
        }

        // Plan file renames
        const filesToRename = await planFileRenames(episode, newFileKey, downloadedAt);
        
        if (args.verbose) {
          log.info(`   📁 Files to rename: ${filesToRename.length}`);
        }

        // Execute renames
        let allRenamed = true;
        for (const fileToRename of filesToRename) {
          const success = await renameFile(fileToRename, args.dryRun);
          if (!success) {
            allRenamed = false;
          }
        }

        if (allRenamed) {
          // Update episode in manifest
          episode.fileKey = newFileKey;
          episode.downloadedAt = downloadedAt.toISOString();
          stats.successfullyMigrated++;
          
          if (args.verbose) {
            log.info(`   ✅ Episode successfully migrated`);
          }
        } else {
          stats.failed++;
          stats.errors.push(`Failed to rename all files for episode: ${episode.fileKey}`);
        }

      } catch (error) {
        stats.failed++;
        const errorMsg = `Failed to process episode ${episode.fileKey}: ${error}`;
        stats.errors.push(errorMsg);
        log.error(errorMsg);
      }
    }

    // Save updated manifest
    if (!args.dryRun && stats.successfullyMigrated > 0) {
      manifest.lastUpdated = new Date().toISOString();
      await saveEpisodeManifest(manifest);
    }

    return stats;

  } catch (error) {
    log.error('Error during backfill:', error);
    stats.errors.push(`General error: ${error}`);
    return stats;
  }
}

/**
 * Display backfill results
 */
function displayResults(siteId: string, stats: BackfillStats, dryRun: boolean): void {
  console.log(`\n📊 BACKFILL RESULTS FOR SITE: ${siteId.toUpperCase()}`);
  console.log('='.repeat(50));
  console.log(`📈 Total Episodes: ${stats.totalEpisodes}`);
  console.log(`⏭️  Already Migrated: ${stats.alreadyMigrated}`);
  console.log(`✅ Successfully Migrated: ${stats.successfullyMigrated}`);
  console.log(`❌ Failed: ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log(`\n🔴 ERRORS:`);
    stats.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
  }

  if (dryRun && stats.totalEpisodes > stats.alreadyMigrated) {
    console.log(`\n💡 To execute the migration, run with --execute flag:`);
    console.log(`   pnpm backfill:timestamps --site=${siteId} --execute`);
  }

  if (!dryRun && stats.successfullyMigrated > 0) {
    console.log(`\n🎉 Migration completed! Run consistency check to verify:`);
    console.log(`   pnpm validate:consistency --site=${siteId}`);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (!args.site) {
    console.error('❌ Site ID is required.');
    console.error('   Provide via: --site=<siteId> or use pnpm backfill:timestamps for interactive selection');
    console.error('   Use --help for full usage info.');
    process.exit(1);
  }

  // Validate site
  const availableSites = getAvailableSiteIds();
  if (!availableSites.includes(args.site)) {
    console.error(`❌ Invalid site ID: ${args.site}`);
    console.error(`Available sites: ${availableSites.join(', ')}`);
    process.exit(1);
  }

  // Set environment for file storage
  process.env.FILE_STORAGE_ENV = 'local'; // Force local for backfill

  if (args.verbose) {
    log.setLevel('debug');
  }

  log.info(`🚀 Starting downloadedAt backfill for site: ${args.site}`);
  
  if (args.dryRun) {
    log.info(`🔍 Running in DRY RUN mode - no files will be modified`);
  } else {
    log.info(`⚡ Running in EXECUTE mode - files will be modified!`);
  }

  try {
    const stats = await backfillSite(args.site, args);
    displayResults(args.site, stats, args.dryRun);
    
    if (stats.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    log.error('Fatal error during backfill:', error);
    process.exit(1);
  }
}

// Run main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
} 