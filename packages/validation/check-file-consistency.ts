#!/usr/bin/env node

import { log } from '@browse-dot-show/logging';
import { 
  fileExists, 
  getFile, 
  listFiles, 
  listDirectories 
} from '@browse-dot-show/s3';
import { getSiteById, getAvailableSiteIds } from '../../sites/dist/index.js';
import { EpisodeManifest, EpisodeInManifest, PodcastId } from '@browse-dot-show/types';
import { 
  getEpisodeManifestKey,
  getAudioDirPrefix,
  getTranscriptsDirPrefix,
  getSearchEntriesDirPrefix,
  hasDownloadedAtTimestamp,
  extractDownloadedAtFromFileKey,
  parseFileKey,
  getEpisodeFilePaths
} from '@browse-dot-show/constants';

// Types for consistency checking
interface ConsistencyIssue {
  type: 'missing-file' | 'orphaned-file' | 'duplicate-versions' | 'manifest-mismatch' | 'parse-error';
  severity: 'error' | 'warning' | 'info';
  description: string;
  podcastId?: string;
  episodeTitle?: string;
  downloadedAt?: string;
  filePath?: string;
  versions?: string[];
  details?: Record<string, any>;
}

interface ConsistencyReport {
  summary: {
    audioFiles: number;
    transcriptFiles: number;
    searchEntryFiles: number;
    manifestEntries: number;
    totalEpisodes: number;
    totalIssues: number;
    errors: number;
    warnings: number;
    info: number;
  };
  issues: ConsistencyIssue[];
  siteId: string;
  timestamp: string;
}

interface FilesByEpisode {
  [episodeKey: string]: {
    audio?: string;
    transcript?: string;
    searchEntry?: string;
    manifestEntry?: EpisodeInManifest;
    versions: string[]; // All versions of this episode (by downloadedAt)
  };
}

// CLI arguments interface
interface CliArgs {
  site?: string;
  all: boolean;
  format: 'text' | 'json';
  verbose: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    all: false,
    format: 'text',
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--site=')) {
      parsed.site = arg.split('=')[1];
    } else if (arg === '--site' && i + 1 < args.length) {
      parsed.site = args[i + 1];
      i++;
    } else if (arg === '--all') {
      parsed.all = true;
    } else if (arg.startsWith('--format=')) {
      const format = arg.split('=')[1];
      if (format === 'json' || format === 'text') {
        parsed.format = format;
      }
    } else if (arg === '--format' && i + 1 < args.length) {
      const format = args[i + 1];
      if (format === 'json' || format === 'text') {
        parsed.format = format;
      }
      i++;
    } else if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return parsed;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
File Consistency Checker

Usage:
  pnpm run check-consistency [options]

Options:
  --site <siteId>     Check specific site (e.g., naddpod, hardfork)
  --all               Check all available sites
  --format <format>   Output format: text (default) or json
  --verbose, -v       Enable verbose logging
  --help, -h          Show this help message

Examples:
  pnpm run check-consistency --site=naddpod
  pnpm run check-consistency --all --format=json
  pnpm run check-consistency --site=hardfork --verbose
