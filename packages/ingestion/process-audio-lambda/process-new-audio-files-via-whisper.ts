import * as path from 'path';
import SrtParser from 'srt-parser-2';
import fs from 'fs-extra'; // Still needed for stream operations with ffmpeg
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { log } from '@browse-dot-show/logging';
import { 
  applyCorrectionToFile,
  aggregateCorrectionResults,
  type ApplyCorrectionsResult
} from '@browse-dot-show/spelling';
import { getSiteById } from '../../../sites/index.js';
import { hasDownloadedAtTimestamp, parseFileKey } from '../rss-retrieval-lambda/utils/get-episode-file-key.js';
import {
  fileExists,
  getFile,
  saveFile,
  listFiles,
  createDirectory,
  getDirectorySize,
  listDirectories,
  deleteFile,
} from '@browse-dot-show/s3'
import { transcribeViaWhisper, WhisperApiProvider } from './utils/transcribe-via-whisper.js';
import { splitAudioFile, prepareAudioFile, TranscriptionChunk, getAudioMetadata } from './utils/ffmpeg-utils.js';


log.info(`▶️ Starting process-new-audio-files-via-whisper, with logging level: ${log.getLevel()}`);

// Constants - S3 paths
const AUDIO_DIR_PREFIX = 'audio/';
const TRANSCRIPTS_DIR_PREFIX = 'transcripts/';
const LOCKFILE_PATH = 'transcripts/.processing-lock.json';
const MAX_FILE_SIZE_MB = 25;
const MAX_DURATION_MINUTES = 20; // Maximum duration before chunking
// Which Whisper API provider to use (can be configured via environment variable)
const WHISPER_API_PROVIDER: WhisperApiProvider = (process.env.WHISPER_API_PROVIDER as WhisperApiProvider) || 'openai';
const LAMBDA_CLIENT = new LambdaClient({});
const INDEXING_LAMBDA_NAME = 'convert-srts-indexed-search';

