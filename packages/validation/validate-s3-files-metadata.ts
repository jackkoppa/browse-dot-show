import * as xml2js from 'xml2js';
import * as path from 'path';
import { execSync } from 'child_process';
import { log } from '@browse-dot-show/logging';
import { 
  fileExists, 
  getFile, 
  saveFile, 
  listFiles, 
  listDirectories,
  deleteFile 
} from '@browse-dot-show/s3';
import { RSS_CONFIG } from '@browse-dot-show/config';
import { EpisodeManifest, EpisodeInManifest, PodcastId } from '@browse-dot-show/types';
import { getEpisodeManifestKey } from '@browse-dot-show/constants';
import { getEpisodeFileKey } from './utils/get-episode-file-key.js';
import { parsePubDate } from './utils/parse-pub-date.js';

// Directory constants
const AUDIO_DIR_PREFIX = 'audio/';
const TRANSCRIPTS_DIR_PREFIX = 'transcripts/';
const SEARCH_ENTRIES_DIR_PREFIX = 'search-entries/';

// Types
interface LintResult {
  issues: LintIssue[];
  summary: LintSummary;
  hasErrors: boolean;
}

interface LintIssue {
  type: 'missing-file' | 'incorrect-filename' | 'unicode-issue' | 'orphaned-file' | 'manifest-mismatch';
  severity: 'error' | 'warning';
  description: string;
  episodeInfo?: {
    podcastId: string;
    title: string;
    fileKey: string;
  };
  filePath?: string;
  expectedPath?: string;
  fixAction?: 'rename' | 'delete' | 'create' | 'update-manifest';
}

interface LintSummary {
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  episodesChecked: number;
  filesScanned: number;
}

interface RssEpisode {
  title: string;
  pubDate: string;
  enclosure: {
    url: string;
    type: string;
    length: string | number;
  };
  guid: string;
}

interface ExpectedEpisode {
  podcastId: PodcastId;
  title: string;
  fileKey: string;
  pubDate: string;
  originalAudioURL: string;
}

/**
 * Parse RSS XML to JSON
 */
async function parseRSSFeed(xmlContent: string): Promise<any> {
  const parser = new xml2js.Parser({ 
    explicitArray: false,
    charkey: '_', 
    mergeAttrs: true,
    valueProcessors: [xml2js.processors.parseNumbers, xml2js.processors.parseBooleans],
    attrValueProcessors: [xml2js.processors.parseNumbers, xml2js.processors.parseBooleans],
  });
  
  try {
    return await parser.parseStringPromise(xmlContent);
  } catch (error) {
    log.error('Error parsing RSS XML:', error);
    throw error;
  }
}

/**
 * Fetch RSS feed content
 */