`);
}

/**
 * Load episode manifest for the current site
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
 * Scan all files for a specific podcast
 */
async function scanPodcastFiles(podcastId: string): Promise<{
  audioFiles: string[];
  transcriptFiles: string[];
  searchEntryFiles: string[];
}> {
  const audioDir = `${getAudioDirPrefix()}${podcastId}/`;
  const transcriptDir = `${getTranscriptsDirPrefix()}${podcastId}/`;
  const searchEntryDir = `${getSearchEntriesDirPrefix()}${podcastId}/`;

  const [audioFiles, transcriptFiles, searchEntryFiles] = await Promise.all([
    listFiles(audioDir).catch(() => []),
    listFiles(transcriptDir).catch(() => []),
    listFiles(searchEntryDir).catch(() => [])
  ]);

  return {
    audioFiles: audioFiles.filter(f => f.endsWith('.mp3')),
    transcriptFiles: transcriptFiles.filter(f => f.endsWith('.srt')),
    searchEntryFiles: searchEntryFiles.filter(f => f.endsWith('.json'))
  };
}

/**
 * Extract file key from full file path
 */
function extractFileKey(filePath: string): string {
  const fileName = filePath.split('/').pop() || '';
  return fileName.replace(/\.(mp3|srt|json)$/, '');
}

/**
 * Create episode key for grouping (using pub date + title, ignoring downloadedAt)
 */
function createEpisodeKey(fileKey: string): string {
  try {
    const parsed = parseFileKey(fileKey);
    return `${parsed.date}_${parsed.title}`;
  } catch (error) {
    // If parsing fails, use the original fileKey
    return fileKey;
  }
}

/**
 * Group files by episode
 */
function groupFilesByEpisode(
  podcastId: string,
  files: { audioFiles: string[]; transcriptFiles: string[]; searchEntryFiles: string[] },
  manifestEntries: EpisodeInManifest[]
): FilesByEpisode {
  const grouped: FilesByEpisode = {};

  // Process audio files
  for (const audioFile of files.audioFiles) {
    const fileKey = extractFileKey(audioFile);
    const episodeKey = createEpisodeKey(fileKey);
    
    if (!grouped[episodeKey]) {
      grouped[episodeKey] = { versions: [] };
    }
    
    grouped[episodeKey].audio = audioFile;
    grouped[episodeKey].versions.push(fileKey);
  }

  // Process transcript files
  for (const transcriptFile of files.transcriptFiles) {
    const fileKey = extractFileKey(transcriptFile);
    const episodeKey = createEpisodeKey(fileKey);
    
    if (!grouped[episodeKey]) {
      grouped[episodeKey] = { versions: [] };
    }
    
    grouped[episodeKey].transcript = transcriptFile;
    if (!grouped[episodeKey].versions.includes(fileKey)) {
      grouped[episodeKey].versions.push(fileKey);
    }
  }

  // Process search entry files
  for (const searchEntryFile of files.searchEntryFiles) {
    const fileKey = extractFileKey(searchEntryFile);
    const episodeKey = createEpisodeKey(fileKey);
    
    if (!grouped[episodeKey]) {
      grouped[episodeKey] = { versions: [] };
    }
    
    grouped[episodeKey].searchEntry = searchEntryFile;
    if (!grouped[episodeKey].versions.includes(fileKey)) {
      grouped[episodeKey].versions.push(fileKey);
    }
  }

  // Process manifest entries
  for (const manifestEntry of manifestEntries.filter(e => e.podcastId === podcastId)) {
    const episodeKey = createEpisodeKey(manifestEntry.fileKey);
    
    if (!grouped[episodeKey]) {
      grouped[episodeKey] = { versions: [] };
    }
    
    grouped[episodeKey].manifestEntry = manifestEntry;
    if (!grouped[episodeKey].versions.includes(manifestEntry.fileKey)) {
      grouped[episodeKey].versions.push(manifestEntry.fileKey);
    }
  }

  return grouped;
}

/**
 * Check for consistency issues
 */
function checkConsistency(podcastId: string, filesByEpisode: FilesByEpisode): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  for (const [episodeKey, episode] of Object.entries(filesByEpisode)) {
    const hasAudio = !!episode.audio;
    const hasTranscript = !!episode.transcript;
    const hasSearchEntry = !!episode.searchEntry;
    const hasManifestEntry = !!episode.manifestEntry;

    // Critical Errors
    
    // Missing transcript when audio exists
    if (hasAudio && !hasTranscript) {
      issues.push({
        type: 'missing-file',
        severity: 'error',
        description: `Missing transcript for episode in podcast "${podcastId}"`,
        podcastId,
        episodeTitle: episode.manifestEntry?.title || episodeKey,
        downloadedAt: episode.manifestEntry?.downloadedAt,
        filePath: `${getTranscriptsDirPrefix()}${podcastId}/${extractFileKey(episode.audio!)}.srt`
      });
    }

    // Missing search entry when audio exists
    if (hasAudio && !hasSearchEntry) {
      issues.push({
        type: 'missing-file',
        severity: 'error',
        description: `Missing search entry for episode in podcast "${podcastId}"`,
        podcastId,
        episodeTitle: episode.manifestEntry?.title || episodeKey,
        downloadedAt: episode.manifestEntry?.downloadedAt,
        filePath: `${getSearchEntriesDirPrefix()}${podcastId}/${extractFileKey(episode.audio!)}.json`
      });
    }

    // Manifest entry has no files
    if (hasManifestEntry && !hasAudio && !hasTranscript && !hasSearchEntry) {
      issues.push({
        type: 'missing-file',
        severity: 'error',
        description: `Orphaned manifest entry - no files exist for episode "${episode.manifestEntry!.title}"`,
        podcastId,
        episodeTitle: episode.manifestEntry!.title,
        downloadedAt: episode.manifestEntry!.downloadedAt
      });
    }

    // Files exist but not in manifest
    if ((hasAudio || hasTranscript || hasSearchEntry) && !hasManifestEntry) {
      issues.push({
        type: 'manifest-mismatch',
        severity: 'error',
        description: `Files exist but not in manifest for episode "${episodeKey}"`,
        podcastId,
        episodeTitle: episodeKey,
        details: {
          hasAudio,
          hasTranscript,
          hasSearchEntry
        }
      });
    }

    // Warnings

    // Orphaned transcript (no audio)
    if (hasTranscript && !hasAudio) {
      issues.push({
        type: 'orphaned-file',
        severity: 'warning',
        description: `Orphaned transcript for episode in podcast "${podcastId}" - no audio file`,
        podcastId,
        episodeTitle: episode.manifestEntry?.title || episodeKey,
        filePath: episode.transcript
      });
    }

    // Orphaned search entry (no audio)
    if (hasSearchEntry && !hasAudio) {
      issues.push({
        type: 'orphaned-file',
        severity: 'warning',
        description: `Orphaned search entry for episode in podcast "${podcastId}" - no audio file`,
        podcastId,
        episodeTitle: episode.manifestEntry?.title || episodeKey,
        filePath: episode.searchEntry
      });
    }

    // Multiple versions (duplicate downloadedAt timestamps)
    if (episode.versions.length > 1) {
      const versions = episode.versions
        .map(fileKey => {
          const downloadedAt = extractDownloadedAtFromFileKey(fileKey);
          return downloadedAt ? downloadedAt.toISOString() : 'unknown';
        })
        .filter((v, i, arr) => arr.indexOf(v) === i); // Remove duplicates

      if (versions.length > 1) {
        issues.push({
          type: 'duplicate-versions',
          severity: 'warning',
          description: `Episode "${episode.manifestEntry?.title || episodeKey}" in podcast "${podcastId}" has ${versions.length} versions`,
          podcastId,
          episodeTitle: episode.manifestEntry?.title || episodeKey,
          versions,
          details: { fileKeys: episode.versions }
        });
      }
    }

    // Check for parse errors
    for (const fileKey of episode.versions) {
      try {
        parseFileKey(fileKey);
      } catch (error) {
        issues.push({
          type: 'parse-error',
          severity: 'error',
          description: `Invalid file key format: "${fileKey}" - ${error}`,
          podcastId,
          details: { fileKey, error: String(error) }
        });
      }
    }
  }

  return issues;
}

/**
 * Check consistency for a single site
 */
async function checkSiteConsistency(siteId: string): Promise<ConsistencyReport> {
  log.info(`Checking file consistency for site: ${siteId}`);

  // Set environment for site-aware operations
  process.env.CURRENT_SITE_ID = siteId;

  const site = getSiteById(siteId);
  if (!site) {
    throw new Error(`Site "${siteId}" not found`);
  }

  // Load manifest
  const manifest = await loadEpisodeManifest();
  const manifestEntries = manifest?.episodes || [];

  let totalAudioFiles = 0;
  let totalTranscriptFiles = 0;
  let totalSearchEntryFiles = 0;
  const allIssues: ConsistencyIssue[] = [];

  // Check each podcast in the site
  for (const podcast of site.includedPodcasts) {
    const podcastId = podcast.id as PodcastId;
    
    // Scan files for this podcast
    const files = await scanPodcastFiles(podcastId);
    totalAudioFiles += files.audioFiles.length;
    totalTranscriptFiles += files.transcriptFiles.length;
    totalSearchEntryFiles += files.searchEntryFiles.length;

    // Group files by episode
    const filesByEpisode = groupFilesByEpisode(podcastId, files, manifestEntries);

    // Check consistency
    const issues = checkConsistency(podcastId, filesByEpisode);
    allIssues.push(...issues);
  }

  // Calculate totals
  const episodesByUrl = new Map<string, EpisodeInManifest[]>();
  manifestEntries.forEach(ep => {
    if (!episodesByUrl.has(ep.originalAudioURL)) {
      episodesByUrl.set(ep.originalAudioURL, []);
    }
    episodesByUrl.get(ep.originalAudioURL)!.push(ep);
  });

  const report: ConsistencyReport = {
    summary: {
      audioFiles: totalAudioFiles,
      transcriptFiles: totalTranscriptFiles,
      searchEntryFiles: totalSearchEntryFiles,
      manifestEntries: manifestEntries.length,
      totalEpisodes: episodesByUrl.size,
      totalIssues: allIssues.length,
      errors: allIssues.filter(i => i.severity === 'error').length,
      warnings: allIssues.filter(i => i.severity === 'warning').length,
      info: allIssues.filter(i => i.severity === 'info').length
    },
    issues: allIssues,
    siteId,
    timestamp: new Date().toISOString()
  };

  return report;
}

/**
 * Display report in text format
 */
function displayTextReport(report: ConsistencyReport): void {
  const { summary, issues } = report;

  console.log(`