// Helper function to detect if we're running in AWS Lambda environment
function isRunningInLambda(): boolean {
  return !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

// ====== STRUCTURED LOGGING FOR MULTI-TERMINAL PROGRESS TRACKING ======
interface ProgressLogEntry {
  processId: string;
  timestamp: string;
  type: 'START' | 'PROGRESS' | 'COMPLETE' | 'ERROR';
  message: string;
  data?: {
    totalMinutes?: number;
    completedMinutes?: number;
    percentComplete?: number;
    currentFile?: string;
    siteId?: string;
    totalFiles?: number;
    completedFiles?: number;
  };
}

/**
 * Log structured progress information for multi-terminal monitoring
 */
function logProgress(type: string, message: string, data: any = {}) {
  const entry: ProgressLogEntry = {
    processId: process.env.PROCESS_ID || 'unknown',
    timestamp: new Date().toISOString(),
    type: type as any,
    message,
    data: {
      siteId: process.env.SITE_ID,
      ...data
    }
  };
  
  // Write structured log to both stdout and file (if LOG_FILE is set)
  const logLine = JSON.stringify(entry);
  console.log(logLine);
  
  if (process.env.LOG_FILE) {
    try {
      const fs = require('fs');
      fs.appendFileSync(process.env.LOG_FILE, logLine + '\n');
    } catch {
      // Silently ignore file write errors to avoid breaking transcription
    }
  }
}

// Types
interface SrtEntry {
  id: string;
  startTime: string;
  endTime: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
}

// Lockfile management functions
interface LockfileEntry {
  fileKey: string;
  processId: string;
  timestamp: number;
}

interface Lockfile {
  entries: LockfileEntry[];
  version: number;
}

// Generate a unique process ID for this run
const PROCESS_ID = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

async function readLockfile(): Promise<Lockfile> {
  try {
    if (await fileExists(LOCKFILE_PATH)) {
      const buffer = await getFile(LOCKFILE_PATH);
      const content = buffer.toString('utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    log.debug(`Error reading lockfile: ${error}`);
  }
  
  // Return empty lockfile if it doesn't exist or can't be read
  return { entries: [], version: 1 };
}

async function writeLockfile(lockfile: Lockfile): Promise<void> {
  try {
    const content = JSON.stringify(lockfile, null, 2);
    await saveFile(LOCKFILE_PATH, Buffer.from(content, 'utf-8'));
  } catch (error) {
    log.error(`Error writing lockfile: ${error}`);
    throw error;
  }
}

async function addToLockfile(fileKey: string): Promise<boolean> {
  try {
    const lockfile = await readLockfile();
    
    // Check if file is already being processed
    const existingEntry = lockfile.entries.find(entry => entry.fileKey === fileKey);
    if (existingEntry) {
      log.debug(`File ${fileKey} is already being processed by process ${existingEntry.processId}`);
      return false;
    }
    
    // Add new entry
    lockfile.entries.push({
      fileKey,
      processId: PROCESS_ID,
      timestamp: Date.now()
    });
    
    lockfile.version++;
    await writeLockfile(lockfile);
    log.debug(`Added ${fileKey} to lockfile with process ID ${PROCESS_ID}`);
    return true;
  } catch (error) {
    log.error(`Error adding ${fileKey} to lockfile: ${error}`);
    return false;
  }
}

async function removeFromLockfile(fileKey: string): Promise<void> {
  try {
    const lockfile = await readLockfile();
    
    // Remove the entry for this file and process ID
    lockfile.entries = lockfile.entries.filter(
      entry => !(entry.fileKey === fileKey && entry.processId === PROCESS_ID)
    );
    
    lockfile.version++;
    await writeLockfile(lockfile);
    log.debug(`Removed ${fileKey} from lockfile for process ID ${PROCESS_ID}`);
  } catch (error) {
    log.error(`Error removing ${fileKey} from lockfile: ${error}`);
  }
}

async function cleanupStaleEntries(): Promise<void> {
  try {
    const lockfile = await readLockfile();
    const now = Date.now();
    const staleThresholdMs = 2 * 60 * 60 * 1000; // 2 hours
    
    const originalCount = lockfile.entries.length;
    lockfile.entries = lockfile.entries.filter(entry => {
      const age = now - entry.timestamp;
      return age < staleThresholdMs;
    });
    
    const removedCount = originalCount - lockfile.entries.length;
    if (removedCount > 0) {
      lockfile.version++;
      await writeLockfile(lockfile);
      log.info(`Cleaned up ${removedCount} stale lockfile entries`);
    }
  } catch (error) {
    log.error(`Error cleaning up stale entries: ${error}`);
  }
}

async function isFileBeingProcessed(fileKey: string): Promise<boolean> {
  try {
    const lockfile = await readLockfile();
    return lockfile.entries.some(entry => entry.fileKey === fileKey);
  } catch (error) {
    log.debug(`Error checking if file is being processed: ${error}`);
    return false;
  }
}

async function cleanupStaleProcessDirectories(): Promise<void> {
  try {
    const tmpDir = '/tmp';
    if (!await fs.pathExists(tmpDir)) {
      return;
    }

    const entries = await fs.readdir(tmpDir);
    const staleThresholdMs = 2 * 60 * 60 * 1000; // 2 hours
    const now = Date.now();
    let cleanedCount = 0;

    for (const entry of entries) {
      // Look for process-specific directories (format: process-timestamp-randomid or timestamp-randomid)
      if ((entry.startsWith('process-') || /^\d{13}-[a-z0-9]+$/.test(entry)) && entry !== PROCESS_ID) {
        const fullPath = path.join(tmpDir, entry);
        
        try {
          const stats = await fs.stat(fullPath);
          const age = now - stats.mtime.getTime();
          
          if (stats.isDirectory() && age > staleThresholdMs) {
            await fs.remove(fullPath);
            cleanedCount++;
            log.debug(`Cleaned up stale process directory: ${fullPath}`);
          }
        } catch (statError) {
          // Directory might have been removed by another process, ignore
          log.debug(`Could not stat ${fullPath}, skipping: ${statError}`);
        }
      }
    }

    if (cleanedCount > 0) {
      log.info(`Cleaned up ${cleanedCount} stale process directories`);
    }
  } catch (error) {
    log.error(`Error cleaning up stale process directories: ${error}`);
  }
}

// Helper function to get all MP3 files in a directory
async function getMp3Files(dirKey: string): Promise<string[]> {
  const files = await listFiles(dirKey);
  return files.filter(file => file.endsWith('.mp3') && !file.endsWith('.DS_Store'));
}

// Helper function to check if transcription exists
async function transcriptExists(fileKey: string): Promise<boolean> {
  const audioFileName = path.basename(fileKey, '.mp3');
  const podcastName = path.basename(path.dirname(fileKey));
  const transcriptKey = path.join(TRANSCRIPTS_DIR_PREFIX, podcastName, `${audioFileName}.srt`);

  return fileExists(transcriptKey);
}

// Helper function to get the file size in MB
async function getFileSizeMB(fileKey: string): Promise<number> {
  // Download the file to check its size
  const buffer = await getFile(fileKey);
  return buffer.length / (1024 * 1024);
}

// Helper function to get the audio duration in minutes
async function getAudioDurationMinutes(fileKey: string): Promise<number> {
  // Create a temporary file to analyze with ffprobe
  const tempFilePath = path.join('/tmp', `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp3`);
  
  try {
    // Download the file to temp location
    const audioBuffer = await getFile(fileKey);
    await fs.writeFile(tempFilePath, audioBuffer);
    
    // Get metadata using ffprobe
    const metadata = await getAudioMetadata(tempFilePath);
    const durationSeconds = metadata.format.duration || 0;
    const durationMinutes = durationSeconds / 60;
    
    return durationMinutes;
  } finally {
    // Clean up temp file
    try {
      await fs.remove(tempFilePath);
    } catch (error) {
      log.debug(`Failed to clean up temp file ${tempFilePath}:`, error);
    }
  }
}

// Helper function to combine SRT files
function combineSrtFiles(srtFiles: string[], chunks: TranscriptionChunk[]): string {
  const parser = new SrtParser();
  let combinedEntries: SrtEntry[] = [];
  let currentId = 1;

  srtFiles.forEach((srtContent, index) => {
    try {
      const entries = parser.fromSrt(srtContent);
      // Use the actual chunk start time as offset (already in seconds)
      const offset = chunks[index]?.startTime || 0;

      entries.forEach((entry: any) => {
        // Skip entries with invalid timestamps (sometimes Whisper can return these)
        if (!entry.startTime || !entry.endTime ||
          entry.startTime.includes('NaN') || entry.endTime.includes('NaN')) {
          log.debug(`Skipping entry with invalid timestamp: ${JSON.stringify(entry)}`);
          return;
        }

        // Calculate seconds if not already present
        if (typeof entry.startSeconds !== 'number' || isNaN(entry.startSeconds)) {
          entry.startSeconds = timeStringToSeconds(entry.startTime);
        }

        if (typeof entry.endSeconds !== 'number' || isNaN(entry.endSeconds)) {
          entry.endSeconds = timeStringToSeconds(entry.endTime);
        }

        // Convert entry to our SrtEntry format with valid seconds
        const newEntry: SrtEntry = {
          id: currentId.toString(),
          startTime: adjustTimestamp(entry.startTime, offset),
          endTime: adjustTimestamp(entry.endTime, offset),
          text: entry.text,
          startSeconds: entry.startSeconds + offset,
          endSeconds: entry.endSeconds + offset
        };
        currentId++;
        combinedEntries.push(newEntry);
      });
    } catch (error) {
      log.error(`Error parsing SRT content for chunk ${index}:`, error);
    }
  });

  // Ensure entries are sorted by time
  combinedEntries.sort((a, b) => a.startSeconds - b.startSeconds);

  return parser.toSrt(combinedEntries);
}

// Helper function to convert SRT timestamp to seconds
function timeStringToSeconds(timeString: string): number {
  // Handle format like "00:00:00,000"
  const parts = timeString.split(',');
  const [hours, minutes, seconds] = (parts[0] || '00:00:00').split(':').map(part => {
    const num = Number(part);
    return isNaN(num) ? 0 : num;
  });

  return hours * 3600 + minutes * 60 + seconds;
}

// Helper function to adjust SRT timestamps
function adjustTimestamp(timestamp: string, offsetSeconds: number): string {
  // Handle timestamp format like "00:00:00,000"
  const parts = timestamp.split(',');
  const milliseconds = parts[1] || '000';

  // Parse time components
  const [hours, minutes, seconds] = (parts[0] || '00:00:00').split(':').map(part => {
    // Ensure we're dealing with valid numbers
    const num = Number(part);
    return isNaN(num) ? 0 : num;
  });

  // Calculate total seconds with offset
  const totalSeconds = hours * 3600 + minutes * 60 + seconds + offsetSeconds;

  // Format new timestamp
  const newHours = Math.floor(totalSeconds / 3600);
  const newMinutes = Math.floor((totalSeconds % 3600) / 60);
  const newSeconds = Math.floor(totalSeconds % 60);

  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}:${String(newSeconds).padStart(2, '0')},${milliseconds}`;
}

// Helper function to check if a newer version of the same episode exists
async function hasNewerAudioVersion(currentAudioFileKey: string): Promise<boolean> {
  try {
    const podcastName = path.basename(path.dirname(currentAudioFileKey));
    const currentAudioFileName = path.basename(currentAudioFileKey, '.mp3');
    
    // Only check for newer versions if current file has downloadedAt timestamp
    if (!hasDownloadedAtTimestamp(currentAudioFileName)) {
      log.debug(`Current file ${currentAudioFileName} doesn't have downloadedAt timestamp, skipping newer version check`);
      return false;
    }
    
    const currentParsed = parseFileKey(currentAudioFileName);
    const currentDownloadedAt = currentParsed.downloadedAt;
    
    if (!currentDownloadedAt) {
      log.debug(`Could not extract downloadedAt from ${currentAudioFileName}, skipping newer version check`);
      return false;
    }
    
    // List all audio files for this podcast
    const audioDirKey = path.join(AUDIO_DIR_PREFIX, podcastName);
    
    try {
      const allAudioFiles = await listFiles(audioDirKey);
      
      for (const audioFile of allAudioFiles) {
        if (!audioFile.endsWith('.mp3')) continue;
        
        const audioFileName = path.basename(audioFile, '.mp3');
        
        // Skip if this is the current file
        if (audioFileName === currentAudioFileName) continue;
        
        try {
          // Check if this audio file has downloadedAt timestamp
          if (!hasDownloadedAtTimestamp(audioFileName)) continue;
          
          const audioParsed = parseFileKey(audioFileName);
          
          // Check if this is the same episode (same date and base title)
          if (audioParsed.date === currentParsed.date && 
              audioParsed.title === currentParsed.title) {
            
            const audioDownloadedAt = audioParsed.downloadedAt;
            
            if (audioDownloadedAt && audioDownloadedAt > currentDownloadedAt) {
              // Found a newer version of the same episode
              log.info(`Found newer audio version: ${audioFileName} (downloaded at ${audioDownloadedAt.toISOString()}) vs current ${currentAudioFileName} (downloaded at ${currentDownloadedAt.toISOString()})`);
              return true;
            }
          }
        } catch (parseError) {
          log.debug(`Could not parse audio filename ${audioFileName}:`, parseError);
          continue;
        }
      }
      
      return false;
      
    } catch (listError) {
      log.debug(`Could not list audio files in ${audioDirKey}:`, listError);
      return false;
    }
    
  } catch (error) {
    log.error(`Error checking for newer audio versions of ${currentAudioFileKey}:`, error);
    // Return false so we don't skip processing due to errors
    return false;
  }
}

