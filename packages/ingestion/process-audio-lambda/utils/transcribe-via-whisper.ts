import fs from 'fs';
import OpenAI from 'openai';
import path from 'path';
import { spawn } from 'child_process';
import { log } from '@browse-dot-show/logging';

/**
 * `openai` has been confirmed to work
 * `replicate` partially works, but the response format likely needs tweaking
 * `local-whisper.cpp` has been confirmed to work - see README for setup details, to setup local whisper.cpp model
 */
export type WhisperApiProvider = 'openai' | 'replicate' | 'local-whisper.cpp';

/** For now, we only use .srt, and may try .json later. There are others we could add here as well; check OpenAI types for more. */
type ResponseFormat = 'srt' | 'json';

interface TranscribeOptions {
  /** The path to the audio file to transcribe */
  filePath: string;
  /** The API provider to use for transcription */
  whisperApiProvider: WhisperApiProvider;
  /** The prompt to provide to Whisper for improved transcription accuracy */
  prompt: string;
  /** The response format to request - defaults to SRT */
  responseFormat?: ResponseFormat;
  /** The Whisper model to use */
  model?: string;
  /** API key for the selected provider (if not using environment variables) */
  apiKey?: string;
  /** Path to whisper.cpp directory (if not using environment variables) */
  whisperCppPath?: string;
}

// Global variable to track current whisper process for cleanup
let currentWhisperProcess: any = null;

/**
 * Transcribes an audio file using either OpenAI or Replicate Whisper API
 * @param options Transcription options
 * @returns The transcription as a string in the requested format
 */
export async function transcribeViaWhisper(options: TranscribeOptions): Promise<string> {
  const {
    filePath,
    whisperApiProvider,
    prompt,
    responseFormat = 'srt',
    apiKey,
    whisperCppPath
  } = options;

  // Validate required parameters
  if (!prompt) {
    throw new Error('Prompt is required for transcription. Please provide a whisperTranscriptionPrompt.');
  }

  // Validate the file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const MAX_ATTEMPTS = 3;
  const BASE_TIMEOUT_MS = 120 * 1000; // 120 seconds for first attempt

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Calculate timeout: Increase with each attempt; max of MAX_ATTEMPTS * BASE_TIMEOUT_MS
      const currentTimeoutMs = BASE_TIMEOUT_MS * attempt;

      log.info(`Transcription attempt ${attempt}/${MAX_ATTEMPTS} for ${path.basename(filePath)} using ${whisperApiProvider}`);
      log.info(`⏱️  Timeout for this attempt: ${currentTimeoutMs / 1000} seconds`);

      // Log file details for debugging
      const fileStats = fs.statSync(filePath);
      log.info(`📁 File details: ${path.basename(filePath)}, Size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB, Modified: ${fileStats.mtime.toISOString()}`);

      // Create the transcription promise based on provider
      let transcriptionPromise: Promise<string>;

      switch (whisperApiProvider) {
        case 'openai':
          transcriptionPromise = transcribeWithOpenAI(filePath, responseFormat, prompt, apiKey);
          break;
        case 'replicate':
          transcriptionPromise = transcribeWithReplicate(filePath, apiKey);
          break;
        case 'local-whisper.cpp':
          transcriptionPromise = transcribeWithLocalWhisperCpp(filePath, responseFormat, prompt, whisperCppPath);
          break;
        default:
          throw new Error(`Unsupported API provider: ${whisperApiProvider}`);
      }

      // Create a timeout promise with proper process cleanup
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          // Kill the current whisper process immediately when timeout is reached
          if (currentWhisperProcess && !currentWhisperProcess.killed) {
            log.warn(`⏰ Timeout reached (${currentTimeoutMs / 1000}s), immediately killing whisper process PID ${currentWhisperProcess.pid}`);
            try {
              // Force kill immediately on timeout
              currentWhisperProcess.kill('SIGKILL');
              log.info(`🔪 Sent SIGKILL to PID ${currentWhisperProcess.pid} due to timeout`);
            } catch (killError) {
              log.error(`❌ Failed to kill process PID ${currentWhisperProcess.pid}: ${killError}`);
            }
          }
          reject(new Error(`Transcription timed out after ${currentTimeoutMs / 1000} seconds`));
        }, currentTimeoutMs);
      });

      // Race between timeout and transcription
      const transcriptionStartTime = Date.now();
      log.info(`🚀 Starting transcription for ${path.basename(filePath)} at ${new Date().toISOString()}`);

      const result = await Promise.race([transcriptionPromise, timeoutPromise]);

      // Clear timeout if transcription completed successfully
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const transcriptionDuration = (Date.now() - transcriptionStartTime) / 1000;
      log.info(`✅ Transcription attempt ${attempt} succeeded for ${path.basename(filePath)} in ${transcriptionDuration.toFixed(2)} seconds`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.warn(`❌ Transcription attempt ${attempt}/${MAX_ATTEMPTS} failed for ${path.basename(filePath)}: ${errorMessage}`);

      // If this was the last attempt, throw a detailed error
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Transcription failed after ${MAX_ATTEMPTS} attempts for file: ${filePath}\n` +
          `Provider: ${whisperApiProvider}\n` +
          `Response format: ${responseFormat}\n` +
          `Last error: ${errorMessage}\n` +
          `File size: ${fs.statSync(filePath).size} bytes`
        );
      }

      // Wait a bit before retrying (exponential backoff)
      if (attempt < MAX_ATTEMPTS) {
        const retryDelay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s...
        log.info(`⏳ Waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // This should never be reached due to the throw above, but TypeScript needs it
  throw new Error('Unexpected error in transcription retry loop');
}