📊 FILE CONSISTENCY REPORT
==================================================

📈 SUMMARY:
  Audio Files: ${summary.audioFiles.toLocaleString()}
  Transcript Files: ${summary.transcriptFiles.toLocaleString()}
  Search Entry Files: ${summary.searchEntryFiles.toLocaleString()}
  Manifest Entries: ${summary.manifestEntries.toLocaleString()}
  Total Episodes: ${summary.totalEpisodes.toLocaleString()}
  Total Issues: ${summary.totalIssues}
    🔴 Errors: ${summary.errors}
    🟡 Warnings: ${summary.warnings}
    🔵 Info: ${summary.info}
`);

  if (issues.length === 0) {
    console.log('🎉 No issues found! All files are consistent.');
    return;
  }

  console.log(`
🔍 DETAILED ISSUES:
--------------------------------------------------
`);

  // Group issues by type
  const issuesByType = new Map<string, ConsistencyIssue[]>();
  for (const issue of issues) {
    if (!issuesByType.has(issue.type)) {
      issuesByType.set(issue.type, []);
    }
    issuesByType.get(issue.type)!.push(issue);
  }

  for (const [type, typeIssues] of issuesByType) {
    const typeTitle = type.replace(/-/g, ' ').toUpperCase();
    console.log(`${typeTitle} (${typeIssues.length} issues):`);
    
    for (const issue of typeIssues) {
      const emoji = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
      console.log(`  ${emoji} ${issue.description}`);
      
      if (issue.filePath) {
        console.log(`    📁 ${issue.filePath}`);
      }
      
      if (issue.versions && issue.versions.length > 1) {
        console.log(`    ℹ️  ${JSON.stringify({ versions: issue.versions })}`);
      }
    }
    console.log('');
  }

  console.log(`