// Helper function to clean up older transcript versions for the same episode
async function cleanupOlderTranscriptVersions(currentAudioFileKey: string): Promise<void> {
  try {
    const podcastName = path.basename(path.dirname(currentAudioFileKey));
    const currentAudioFileName = path.basename(currentAudioFileKey, '.mp3');
    
    // Only proceed if current file has downloadedAt timestamp
    if (!hasDownloadedAtTimestamp(currentAudioFileName)) {
      log.debug(`Current file ${currentAudioFileName} doesn't have downloadedAt timestamp, skipping cleanup`);
      return;
    }
    
    const currentParsed = parseFileKey(currentAudioFileName);
    const currentDownloadedAt = currentParsed.downloadedAt;
    
    if (!currentDownloadedAt) {
      log.debug(`Could not extract downloadedAt from ${currentAudioFileName}, skipping cleanup`);
      return;
    }
    
    // List all transcript files for this podcast
    const transcriptDirKey = path.join(TRANSCRIPTS_DIR_PREFIX, podcastName);
    
    try {
      const allTranscriptFiles = await listFiles(transcriptDirKey);
      let cleanedCount = 0;
      
      for (const transcriptFile of allTranscriptFiles) {
        if (!transcriptFile.endsWith('.srt')) continue;
        
        const transcriptFileName = path.basename(transcriptFile, '.srt');
        
        // Skip if this is the current file we're processing
        if (transcriptFileName === currentAudioFileName) continue;
        
        try {
          // Check if this transcript has downloadedAt timestamp
          if (!hasDownloadedAtTimestamp(transcriptFileName)) continue;
          
          const transcriptParsed = parseFileKey(transcriptFileName);
          
          // Check if this is the same episode (same date and base title)
          if (transcriptParsed.date === currentParsed.date && 
              transcriptParsed.title === currentParsed.title) {
            
            const transcriptDownloadedAt = transcriptParsed.downloadedAt;
            
            if (transcriptDownloadedAt && transcriptDownloadedAt < currentDownloadedAt) {
              // This is an older version of the same episode, delete it
              try {
                await deleteFile(transcriptFile);
                log.info(`✅ Deleted older transcript version: ${transcriptFile}`);
                cleanedCount++;
              } catch (deleteError) {
                log.error(`Error deleting older transcript ${transcriptFile}:`, deleteError);
                // Continue with other files even if one fails
              }
            }
          }
        } catch (parseError) {
          log.debug(`Could not parse transcript filename ${transcriptFileName}:`, parseError);
          continue;
        }
      }
      
      if (cleanedCount > 0) {
        log.info(`Cleaned up ${cleanedCount} older transcript versions for ${currentAudioFileName}`);
      } else {
        log.debug(`No older transcript versions found for ${currentAudioFileName}`);
      }
      
    } catch (listError) {
      log.debug(`Could not list transcript files in ${transcriptDirKey}:`, listError);
    }
    
  } catch (error) {
    log.error(`Error cleaning up older transcript versions for ${currentAudioFileKey}:`, error);
    // Don't throw - this is not critical enough to stop processing
  }
}