/**
 * Transcribes using OpenAI's Whisper API
 */
async function transcribeWithOpenAI(
  filePath: string,
  responseFormat: ResponseFormat,
  prompt: string,
  apiKey?: string
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  // Default for OpenAI usage
  const model = 'whisper-1';

  // CURSOR-TODO: It looks like we're getting some timeout/disconnect errors here. Help me add up to 2 additional retries here, if taking longer than 60 seconds.
  // Then if the 3rd retry fails, throw an error here.
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model,
    response_format: responseFormat,
    prompt: prompt
  });

  // Handle the return type correctly based on OpenAI API
  return transcription as unknown as string;
}

/**
 * Transcribes using Replicate's Whisper API
 */
async function transcribeWithReplicate(
  filePath: string,
  apiKey?: string
): Promise<string> {
  // Replicate API requires a token either from params or environment variable
  const token = apiKey || process.env.REPLICATE_API_KEY;

  if (!token) {
    throw new Error('REPLICATE_API_KEY is required for Replicate API');
  }

  // Read the file as base64
  const fileBuffer = fs.readFileSync(filePath);
  const base64Audio = fileBuffer.toString('base64');

  // Call Replicate API
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // TODO: Determine when/if this version needs to be updated
      version: "8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e",
      input: {
        audio: `data:audio/mp3;base64,${base64Audio}`,
        // Default to SRT format for consistency with OpenAI
        output_format: "srt"
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Replicate API error: ${response.status} ${errorText}`);
  }

  const prediction = await response.json() as any;

  // If the prediction is not complete, we need to poll for the result
  if (prediction.status === 'starting' || prediction.status === 'processing') {
    return await pollReplicateResult(prediction.id, token);
  }

  return prediction.output || '';
}

/**
 * Transcribes using locally installed whisper.cpp
 */
async function transcribeWithLocalWhisperCpp(
  filePath: string,
  responseFormat: string,
  prompt: string,
  whisperCppPath?: string
): Promise<string> {
  /**
   * Run whisper command using spawn to avoid shell interpretation issues
   */
  function runWhisperCommand(whisperCliBin: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      log.info(`🎯 Starting whisper command: ${whisperCliBin} ${args.join(' ')}`);
      log.info(`📂 Working directory: ${cwd}`);

      const child = spawn(whisperCliBin, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let isResolved = false;

      // Progress logging every 10 seconds
      const progressInterval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        log.info(`⏱️  Whisper process still running after ${elapsed}s for PID ${child.pid}`);
      }, 10000);

      // Cleanup function
      const cleanup = () => {
        if (progressInterval) {
          clearInterval(progressInterval);
        }
        if (child && !child.killed) {
          log.warn(`🔪 Forcefully killing whisper process PID ${child.pid}`);
          try {
            // Try SIGTERM first
            child.kill('SIGTERM');
            // Wait a moment then force kill
            setTimeout(() => {
              if (child && !child.killed) {
                log.warn(`🔪 Process ${child.pid} didn't respond to SIGTERM, using SIGKILL`);
                child.kill('SIGKILL');
              }
            }, 2000);
          } catch (killError) {
            log.error(`❌ Failed to kill process PID ${child.pid}: ${killError}`);
            // Try SIGKILL as last resort
            try {
              child.kill('SIGKILL');
            } catch (forceKillError) {
              log.error(`❌ Failed to force kill process PID ${child.pid}: ${forceKillError}`);
            }
          }
        }
        // Clear global process reference
        if (currentWhisperProcess === child) {
          currentWhisperProcess = null;
        }
      };

      child.stdout?.on('data', (data) => {
        const dataStr = data.toString();
        stdout += dataStr;

        // Log any output from whisper for debugging
        if (dataStr.trim()) {
          log.debug(`📝 Whisper stdout: ${dataStr.trim()}`);
        }
      });

      child.stderr?.on('data', (data) => {
        const dataStr = data.toString();
        stderr += dataStr;

        // Log whisper stderr output which often contains progress info
        if (dataStr.trim()) {
          log.debug(`🔍 Whisper stderr: ${dataStr.trim()}`);
        }
      });

      child.on('close', (code) => {
        if (isResolved) return;
        isResolved = true;

        cleanup();
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

        if (code === 0) {
          log.info(`✅ Whisper command completed successfully in ${totalTime}s`);
          resolve({ stdout, stderr });
        } else {
          log.error(`❌ Whisper command failed with exit code ${code} after ${totalTime}s`);
          log.error(`Final stdout: ${stdout}`);
          log.error(`Final stderr: ${stderr}`);
          reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        if (isResolved) return;
        isResolved = true;

        cleanup();
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        log.error(`💥 Whisper process error after ${totalTime}s: ${error.message}`);
        reject(error);
      });

      child.on('spawn', () => {
        log.info(`🚀 Whisper process spawned with PID: ${child.pid}`);
        // Track this process globally for timeout cleanup
        currentWhisperProcess = child;
      });

      // Store child reference for external cleanup if needed
      (runWhisperCommand as any).currentChild = child;

      // Clean up any previous child reference
      (runWhisperCommand as any).previousChild = (runWhisperCommand as any).currentChild;
    });
  }

  const whisperCPPModel = process.env.WHISPER_CPP_MODEL;

  // Get whisper.cpp directory from options or environment variable
  const whisperDir = whisperCppPath || process.env.WHISPER_CPP_PATH;

  log.info(`🔧 Whisper.cpp configuration:`);
  log.info(`   Model: ${whisperCPPModel}`);
  log.info(`   Directory: ${whisperDir}`);

  if (!whisperDir) {
    throw new Error('WHISPER_CPP_PATH environment variable or whisperCppPath option is required for local-whisper.cpp');
  }

  // Validate whisper.cpp directory exists
  if (!fs.existsSync(whisperDir)) {
    throw new Error(`whisper.cpp directory not found at: ${whisperDir}`);
  }

  // Path to the whisper-cli executable
  const whisperCliBin = path.join(whisperDir, 'build/bin/whisper-cli');

  // Validate whisper-cli executable exists
  if (!fs.existsSync(whisperCliBin)) {
    throw new Error(`whisper-cli executable not found at: ${whisperCliBin}. Make sure whisper.cpp is compiled.`);
  }

  const whisperModel = `ggml-${whisperCPPModel}.bin`
  const modelPath = path.join(whisperDir, 'models', whisperModel);

  // Validate model exists
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Whisper model not found at: ${modelPath}`);
  }

  log.info(`   Executable: ${whisperCliBin}`);
  log.info(`   Model path: ${modelPath}`);

  // Create temporary output file for transcription
  const tempOutputDir = path.dirname(filePath);

  const tempOutputFile = path.join(tempOutputDir, `${path.basename(filePath, path.extname(filePath))}`);
  const tempOutputFileWithExtension = `${tempOutputFile}.${responseFormat}`;
  // Determine output format flag
  let formatFlag = '';
  switch (responseFormat) {
    case 'srt':
      formatFlag = '--output-srt';
      break;
    case 'vtt':
      formatFlag = '--output-vtt';
      break;
    case 'json':
      formatFlag = '--output-json';
      break;
    case 'text':
    default:
      formatFlag = '--output-txt';
      break;
  }

  try {
    // Log input file information
    const inputFileStats = fs.statSync(filePath);
    log.info(`📁 Input file: ${path.basename(filePath)}`);
    log.info(`   Size: ${(inputFileStats.size / 1024 / 1024).toFixed(2)} MB`);
    log.info(`   Path: ${filePath}`);
    log.info(`   Output will be: ${tempOutputFileWithExtension}`);

    // Run whisper.cpp command using spawn to avoid shell interpretation issues with special characters
    const args = [
      '-m', modelPath,
      '-f', filePath,
      formatFlag,
      '-of', tempOutputFile,
      '--prompt', prompt
    ];

    log.info(`🎯 About to run whisper command with args: ${JSON.stringify(args)}`);
    const { stdout, stderr } = await runWhisperCommand(whisperCliBin, args, whisperDir);

    // Read the output file
    log.info(`🔍 Checking for output file: ${tempOutputFileWithExtension}`);

    if (fs.existsSync(tempOutputFileWithExtension)) {
      const outputStats = fs.statSync(tempOutputFileWithExtension);
      log.info(`✅ Output file found! Size: ${outputStats.size} bytes`);

      const transcription = fs.readFileSync(tempOutputFileWithExtension, 'utf-8');
      log.info(`📄 Transcription length: ${transcription.length} characters`);

      // Clean up temp file
      fs.unlinkSync(tempOutputFileWithExtension);
      log.info(`🧹 Cleaned up temporary output file`);

      return transcription;
    } else {
      log.error(`❌ Output file not found: ${tempOutputFileWithExtension}`);

      // List files in the temp directory to see what was created
      const tempDir = path.dirname(tempOutputFileWithExtension);
      if (fs.existsSync(tempDir)) {
        const filesInTempDir = fs.readdirSync(tempDir);
        log.error(`📂 Files in temp directory (${tempDir}):`, filesInTempDir);
      } else {
        log.error(`📂 Temp directory doesn't exist: ${tempDir}`);
      }

      log.error('\n◻️ whisper.cpp stdout:\n', stdout, '\n');
      log.error('\n❌ whisper.cpp stderr:\n', stderr, '\n');
      throw new Error(`Output file not created: ${tempOutputFileWithExtension}. See above for more details.`);
    }
  } catch (error) {
    throw new Error(`Failed to run whisper.cpp: ${(error as Error).message}`);
  }
}

/**
 * Polls Replicate API for the prediction result
 */
async function pollReplicateResult(predictionId: string, token: string): Promise<string> {
  const maxAttempts = 30;
  const delayMs = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error polling Replicate: ${response.status} ${errorText}`);
    }

    const prediction = await response.json() as any;

    if (prediction.status === 'succeeded') {
      return prediction.output || '';
    } else if (prediction.status === 'failed') {
      throw new Error(`Replicate transcription failed: ${prediction.error}`);
    }

    // Wait before the next polling attempt
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error(`Replicate transcription timed out after ${maxAttempts} polling attempts`);
} 