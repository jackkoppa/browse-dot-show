import * as path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import { log } from '@browse-dot-show/logging';
import { getFile } from '@browse-dot-show/s3';

// Constants
const CHUNK_DURATION_MINUTES = 10; // Approximate chunk size to stay under 25MB

// Types
export interface TranscriptionChunk {
  startTime: number;
  endTime: number;
  filePath: string;
}

export interface FfprobeMetadata {
  format: {
    duration?: number;
  };
}

/**
 * Get the appropriate binary paths for the current environment
 * In Lambda with layers, binaries are in /opt/bin/
 * In local development, they're in the system PATH
 */
function getBinaryPaths(): { ffmpeg: string; ffprobe: string } {
  const isLambda = process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;

  if (isLambda) {
    return {
      ffmpeg: '/opt/bin/ffmpeg',
      ffprobe: '/opt/bin/ffprobe'
    };
  } else {
    return {
      ffmpeg: 'ffmpeg',
      ffprobe: 'ffprobe'
    };
  }
}

/**
 * Check if ffmpeg is available on the system
 * Throws an error with installation instructions if not available
 */
export async function checkFfmpegAvailability(): Promise<void> {
  const { ffmpeg } = getBinaryPaths();

  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn(ffmpeg, ['-version']);

    ffmpegProcess.on('error', (error) => {
      const errorMessage = `
❌ FFmpeg not found on system.

For local development:
  - macOS: brew install ffmpeg
  - Ubuntu/Debian: sudo apt update && sudo apt install ffmpeg
  - Windows: Download from https://ffmpeg.org/download.html

For Lambda deployment:
  - Ensure ffmpeg Lambda Layer is properly configured in Terraform
  - Check terraform/lambda-layers/README.md for setup instructions

Original error: ${error.message}
      `.trim();

      reject(new Error(errorMessage));
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg check failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Get audio file metadata using ffprobe
 */
export async function getAudioMetadata(filePath: string, timeoutMs: number = 10000): Promise<FfprobeMetadata> {
  await checkFfmpegAvailability();
  const { ffprobe } = getBinaryPaths();

  return new Promise((resolve, reject) => {
    const ffprobeProcess = spawn(ffprobe, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath
    ]);

    let stdout = '';
    let stderr = '';

    // Set up timeout
    const timeout = setTimeout(() => {
      log.warn(`ffprobe process timed out after ${timeoutMs}ms for file ${filePath}`);
      ffprobeProcess.kill('SIGKILL');
      reject(new Error(`ffprobe process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ffprobeProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobeProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobeProcess.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`ffprobe failed with exit code ${code}: ${stderr}`));
        return;
      }

      try {
        const metadata = JSON.parse(stdout);
        resolve(metadata);
      } catch (error) {
        reject(new Error(`Failed to parse ffprobe output: ${error}`));
      }
    });

    ffprobeProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`ffprobe spawn error: ${error.message}`));
    });
  });
}

/**
 * Split audio file into chunks using ffmpeg CLI
 */
export async function createAudioChunk(
  inputPath: string,
  outputPath: string,
  startTime: number,
  duration: number,
  timeoutMs: number = 30000 // 30 second timeout
): Promise<void> {
  await checkFfmpegAvailability();
  const { ffmpeg } = getBinaryPaths();

  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-c', 'copy', // Copy without re-encoding for speed
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+discardcorrupt', // Handle corrupted packets gracefully
      '-err_detect', 'ignore_err', // Ignore minor errors that might cause hangs
      outputPath
    ];

    log.debug(`Running ffmpeg command: ${ffmpeg} ${args.join(' ')}`);
    const startTime_ms = Date.now();

    const ffmpegProcess = spawn(ffmpeg, args);

    let stdout = '';
    let stderr = '';

    // Periodic progress logging
    const progressInterval = setInterval(() => {
      const elapsed = ((Date.now() - startTime_ms) / 1000).toFixed(1);
      log.debug(`ffmpeg still running for ${outputPath} (${elapsed}s elapsed)`);
    }, 10000); // Log every 10 seconds

    // Set up timeout
    const timeout = setTimeout(() => {
      clearInterval(progressInterval);
      const elapsed = ((Date.now() - startTime_ms) / 1000).toFixed(1);
      log.warn(`ffmpeg process timed out after ${timeoutMs}ms (${elapsed}s) for chunk ${outputPath}`);
      log.warn(`ffmpeg stdout during timeout: ${stdout}`);
      log.warn(`ffmpeg stderr during timeout: ${stderr}`);
      ffmpegProcess.kill('SIGKILL');
      reject(new Error(`ffmpeg process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ffmpegProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffmpegProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      // Log stderr in real-time for debugging hangs
      log.debug(`ffmpeg stderr: ${chunk.trim()}`);
    });

    ffmpegProcess.on('close', (code) => {
      clearTimeout(timeout);
      clearInterval(progressInterval);
      const elapsed = ((Date.now() - startTime_ms) / 1000).toFixed(1);
      
      if (code !== 0) {
        log.error(`ffmpeg failed with exit code ${code} after ${elapsed}s`);
        log.error(`ffmpeg stdout: ${stdout}`);
        log.error(`ffmpeg stderr: ${stderr}`);
        reject(new Error(`ffmpeg failed with exit code ${code}: ${stderr}`));
        return;
      }
      
      // Log successful completion with any warnings
      if (stderr.trim()) {
        log.debug(`ffmpeg completed successfully in ${elapsed}s but with stderr: ${stderr.trim()}`);
      } else {
        log.debug(`ffmpeg completed successfully in ${elapsed}s`);
      }
      
      resolve();
    });

    ffmpegProcess.on('error', (error) => {
      clearTimeout(timeout);
      clearInterval(progressInterval);
      reject(new Error(`ffmpeg spawn error: ${error.message}`));
    });
  });
}

/**
 * Split audio file into chunks for processing
 */
export async function splitAudioFile(fileKey: string, processId?: string): Promise<TranscriptionChunk[]> {
  log.info(`Splitting audio file: ${fileKey}`);

  // Create process-specific temp directory to avoid conflicts between parallel processes
  const processSpecificDir = processId || `process-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const tempDir = path.join('/tmp', processSpecificDir, path.dirname(fileKey));
  const tempFilePath = path.join('/tmp', processSpecificDir, fileKey);

  // Ensure the temp directory exists
  await fs.ensureDir(tempDir);

  // Download the file to the temp location
  const audioBuffer = await getFile(fileKey);

  await fs.writeFile(tempFilePath, audioBuffer);

  // Get audio metadata
  const metadata = await getAudioMetadata(tempFilePath);
  const duration = metadata.format.duration || 0;
  const chunkDuration = CHUNK_DURATION_MINUTES * 60;

  const chunks: TranscriptionChunk[] = [];
  let currentStart = 0;

  // Prepare chunk definitions
  while (currentStart < duration) {
    const endTime = Math.min(currentStart + chunkDuration, duration);
    const chunkPath = `${tempFilePath}.part${chunks.length + 1}.mp3`;

    chunks.push({
      startTime: currentStart,
      endTime: endTime,
      filePath: chunkPath
    });

    currentStart = endTime;
  }

  try {
    log.info(`Splitting audio file: ${fileKey}, into ${chunks.length} chunks`);
    
    // Process chunks sequentially to avoid resource exhaustion
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkDurationActual = chunk.endTime - chunk.startTime;
      
      log.debug(`Creating chunk ${i + 1}/${chunks.length}: ${chunk.filePath} (${chunk.startTime}s - ${chunk.endTime}s, duration: ${chunkDurationActual}s)`);
      
      try {
        await createAudioChunk(tempFilePath, chunk.filePath, chunk.startTime, chunkDurationActual);
        log.info(`Created chunk: ${chunk.filePath}`);
        
        // Small delay between chunks to prevent system overload
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        log.error(`Error creating chunk ${chunk.filePath} (chunk ${i + 1}/${chunks.length}):`, error);
        
        // Clean up any created chunks on error
        for (const createdChunk of chunks.slice(0, i + 1)) {
          try {
            await fs.remove(createdChunk.filePath);
          } catch (cleanupError) {
            log.warn(`Failed to clean up chunk ${createdChunk.filePath}:`, cleanupError);
          }
        }
        throw new Error(`Failed to create chunk ${i + 1}/${chunks.length} for ${fileKey}: ${error.message}`);
      }
    }
    
    log.info(`Completed splitting audio file: ${fileKey}, into ${chunks.length} chunks`);

    return chunks;
  } catch (error) {
    // Clean up any partial chunks on error
    for (const chunk of chunks) {
      try {
        await fs.remove(chunk.filePath);
      } catch (cleanupError) {
        log.warn(`Failed to clean up chunk ${chunk.filePath}:`, cleanupError);
      }
    }
    throw error;
  }
}

/**
 * Prepare audio file for processing (download to temp location)
 * Returns the local file path and metadata
 */
export async function prepareAudioFile(fileKey: string, processId?: string): Promise<{ filePath: string; metadata: FfprobeMetadata }> {
  // Create process-specific temp directory to avoid conflicts between parallel processes
  const processSpecificDir = processId || `process-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const tempDir = path.join('/tmp', processSpecificDir, path.dirname(fileKey));
  const tempFilePath = path.join('/tmp', processSpecificDir, fileKey);

  // Ensure the temp directory exists
  await fs.ensureDir(tempDir);

  // Download the file to the temp location
  const audioBuffer = await getFile(fileKey);
  await fs.writeFile(tempFilePath, audioBuffer);

  // Get metadata
  const metadata = await getAudioMetadata(tempFilePath);

  return {
    filePath: tempFilePath,
    metadata
  };
} 