// Helper function to process a single audio file
async function processAudioFile(fileKey: string, whisperPrompt: string, siteId: string): Promise<ApplyCorrectionsResult | null> {
  const podcastName = path.basename(path.dirname(fileKey));
  const transcriptDirKey = path.join(TRANSCRIPTS_DIR_PREFIX, podcastName);
  const audioFileName = path.basename(fileKey, '.mp3');

  // Check if transcription already exists (before adding to lockfile)
  const transcriptKey = path.join(transcriptDirKey, `${audioFileName}.srt`);
  if (await transcriptExists(fileKey)) {
    log.debug(`Transcript already exists for ${fileKey}, skipping`);
    return null;
  }

  // Check if a newer version of this audio file exists (skip processing older versions)
  if (await hasNewerAudioVersion(fileKey)) {
    log.info(`Skipping processing of ${fileKey} because a newer version exists`);
    return null;
  }

  // Try to add to lockfile - if it fails, another process is working on this file
  const lockAcquired = await addToLockfile(fileKey);
  if (!lockAcquired) {
    log.debug(`Could not acquire lock for ${fileKey}, another process is working on it`);
    return null;
  }

  try {
    // Ensure transcript directory exists
    await createDirectory(transcriptDirKey);

    // Double-check if transcription exists (race condition protection)
    if (await transcriptExists(fileKey)) {
      log.debug(`Transcript already exists for ${fileKey} (detected after lock), skipping`);
      return null;
    }

    // Clean up older transcript versions for this episode
    await cleanupOlderTranscriptVersions(fileKey);

    // Get file size and duration
    const fileSizeMB = await getFileSizeMB(fileKey);
    const durationMinutes = await getAudioDurationMinutes(fileKey);

    let chunks: TranscriptionChunk[] = [];
    const needsChunking = fileSizeMB > MAX_FILE_SIZE_MB || durationMinutes > MAX_DURATION_MINUTES;
    
    if (needsChunking) {
      const reasons: string[] = [];
      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        reasons.push(`too large (${fileSizeMB.toFixed(2)}MB > ${MAX_FILE_SIZE_MB}MB)`);
      }
      if (durationMinutes > MAX_DURATION_MINUTES) {
        reasons.push(`too long (${durationMinutes.toFixed(2)} min > ${MAX_DURATION_MINUTES} min)`);
      }
      
      log.info(`File ${fileKey} is ${reasons.join(' and ')}. Splitting into chunks...`);
      chunks = await splitAudioFile(fileKey, fileSizeMB, PROCESS_ID);
    } else {
      // For small files, prepare them for processing
      log.info(`File ${fileKey} is ${fileSizeMB.toFixed(2)}MB and ${durationMinutes.toFixed(2)} minutes - processing as single chunk`);
      const { filePath } = await prepareAudioFile(fileKey, PROCESS_ID);

      chunks = [{
        startTime: 0,
        endTime: 0, // Will be determined by ffprobe
        filePath: filePath
      }];
    }

    // Transcribe each chunk
    const srtChunks: string[] = [];
    for (const chunk of chunks) {
      log.info(`Transcribing chunk: ${chunk.filePath}`);
      const srtContent = await transcribeViaWhisper({
        filePath: chunk.filePath,
        whisperApiProvider: WHISPER_API_PROVIDER,
        responseFormat: 'srt',
        prompt: whisperPrompt
      });
      srtChunks.push(srtContent);
      // Clean up the individual chunk file
      await fs.remove(chunk.filePath);
      log.info(`Transcription complete for chunk: ${chunk.filePath}. SRT saved.`);
    }

    // Combine SRT files
    const finalSrt = chunks.length > 1 ? combineSrtFiles(srtChunks, chunks) : srtChunks[0];

    // TODO: Remove this logging after debugging
    log.info(`Combined SRT files: ${srtChunks.length}`);

    // Save the combined SRT file to S3
    await saveFile(transcriptKey, Buffer.from(finalSrt));

    log.info(
      `\n✅ Transcription complete for ${fileKey}.` +
      `\n💾 SRT saved to ${transcriptKey}\n`
    );

    // Clean up the process-specific temporary directory
    const processSpecificTempDir = path.join('/tmp', PROCESS_ID);
    if (await fs.pathExists(processSpecificTempDir)) {
      await fs.remove(processSpecificTempDir);
      log.debug(`Cleaned up process-specific temporary directory: ${processSpecificTempDir}`);
    }

    // Apply spelling corrections
    const s3FileOperations = {
      getFileContent: async (filePath: string): Promise<string> => {
        const buffer = await getFile(filePath);
        return buffer.toString('utf-8');
      },
      saveFileContent: async (filePath: string, content: string): Promise<void> => {
        await saveFile(filePath, Buffer.from(content, 'utf-8'));
      }
    };

    const correctionResult = await applyCorrectionToFile(
      transcriptKey,
      siteId,
      s3FileOperations.getFileContent,
      s3FileOperations.saveFileContent
    );

    if (correctionResult.totalCorrections > 0) {
      log.debug(`Applied ${correctionResult.totalCorrections} spelling corrections to ${transcriptKey}`);
    }

    return correctionResult;
  } catch (error) {
    log.error(`Error processing ${fileKey}:`, error);
    throw error;
  } finally {
    // Always remove from lockfile, even if processing failed
    await removeFromLockfile(fileKey);
  }
}