async function fetchRSSFeed(url: string): Promise<string> {
  try {
    log.debug(`Fetching RSS feed from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    log.error(`Error fetching RSS feed from ${url}:`, error);
    throw error;
  }
}

/**
 * Extract episodes from RSS feed
 */
function extractEpisodesFromRSS(parsedFeed: any, podcastId: PodcastId): ExpectedEpisode[] {
  const rssEpisodes: RssEpisode[] = parsedFeed.rss?.channel?.item || [];
  const episodes: ExpectedEpisode[] = [];

  for (const rssEpisode of rssEpisodes) {
    if (!rssEpisode.enclosure || !rssEpisode.enclosure.url || !rssEpisode.pubDate) {
      log.warn(`Skipping episode "${rssEpisode.title || 'N/A'}" due to missing enclosure or pubDate`);
      continue;
    }

    try {
      const parsedDate = parsePubDate(rssEpisode.pubDate);
      if (isNaN(parsedDate.getTime())) {
        throw new Error('Invalid date');
      }

      const fileKey = getEpisodeFileKey(rssEpisode.title, rssEpisode.pubDate);
      
      episodes.push({
        podcastId,
        title: rssEpisode.title,
        fileKey,
        pubDate: rssEpisode.pubDate,
        originalAudioURL: rssEpisode.enclosure.url
      });
    } catch (error) {
      log.warn(`Skipping episode "${rssEpisode.title}" due to date parsing error:`, error);
    }
  }

  return episodes;
}

/**
 * Check AWS SSO credentials for non-local environments
 */
async function checkAWSCredentials(): Promise<void> {
  const fileStorageEnv = process.env.FILE_STORAGE_ENV;
  
  // Only check credentials for AWS environments
  if (fileStorageEnv === 'local') {
    return;
  }

  const awsProfile = process.env.AWS_PROFILE;
  
  if (!awsProfile) {
    log.error('❌ AWS_PROFILE is not set');
    log.error('  Please add AWS_PROFILE to your environment variables for AWS SSO authentication');
    log.error('  Run \'aws configure sso\' to set up an SSO profile if needed');
    process.exit(1);
  }

  try {
    // Test SSO authentication with the specified profile
    execSync(`aws sts get-caller-identity --profile "${awsProfile}"`, { 
      stdio: 'pipe',
      timeout: 10000
    });
    log.info(`✅ AWS SSO authentication verified with profile: ${awsProfile}`);
  } catch (error) {
    log.error('❌ AWS SSO credentials are not working or expired.');
    log.error(`  Please run 'aws sso login --profile ${awsProfile}' to authenticate`);
    log.error('  Then retry the linting command.');
    process.exit(1);
  }
}

/**
 * Load episode manifest
 */
async function loadEpisodeManifest(): Promise<EpisodeManifest | null> {
  try {
    const episodeManifestKey = getEpisodeManifestKey();
    if (await fileExists(episodeManifestKey)) {
      const manifestBuffer = await getFile(episodeManifestKey);
      return JSON.parse(manifestBuffer.toString('utf-8')) as EpisodeManifest;
    }
    return null;
  } catch (error) {
    log.error('Error loading episode manifest:', error);
    throw error;
  }
}

/**
 * Check if a file exists in the provided file list, including checking normalized version
 */
function checkFileExistsInList(filePath: string, allFiles: Set<string>): {
  exists: boolean;
  actualPath?: string;
  needsNormalization?: boolean;
} {
  log.debug(`Checking file existence in list: ${filePath}`);
  
  // First check exact path
  if (allFiles.has(filePath)) {
    log.debug(`File exists at exact path: ${filePath}`);
    return { exists: true, actualPath: filePath, needsNormalization: false };
  }

  // Check if a normalized version exists
  const normalizedPath = filePath.normalize('NFC');
  if (normalizedPath !== filePath && allFiles.has(normalizedPath)) {
    log.debug(`File exists at normalized path: ${normalizedPath}`);
    return { exists: true, actualPath: normalizedPath, needsNormalization: true };
  }

  // Check for files that would match when normalized
  const expectedFilename = path.basename(filePath);
  const dir = path.dirname(filePath);
  
  for (const existingFile of allFiles) {
    if (existingFile.startsWith(dir + '/') || existingFile.startsWith(dir + path.sep)) {
      const existingFilename = path.basename(existingFile);
      if (existingFilename.normalize('NFC') === expectedFilename.normalize('NFC')) {
        log.debug(`Found matching file with normalization: ${existingFile}`);
        return { 
          exists: true, 
          actualPath: existingFile, 
          needsNormalization: existingFilename !== expectedFilename.normalize('NFC')
        };
      }
    }
  }

  log.debug(`File not found: ${filePath}`);
  return { exists: false };
}

/**
 * Collect all episodes from RSS feeds
 */
async function collectExpectedEpisodes(): Promise<ExpectedEpisode[]> {
  const allExpectedEpisodes: ExpectedEpisode[] = [];
  
  const activeFeeds = Object.values(RSS_CONFIG).filter(feed => feed.status === 'active');
  
  for (const podcastConfig of activeFeeds) {
    try {
      log.info(`Processing RSS feed for ${podcastConfig.title}...`);
      const xmlContent = await fetchRSSFeed(podcastConfig.url);
      const parsedFeed = await parseRSSFeed(xmlContent);
      const episodes = extractEpisodesFromRSS(parsedFeed, podcastConfig.id);
      allExpectedEpisodes.push(...episodes);
      log.info(`Found ${episodes.length} episodes in ${podcastConfig.title}`);
    } catch (error) {
      log.error(`Error processing RSS feed for ${podcastConfig.title}:`, error);
      throw error;
    }
  }
  
  return allExpectedEpisodes;
}

/**
 * Scan all S3 files
 */
async function scanAllS3Files(): Promise<{
  audioFiles: string[];
  transcriptFiles: string[];
  searchEntryFiles: string[];
}> {
  const audioFiles: string[] = [];
  const transcriptFiles: string[] = [];
  const searchEntryFiles: string[] = [];

  // Scan audio files
  try {
    const audioPodcastDirs = await listDirectories(AUDIO_DIR_PREFIX);
    for (const dir of audioPodcastDirs) {
      const files = await listFiles(dir);
      audioFiles.push(...files);
    }
  } catch (error) {
    log.warn('Error scanning audio files:', error);
  }

  // Scan transcript files
  try {
    const transcriptPodcastDirs = await listDirectories(TRANSCRIPTS_DIR_PREFIX);
    for (const dir of transcriptPodcastDirs) {
      const files = await listFiles(dir);
      transcriptFiles.push(...files);
    }
  } catch (error) {
    log.warn('Error scanning transcript files:', error);
  }

  // Scan search entry files
  try {
    const searchEntryPodcastDirs = await listDirectories(SEARCH_ENTRIES_DIR_PREFIX);
    for (const dir of searchEntryPodcastDirs) {
      const files = await listFiles(dir);
      searchEntryFiles.push(...files);
    }
  } catch (error) {
    log.warn('Error scanning search entry files:', error);
  }

  return { audioFiles, transcriptFiles, searchEntryFiles };
}

/**
 * Validate episodes and detect issues
 */
async function validateEpisodes(
  expectedEpisodes: ExpectedEpisode[],
  manifest: EpisodeManifest | null,
  s3Files: { audioFiles: string[]; transcriptFiles: string[]; searchEntryFiles: string[] }
): Promise<LintIssue[]> {
  log.debug(`Starting validation of ${expectedEpisodes.length} episodes...`);
  const issues: LintIssue[] = [];
  const processedFiles = new Set<string>();

  // Create a Set of all files for fast lookup (filter out directories)
  const allFiles = new Set<string>([
    ...s3Files.audioFiles.filter(f => !f.endsWith('/')),
    ...s3Files.transcriptFiles.filter(f => !f.endsWith('/')),
    ...s3Files.searchEntryFiles.filter(f => !f.endsWith('/'))
  ]);
  log.debug(`Created file lookup set with ${allFiles.size} files (directories excluded)`);

  for (let i = 0; i < expectedEpisodes.length; i++) {
    const episode = expectedEpisodes[i];
    log.debug(`Validating episode ${i + 1}/${expectedEpisodes.length}: ${episode.title}`);
    
    // Progress indicator for every 50 episodes
    if ((i + 1) % 50 === 0) {
      log.info(`📋 Validation progress: ${i + 1}/${expectedEpisodes.length} episodes checked`);
    }
    const { podcastId, title, fileKey } = episode;

    // Check manifest entry
    const manifestEpisode = manifest?.episodes.find(e => 
      e.podcastId === podcastId && e.originalAudioURL === episode.originalAudioURL
    );
    
    if (!manifestEpisode) {
      issues.push({
        type: 'manifest-mismatch',
        severity: 'error',
        description: `Episode missing from manifest: ${title}`,
        episodeInfo: { podcastId, title, fileKey },
        fixAction: 'update-manifest'
      });
    } else if (manifestEpisode.fileKey !== fileKey) {
      issues.push({
        type: 'manifest-mismatch',
        severity: 'error',
        description: `Manifest fileKey mismatch: expected "${fileKey}", found "${manifestEpisode.fileKey}"`,
        episodeInfo: { podcastId, title, fileKey },
        expectedPath: fileKey,
        filePath: manifestEpisode.fileKey,
        fixAction: 'update-manifest'
      });
    }

    // Check required files
    const requiredFiles = [
      { path: path.join(AUDIO_DIR_PREFIX, podcastId, `${fileKey}.mp3`), type: 'audio' },
      { path: path.join(TRANSCRIPTS_DIR_PREFIX, podcastId, `${fileKey}.srt`), type: 'transcript' },
      { path: path.join(SEARCH_ENTRIES_DIR_PREFIX, podcastId, `${fileKey}.json`), type: 'search-entry' }
    ];

    log.debug(`Checking ${requiredFiles.length} required files for episode: ${title}`);
    for (const { path: filePath, type } of requiredFiles) {
      log.debug(`Checking ${type} file for episode: ${filePath}`);
      const result = checkFileExistsInList(filePath, allFiles);
      
      if (!result.exists) {
        issues.push({
          type: 'missing-file',
          severity: 'error',
          description: `Missing ${type} file: ${filePath}`,
          episodeInfo: { podcastId, title, fileKey },
          expectedPath: filePath,
          fixAction: 'create'
        });
      } else if (result.needsNormalization && result.actualPath) {
        issues.push({
          type: 'unicode-issue',
          severity: 'warning',
          description: `File needs Unicode normalization: ${result.actualPath}`,
          episodeInfo: { podcastId, title, fileKey },
          filePath: result.actualPath,
          expectedPath: filePath,
          fixAction: 'rename'
        });
        processedFiles.add(result.actualPath);
      } else if (result.actualPath) {
        processedFiles.add(result.actualPath);
      }
    }
  }

  // Check for orphaned files
  log.debug(`Checking for orphaned files...`);
  log.debug(`Comparing ${allFiles.size} S3 files against ${processedFiles.size} processed files`);
  for (const filePath of allFiles) {
    if (!processedFiles.has(filePath)) {
      log.debug(`Found orphaned file: ${filePath}`);
      issues.push({
        type: 'orphaned-file',
        severity: 'warning',
        description: `Orphaned file (no corresponding RSS episode): ${filePath}`,
        filePath,
        fixAction: 'delete'
      });
    }
  }

  log.debug(`Validation complete. Found ${issues.length} total issues.`);
  return issues;
}

/**
 * Display issues to user
 */
function displayIssues(issues: LintIssue[]): void {
  if (issues.length === 0) {
    log.info('✅ No issues found! All files are properly organized and named.');
    return;
  }

  log.info(`\n🔍 Found ${issues.length} issues:\n`);

  const groupedIssues = issues.reduce((groups, issue) => {
    if (!groups[issue.type]) groups[issue.type] = [];
    groups[issue.type].push(issue);
    return groups;
  }, {} as Record<string, LintIssue[]>);

  for (const [type, typeIssues] of Object.entries(groupedIssues)) {
    log.info(`\n📋 ${type.toUpperCase().replace('-', ' ')} (${typeIssues.length} issues):`);
    typeIssues.forEach((issue, index) => {
      const severity = issue.severity === 'error' ? '❌' : '⚠️';
      log.info(`  ${severity} ${issue.description}`);
      if (issue.filePath) log.info(`      Current: ${issue.filePath}`);
      if (issue.expectedPath) log.info(`      Expected: ${issue.expectedPath}`);
    });
  }
}

/**
 * Preview fixes that would be applied
 */
function previewFixes(issues: LintIssue[]): void {
  const fixableIssues = issues.filter(issue => issue.fixAction);
  
  if (fixableIssues.length === 0) {
    log.info('No automatic fixes available.');
    return;
  }

  log.info(`\n🔧 Preview of fixes that would be applied:\n`);

  const fixGroups = fixableIssues.reduce((groups, issue) => {
    const action = issue.fixAction!;
    if (!groups[action]) groups[action] = [];
    groups[action].push(issue);
    return groups;
  }, {} as Record<string, LintIssue[]>);

  for (const [action, actionIssues] of Object.entries(fixGroups)) {
    log.info(`\n📝 ${action.toUpperCase().replace('-', ' ')} (${actionIssues.length} files):`);
    actionIssues.forEach(issue => {
      switch (action) {
        case 'rename':
          log.info(`  🔄 Rename: ${issue.filePath} → ${issue.expectedPath}`);
          break;
        case 'delete':
          log.info(`  🗑️  Delete: ${issue.filePath}`);
          break;
        case 'update-manifest':
          log.info(`  📝 Update manifest entry for: ${issue.episodeInfo?.title}`);
          break;
        case 'create':
          log.info(`  ➕ Missing file (would need manual intervention): ${issue.expectedPath}`);
          break;
      }
    });
  }
}

/**
 * Get user confirmation for applying fixes
 */
async function getUserConfirmation(): Promise<boolean> {
  // This is a simplified version - in a real CLI you'd use readline
  // For now, we'll return true to allow testing
  console.log('\n⚠️ IMPORTANT: In a real CLI, this would prompt for user confirmation');
  console.log('Do you want to apply these fixes? (y/N)');
  console.log('For testing purposes, assuming "yes"...\n');
  return true;
}

/**
 * Apply fixes with user confirmation
 */
async function applyFixesToFiles(issues: LintIssue[], expectedEpisodes: ExpectedEpisode[]): Promise<void> {
  const fixableIssues = issues.filter(issue => issue.fixAction && issue.fixAction !== 'create');
  
  if (fixableIssues.length === 0) {
    log.info('No fixes to apply.');
    return;
  }

  previewFixes(issues);
  
  const confirmed = await getUserConfirmation();
  if (!confirmed) {
    log.info('Fixes cancelled by user.');
    return;
  }

  log.info('Applying fixes...\n');

  // Apply renames
  const renameIssues = fixableIssues.filter(issue => issue.fixAction === 'rename');
  for (const issue of renameIssues) {
    if (issue.filePath && issue.expectedPath) {
      try {
        const fileContent = await getFile(issue.filePath);
        await saveFile(issue.expectedPath, fileContent);
        await deleteFile(issue.filePath);
        log.info(`✅ Renamed: ${issue.filePath} → ${issue.expectedPath}`);
      } catch (error) {
        log.error(`❌ Failed to rename ${issue.filePath}:`, error);
      }
    }
  }

  // Apply deletions
  const deleteIssues = fixableIssues.filter(issue => issue.fixAction === 'delete');
  for (const issue of deleteIssues) {
    if (issue.filePath) {
      try {
        await deleteFile(issue.filePath);
        log.info(`✅ Deleted: ${issue.filePath}`);
      } catch (error) {
        log.error(`❌ Failed to delete ${issue.filePath}:`, error);
      }
    }
  }

  // Update manifest
  const manifestIssues = fixableIssues.filter(issue => issue.fixAction === 'update-manifest');
  if (manifestIssues.length > 0) {
    try {
      await updateManifestFromExpectedEpisodes(expectedEpisodes);
      log.info(`✅ Updated episode manifest with ${manifestIssues.length} corrections`);
    } catch (error) {
      log.error('❌ Failed to update manifest:', error);
    }
  }
}

/**
 * Update manifest based on expected episodes
 */
async function updateManifestFromExpectedEpisodes(expectedEpisodes: ExpectedEpisode[]): Promise<void> {
  const manifest = await loadEpisodeManifest();
  if (!manifest) {
    log.error('Cannot update manifest: manifest file not found');
    return;
  }

  // Update existing episodes and add missing ones
  const updatedEpisodes: EpisodeInManifest[] = [...manifest.episodes];
  
  for (const expected of expectedEpisodes) {
    const existingIndex = updatedEpisodes.findIndex(e => 
      e.podcastId === expected.podcastId && e.originalAudioURL === expected.originalAudioURL
    );
    
    if (existingIndex >= 0) {
      // Update existing episode
      updatedEpisodes[existingIndex].fileKey = expected.fileKey;
      updatedEpisodes[existingIndex].title = expected.title;
    } else {
      // Add missing episode
      const newEpisode: EpisodeInManifest = {
        sequentialId: 0, // Will be updated during global sort
        podcastId: expected.podcastId,
        title: expected.title,
        fileKey: expected.fileKey,
        originalAudioURL: expected.originalAudioURL,
        summary: '',
        publishedAt: parsePubDate(expected.pubDate).toISOString(),
        hasCompletedLLMAnnotations: false,
        llmAnnotations: {}
      };
      updatedEpisodes.push(newEpisode);
    }
  }

  // Sort and reassign sequential IDs
  updatedEpisodes.sort((a, b) => {
    const dateA = new Date(a.publishedAt).getTime();
    const dateB = new Date(b.publishedAt).getTime();
    return dateA - dateB;
  });

  updatedEpisodes.forEach((episode, index) => {
    episode.sequentialId = index + 1;
  });

  // Save updated manifest
  const updatedManifest: EpisodeManifest = {
    ...manifest,
    episodes: updatedEpisodes,
    lastUpdated: new Date().toISOString()
  };

  await saveFile(getEpisodeManifestKey(), JSON.stringify(updatedManifest, null, 2));
}

/**
 * Main linting function
 */
export async function lintS3Files(applyFixes: boolean = false): Promise<LintResult> {
  log.info('🔍 Starting S3 files metadata linting...');
  
  try {
    // 0. Check AWS credentials for non-local environments
    await checkAWSCredentials();

    // 1. Collect expected episodes from RSS feeds
    log.info('📡 Fetching and parsing RSS feeds...');
    const expectedEpisodes = await collectExpectedEpisodes();
    log.info(`Found ${expectedEpisodes.length} total episodes across all RSS feeds`);

    // 2. Load episode manifest
    log.info('📋 Loading episode manifest...');
    const manifest = await loadEpisodeManifest();
    if (manifest) {
      log.info(`Loaded manifest with ${manifest.episodes.length} episodes`);
    } else {
      log.warn('Episode manifest not found at:', getEpisodeManifestKey());
    }

    // 3. Scan S3 files
    log.info('📁 Scanning S3 files...');
    const s3Files = await scanAllS3Files();
    const totalFiles = s3Files.audioFiles.length + s3Files.transcriptFiles.length + s3Files.searchEntryFiles.length;
    log.info(`Scanned ${totalFiles} files (${s3Files.audioFiles.length} audio, ${s3Files.transcriptFiles.length} transcripts, ${s3Files.searchEntryFiles.length} search entries)`);

    // 4. Validate and detect issues
    log.info('🔍 Validating files and detecting issues...');
    const issues = await validateEpisodes(expectedEpisodes, manifest, s3Files);

    // 5. Display results
    displayIssues(issues);

    // 6. Apply fixes if requested
    if (applyFixes && issues.length > 0) {
      await applyFixesToFiles(issues, expectedEpisodes);
    }

    // 7. Generate summary
    const summary: LintSummary = {
      totalIssues: issues.length,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length,
      episodesChecked: expectedEpisodes.length,
      filesScanned: totalFiles
    };

    const result: LintResult = {
      issues,
      summary,
      hasErrors: summary.errorCount > 0
    };

    log.info(`\n📊 Linting Summary:`);
    log.info(`   Episodes checked: ${summary.episodesChecked}`);
    log.info(`   Files scanned: ${summary.filesScanned}`);
    log.info(`   Total issues: ${summary.totalIssues}`);
    log.info(`   Errors: ${summary.errorCount}`);
    log.info(`   Warnings: ${summary.warningCount}`);

    if (result.hasErrors) {
      log.info('\n❌ Linting completed with errors');
    } else if (summary.warningCount > 0) {
      log.info('\n⚠️ Linting completed with warnings');
    } else {
      log.info('\n✅ Linting completed successfully - no issues found!');
    }

    return result;

  } catch (error) {
    log.error('❌ Fatal error during linting:', error);
    throw error;
  }
}

/**
 * CLI entry point
 */
async function main() {
  const applyFixes = process.argv.includes('--apply-fixes');
  
  try {
    const result = await lintS3Files(applyFixes);
    
    // Exit with error code if there are errors
    if (result.hasErrors) {
      process.exit(1);
    }
  } catch (error) {
    log.error('Linting failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