💡 RECOMMENDATIONS:
--------------------------------------------------
🔴 ERRORS need immediate attention:
  - Missing files should be regenerated by running appropriate lambdas
  - Parse errors indicate file naming issues that need manual review
  - Manifest mismatches may require manifest updates

🟡 WARNINGS should be reviewed:
  - Duplicate versions can be cleaned up by running cleanup scripts
  - Orphaned files can be safely deleted if not needed
`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.verbose) {
    process.env.LOG_LEVEL = 'debug';
  }

  try {
    if (args.all) {
      // Check all sites
      const siteIds = getAvailableSiteIds();
      log.info(`Found ${siteIds.length} sites: ${siteIds.join(', ')}`);

      const reports: ConsistencyReport[] = [];
      
      for (const siteId of siteIds) {
        const report = await checkSiteConsistency(siteId);
        reports.push(report);
      }

      if (args.format === 'json') {
        console.log(JSON.stringify(reports, null, 2));
      } else {
        for (const report of reports) {
          console.log(`\n${'='.repeat(60)}`);
          console.log(`SITE: ${report.siteId.toUpperCase()}`);
          console.log('='.repeat(60));
          displayTextReport(report);
        }
      }

      // Exit with appropriate code
      const hasErrors = reports.some(r => r.summary.errors > 0);
      const hasWarnings = reports.some(r => r.summary.warnings > 0);
      process.exit(hasErrors ? 1 : hasWarnings ? 2 : 0);

    } else if (args.site) {
      // Check specific site
      const report = await checkSiteConsistency(args.site);

      if (args.format === 'json') {
        console.log(JSON.stringify(report, null, 2));
      } else {
        displayTextReport(report);
      }

      // Exit with appropriate code
      process.exit(report.summary.errors > 0 ? 1 : report.summary.warnings > 0 ? 2 : 0);

    } else {
      console.error('Error: Must specify either --site or --all');
      printUsage();
      process.exit(1);
    }

  } catch (error) {
    log.error('File consistency check failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { checkSiteConsistency, ConsistencyReport, ConsistencyIssue }; 