/**
 * Main Lambda handler function.
 * This function processes new audio files by transcribing them using Whisper.
 * 
 * When running, we'll scan S3 for all audio files in the `audio/` directory, and process any new ones.
 */
export async function handler(): Promise<void> {
  log.info(`🟢 Starting process-new-audio-files-via-whisper > handler, with logging level: ${log.getLevel()}`);
  const lambdaStartTime = Date.now();
  log.info('⏱️ Starting at', new Date().toISOString());
  log.info(`🤫  Whisper API Provider: ${WHISPER_API_PROVIDER}`);
  log.info(`🔒 Process ID: ${PROCESS_ID}`);

  // Get the current site ID and configuration
  const siteId = process.env.SITE_ID;
  if (!siteId) {
    throw new Error('SITE_ID environment variable is required');
  }
  
  const siteConfig = getSiteById(siteId);
  if (!siteConfig) {
    throw new Error(`Site configuration not found for site ID: ${siteId}`);
  }
  
  if (!siteConfig.whisperTranscriptionPrompt) {
    throw new Error(`whisperTranscriptionPrompt is required in site configuration for site: ${siteId}`);
  }
  
  const whisperPrompt = siteConfig.whisperTranscriptionPrompt;
  log.info(`🎙️  Using site-specific Whisper prompt for ${siteId}: "${whisperPrompt.substring(0, 50)}..."`);

  // Clean up stale lockfile entries from previous runs
  await cleanupStaleEntries();

  // Clean up any stale process-specific temp directories
  await cleanupStaleProcessDirectories();

  let newTranscriptsCreated = false;

  const stats = {
    totalFiles: 0,
    skippedFiles: 0,
    processedFiles: 0,
    podcastStats: new Map<string, { total: number; skipped: number; processed: number; sizeBytes: number }>()
  };

  let filesToProcess: string[] = [];
  const spellingCorrectionResults: ApplyCorrectionsResult[] = [];
  let totalBytesProcessed = 0;
  let incompletedTranscripts = 0;

  // Setup SIGINT handler for graceful exit logging
  const logSummaryAndExit = () => {
    const totalLambdaTime = (Date.now() - lambdaStartTime) / 1000;
    const totalSizeMB = totalBytesProcessed / (1024 * 1024);
    const secondsPer10MB = totalSizeMB > 0 ? (totalLambdaTime / totalSizeMB) * 10 : 0;

    log.info('\n⚠️  Process interrupted with CTRL+C');
    log.info('\n📊 Transcription Process Summary (Interrupted):');
    log.info(`\n⏱️  Total Duration: ${totalLambdaTime.toFixed(2)} seconds`);
    log.info(`\n📁 Total Files Found: ${stats.totalFiles}`);
    log.info(`✅ Successfully Processed: ${stats.processedFiles}`);
    log.info(`⏭️  Skipped (Already Transcribed): ${stats.skippedFiles}`);
    if (incompletedTranscripts > 0) {
      log.info(`⚠️  Incompleted Transcripts: ${incompletedTranscripts}`);
    }
    log.info(`📦 Total Size Processed: ${totalSizeMB.toFixed(2)} MB`);
    if (totalSizeMB > 0) {
      log.info(`⏱️  Processing Speed: ${secondsPer10MB.toFixed(2)} seconds per 10 MB`);
    }
    
    log.info('\n📂 Breakdown by Podcast:');
    for (const [podcast, podcastStats] of stats.podcastStats) {
      const podcastSizeMB = podcastStats.sizeBytes / (1024 * 1024);
      const podcastSizeDisplay = podcastSizeMB >= 1024
        ? `${(podcastSizeMB / 1024).toFixed(2)} GB`
        : `${podcastSizeMB.toFixed(2)} MB`;

      log.info(`\n🎙️  ${podcast}:`);
      log.info(`   📁 Total Files: ${podcastStats.total}`);
      log.info(`   📦 Total Size: ${podcastSizeDisplay}`);
      log.info(`   ✅ Processed: ${podcastStats.processed}`);
      log.info(`   ⏭️  Skipped: ${podcastStats.skipped}`);
    }

    log.info('\n❌ Process terminated by user.');
    process.exit(130);
  };

  process.on('SIGINT', logSummaryAndExit);

  log.info('Scanning S3 for audio files.');
  const allPodcastDirs = await listDirectories(AUDIO_DIR_PREFIX);
  log.info(`Found podcast directories: ${allPodcastDirs.join(', ')}`);

  // Process each podcast directory
  for (const podcastDir of allPodcastDirs) {
    log.info(`Processing podcast directory: ${podcastDir}`);

    if (!podcastDir || podcastDir.endsWith('.DS_Store')) continue; // Skip empty, undefined, or .DS_Store directories

    // Get all MP3 files in this podcast directory
    const mp3Files = await getMp3Files(podcastDir);
    filesToProcess.push(...mp3Files);

    // Get total size for this podcast directory
    const podcastName = path.basename(podcastDir);
    const dirSize = await getDirectorySize(podcastDir);

    // Initialize podcast stats
    stats.podcastStats.set(podcastName, {
      total: mp3Files.length,
      skipped: 0,
      processed: 0,
      sizeBytes: dirSize
    });

    stats.totalFiles += mp3Files.length;

    // TODO: Remove this logging after debugging
    log.info(`Found ${mp3Files.length} MP3 files to process in ${podcastDir}`);
  }
  log.info(`Found ${filesToProcess.length} MP3 files to process across all directories.`);

  // Filter files for multi-terminal processing
  if (process.env.TERMINAL_FILE_LIST_PATH || process.env.TERMINAL_FILE_LIST) {
    let terminalFiles: string[] = [];
    
    // Read from file if TERMINAL_FILE_LIST_PATH is provided (new approach)
    if (process.env.TERMINAL_FILE_LIST_PATH) {
      try {
        const fileContent = fs.readFileSync(process.env.TERMINAL_FILE_LIST_PATH, 'utf8');
        terminalFiles = fileContent.split('\n').map(f => f.trim()).filter(f => f.length > 0);
        log.info(`📄 Successfully read ${terminalFiles.length} files from ${process.env.TERMINAL_FILE_LIST_PATH}`);
      } catch (error) {
        log.error(`Failed to read terminal file list from ${process.env.TERMINAL_FILE_LIST_PATH}: ${error}`);
        process.exit(1);
      }
    }
    // Fallback to environment variable (legacy approach)
    else if (process.env.TERMINAL_FILE_LIST) {
      terminalFiles = process.env.TERMINAL_FILE_LIST.split(',').map(f => f.trim());
    }
    
    const terminalIndex = process.env.TERMINAL_INDEX ? parseInt(process.env.TERMINAL_INDEX) : 0;
    const totalTerminals = process.env.TOTAL_TERMINALS ? parseInt(process.env.TOTAL_TERMINALS) : 1;
    
    log.info(`🖥️  Multi-terminal mode: Terminal ${terminalIndex + 1}/${totalTerminals}`);
    log.info(`📂 Assigned ${terminalFiles.length} specific files to process`);
    
    // Filter to only process files assigned to this terminal
    const originalCount = filesToProcess.length;
    filesToProcess = filesToProcess.filter(filePath => {
      const fileName = path.basename(filePath);
      return terminalFiles.includes(fileName);
    });
    
    log.info(`🎯 Filtered from ${originalCount} to ${filesToProcess.length} files for this terminal`);
    
    // Update stats to reflect filtered files
    stats.totalFiles = filesToProcess.length;
    stats.podcastStats.clear();
    for (const fileKey of filesToProcess) {
      const podcastName = path.basename(path.dirname(fileKey));
      if (!stats.podcastStats.has(podcastName)) {
        stats.podcastStats.set(podcastName, { total: 0, skipped: 0, processed: 0, sizeBytes: 0 });
      }
      stats.podcastStats.get(podcastName)!.total++;
    }
  }

  // Calculate total duration of untranscribed files for progress tracking
  let totalMinutesToProcess = 0;
  
  
  // If this is part of a multi-terminal session, get the total from environment
  if (process.env.TERMINAL_TOTAL_MINUTES) {
    totalMinutesToProcess = parseFloat(process.env.TERMINAL_TOTAL_MINUTES);
  } else {
    // Calculate total duration for files that need transcription
    for (const fileKey of filesToProcess) {
      if (!(await transcriptExists(fileKey))) {
        try {
          const durationMinutes = await getAudioDurationMinutes(fileKey);
          totalMinutesToProcess += durationMinutes;
        } catch (error) {
          log.warn(`Could not get duration for ${fileKey}: ${error}`);
        }
      }
    }
  }

  // Log structured START event for multi-terminal progress tracking
  logProgress('START', `Starting transcription of ${filesToProcess.length} files`, {
    totalFiles: filesToProcess.length,
    completedFiles: 0,
    totalMinutes: totalMinutesToProcess,
    completedMinutes: 0,
    percentComplete: 0
  });

  // Update podcast stats
  for (const fileKey of filesToProcess) {
    const podcastName = path.basename(path.dirname(fileKey));
    if (!stats.podcastStats.has(podcastName)) {
      stats.podcastStats.set(podcastName, { total: 0, skipped: 0, processed: 0, sizeBytes: 0 });
    }
    stats.podcastStats.get(podcastName)!.total++;
  }

  // Debug feature: only process specific file if DEBUG_SINGLE_FILE is set
  const debugSingleFile = process.env.DEBUG_SINGLE_FILE;
  if (debugSingleFile) {
    const debugFile = filesToProcess.find(f => path.basename(f).includes(debugSingleFile));
    if (debugFile) {
      log.info(`🐛 DEBUG MODE: Only processing file matching "${debugSingleFile}": ${debugFile}`);
      filesToProcess = [debugFile];
      stats.totalFiles = 1;
      stats.podcastStats.clear();
      const podcastName = path.basename(path.dirname(debugFile));
      const fileSizeMB = await getFileSizeMB(debugFile);
      stats.podcastStats.set(podcastName, { total: 1, skipped: 0, processed: 0, sizeBytes: fileSizeMB * 1024 * 1024 });
    } else {
      log.warn(`🐛 DEBUG MODE: No file found matching "${debugSingleFile}". Available files:`);
      filesToProcess.slice(0, 10).forEach(f => log.warn(`   - ${path.basename(f)}`));
      if (filesToProcess.length > 10) log.warn(`   ... and ${filesToProcess.length - 10} more files`);
      return;
    }
  }

  if (filesToProcess.length === 0) {
    log.info("No audio files found to process.");
    return;
  }

  // Initialize progress tracking for 10% interval logging
  const totalFiles = filesToProcess.length;
  let processedCount = 0;
  const progressIntervals = Array.from({length: 10}, (_, i) => Math.floor((totalFiles * (i + 1)) / 10));
  let nextProgressIndex = 0;

  for (const fileKey of filesToProcess) {
    try {
      processedCount++;
      log.debug(`🔍 Processing file: ${fileKey}`);
      
      // Log progress at 10% intervals
      if (nextProgressIndex < progressIntervals.length && processedCount >= progressIntervals[nextProgressIndex]) {
        const progressPercent = ((nextProgressIndex + 1) * 10);
        log.info(`📈 Progress: ${progressPercent}% complete (${processedCount}/${totalFiles} files processed)`);
        nextProgressIndex++;
      }
      
      const podcastName = path.basename(path.dirname(fileKey));

      // Check if transcription exists
      if (await transcriptExists(fileKey)) {
        stats.skippedFiles++;
        stats.podcastStats.get(podcastName)!.skipped++;
        log.debug(`⏭️  Transcript already exists for ${fileKey}, skipping`);
        continue;
      }
      log.info(`✅ No existing transcript found for ${path.basename(fileKey)}`);

      // Check if file is being processed
      log.info(`🔒 Checking if file is being processed by another instance`);
      if (await isFileBeingProcessed(fileKey)) {
        log.info(`🚫 File ${fileKey} is already being processed, skipping`);
        continue;
      }
      log.info(`✅ File is not being processed by another instance`);

      log.info(`🚀 Starting to process file: ${path.basename(fileKey)}`);

      // Track processing time and file size for individual file
      const fileStartTime = Date.now();
      const fileSizeMB = await getFileSizeMB(fileKey);
      const fileSizeBytes = fileSizeMB * 1024 * 1024;
      
      log.info(`📊 File size: ${fileSizeMB.toFixed(2)} MB`);
      
      // Increment incomplete transcripts counter before processing
      incompletedTranscripts++;
      
      const correctionResult = await processAudioFile(fileKey, whisperPrompt, siteId);
      
      // Calculate processing time for this file
      const fileProcessingTime = (Date.now() - fileStartTime) / 1000;
      const secondsPer10MB = fileSizeMB > 0 ? (fileProcessingTime / fileSizeMB) * 10 : 0;
      
      // Log individual file processing stats
      log.info(
        `\n⏱️  File Processing Stats for ${path.basename(fileKey)}:` +
        `\n   📁 Size: ${fileSizeMB.toFixed(2)} MB` +
        `\n   ⏱️  Time: ${fileProcessingTime.toFixed(2)} seconds` +
        `\n   🚀 Speed: ${secondsPer10MB.toFixed(2)} seconds per 10 MB\n`
      );
      
      stats.processedFiles++;
      stats.podcastStats.get(podcastName)!.processed++;
      newTranscriptsCreated = true;
      totalBytesProcessed += fileSizeBytes;
      
      // Decrement incomplete transcripts counter after successful processing
      incompletedTranscripts--;
      
      // Calculate completed duration for progress tracking
      let _completedMinutes = 0;
      try {
        const currentFileDuration = await getAudioDurationMinutes(fileKey);
        _completedMinutes = currentFileDuration;
        
        // If we have access to all processed files, calculate total completed duration
        // For now, we'll use an approximation based on completed file count
        const avgDurationPerFile = totalMinutesToProcess / filesToProcess.length;
        const totalCompletedMinutes = stats.processedFiles * avgDurationPerFile;
        const percentComplete = totalMinutesToProcess > 0 ? (totalCompletedMinutes / totalMinutesToProcess) * 100 : 0;
        
        // Log structured PROGRESS event
        logProgress('PROGRESS', `Completed transcription of ${path.basename(fileKey)}`, {
          totalFiles: filesToProcess.length,
          completedFiles: stats.processedFiles,
          totalMinutes: totalMinutesToProcess,
          completedMinutes: totalCompletedMinutes,
          percentComplete,
          currentFile: path.basename(fileKey)
        });
      } catch (error) {
        log.warn(`Could not calculate progress for ${fileKey}: ${error}`);
      }
      
      // Collect spelling correction results
      if (correctionResult) {
        spellingCorrectionResults.push(correctionResult);
      }
    } catch (error) {
      log.error(`Error processing file ${fileKey}:`, error);
      // If processing failed, we still decrement the incomplete counter
      // since we're not going to retry this file in this run
      if (incompletedTranscripts > 0) {
        incompletedTranscripts--;
      }
      // Continue with next file even if one fails (original behavior)
    }
  }

  const totalLambdaTime = (Date.now() - lambdaStartTime) / 1000; // Convert to seconds
  const totalSizeMB = totalBytesProcessed / (1024 * 1024);
  const secondsPer10MB = totalSizeMB > 0 ? (totalLambdaTime / totalSizeMB) * 10 : 0;

  // Remove SIGINT handler since we're completing normally
  process.removeListener('SIGINT', logSummaryAndExit);

  // Log summary with emojis and formatting
  log.info('\n📊 Transcription Process Summary:');
  log.info(`\n⏱️  Total Duration: ${totalLambdaTime.toFixed(2)} seconds`);
  log.info(`\n📁 Total Files Found: ${stats.totalFiles}`);
  log.info(`✅ Successfully Processed: ${stats.processedFiles}`);
  log.info(`⏭️  Skipped (Already Transcribed): ${stats.skippedFiles}`);
  log.info(`📦 Total Size Processed: ${totalSizeMB.toFixed(2)} MB`);
  if (totalSizeMB > 0) {
    log.info(`⏱️  Processing Speed: ${secondsPer10MB.toFixed(2)} seconds per 10 MB`);
  }

  log.info('\n📂 Breakdown by Podcast:');
  for (const [podcast, podcastStats] of stats.podcastStats) {
    const podcastSizeMB = podcastStats.sizeBytes / (1024 * 1024);
    const podcastSizeDisplay = podcastSizeMB >= 1024
      ? `${(podcastSizeMB / 1024).toFixed(2)} GB`
      : `${podcastSizeMB.toFixed(2)} MB`;

    log.info(`\n🎙️  ${podcast}:`);
    log.info(`   📁 Total Files: ${podcastStats.total}`);
    log.info(`   📦 Total Size: ${podcastSizeDisplay}`);
    log.info(`   ✅ Processed: ${podcastStats.processed}`);
    log.info(`   ⏭️  Skipped: ${podcastStats.skipped}`);
  }

  // Log spelling corrections summary
  if (spellingCorrectionResults.length > 0) {
    const aggregatedCorrections = aggregateCorrectionResults(spellingCorrectionResults);
    const totalCorrections = aggregatedCorrections.reduce((sum, result) => sum + result.correctionsApplied, 0);

    if (totalCorrections > 0) {
      log.info('\n🔤 Spelling Corrections Applied:');
      log.info(`📝 Total Corrections: ${totalCorrections}`);
      aggregatedCorrections
        .sort((a, b) => b.correctionsApplied - a.correctionsApplied)
        .forEach(result => {
          log.info(`   "${result.correctedSpelling}": ${result.correctionsApplied} corrections`);
        });
    }
  }

  log.info('\n✨ Transcription process finished.');

  // Log structured COMPLETE event for multi-terminal progress tracking
  logProgress('COMPLETE', `Transcription completed: ${stats.processedFiles} files processed`, {
    totalFiles: filesToProcess.length,
    completedFiles: stats.processedFiles,
    totalMinutes: totalMinutesToProcess,
    completedMinutes: totalMinutesToProcess, // All processing is complete
    percentComplete: 100
  });

  // Clean up any remaining process-specific temporary files
  const processSpecificTempDir = path.join('/tmp', PROCESS_ID);
  if (await fs.pathExists(processSpecificTempDir)) {
    await fs.remove(processSpecificTempDir);
    log.debug(`Final cleanup of process-specific temporary directory: ${processSpecificTempDir}`);
  }

  // If new transcripts were created, invoke the indexing Lambda (only when running in AWS Lambda)
  if (newTranscriptsCreated) {
    if (isRunningInLambda()) {
      log.info(`New transcripts were created. Invoking ${INDEXING_LAMBDA_NAME}...`);
      try {
        const command = new InvokeCommand({
          FunctionName: INDEXING_LAMBDA_NAME,
          InvocationType: 'Event', // Asynchronous invocation
        });
        await LAMBDA_CLIENT.send(command);
        log.info(`${INDEXING_LAMBDA_NAME} invoked successfully.`);
      } catch (error) {
        log.error(`Error invoking ${INDEXING_LAMBDA_NAME}:`, error);
      }
    } else {
      log.info(`New transcripts were created, but skipping ${INDEXING_LAMBDA_NAME} invocation (running locally).`);
    }
  } else {
    log.info('No new transcripts were created. Indexing Lambda will not be invoked.');
  }
}

// Run the handler if this file is executed directly
// In ES modules, this is the standard way to detect if a file is being run directly
const scriptPath = path.resolve(process.argv[1]);
if (import.meta.url === `file://${scriptPath}`) {
  log.info('Starting audio processing via Whisper directly...');
  
  handler()
    .then(() => {
      log.info('Processing completed successfully (direct run)');
      process.exit(0);
    })
    .catch(error => {
      log.error('Processing failed (direct run):', error);
      process.exit(1);
    });
}
