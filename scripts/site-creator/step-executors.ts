import { join } from 'path';
import { spawn } from 'child_process';
import { exists, writeTextFile, readTextFile, readJsonFile } from '../utils/file-operations.js';
import { execCommand } from '../utils/shell-exec.js';
import { printInfo, printSuccess, printWarning, printError, logInColor } from '../utils/logging.js';
import { CLIENT_PORT_NUMBER } from '@browse-dot-show/constants';
// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import { openGuide, collectInitial2EpisodesMetrics } from './site-operations.js';
import { loadProgress, saveProgress } from './setup-steps.js';
import { executeCompleteTranscriptionsStep } from './step-executors-advanced.js';
import type { SetupProgress, StepStatus, SiteConfig } from './types.js';

export async function executeStep(progress: SetupProgress, stepId: string): Promise<StepStatus> {
  const step = progress.steps[stepId];
  
  switch (stepId) {
    case 'generate-site-files':
      // This step is handled in the main flow
      return 'COMPLETED';
      
    case 'run-locally':
      return await executeRunLocallyStep(progress);
      
    case 'first-transcriptions':
      return await executeFirstTranscriptionsStep(progress);
      
    case 'custom-icons':
      return await executeCustomIconsStep();
      
    case 'custom-styling':
      return await executeCustomStylingStep();
      
    case 'complete-transcriptions':
      return await executeCompleteTranscriptionsStep(progress);
      
    case 'aws-deployment':
      return await executeAwsDeploymentStep();
      
    case 'local-automation':
      printInfo('🚧 Local automation setup coming soon! For now, we\'ll mark this as complete.');
      return 'COMPLETED';
      
    default:
      printWarning(`Unknown step: ${stepId}`);
      return 'NOT_STARTED';
  }
}

export async function executeRunLocallyStep(progress: SetupProgress): Promise<StepStatus> {
  console.log('');
  printInfo('🖥️  Let\'s get your site running locally!');
  console.log('');
  console.log('To run your site locally, use this command in a new terminal window:');
  console.log('');
  logInColor('green', `pnpm client:dev --filter ${progress.siteId}`);
  console.log('');
  console.log('This will start your React development server. You should see your');
  console.log(`podcast site running at http://localhost:${CLIENT_PORT_NUMBER}`);
  console.log('');
  printWarning(`Note: the site won't yet work for searching - we'll get to that next! For now, just make sure you can view the UI`);
  console.log('');
  
  const confirmResponse = await prompts({
    type: 'confirm',
    name: 'completed',
    message: 'Have you successfully run your site locally and seen it working?',
    initial: false
  });
  
  if (confirmResponse.completed) {
    printSuccess('Excellent! Your local development environment is working perfectly.');
    return 'COMPLETED';
  } else {
    printInfo('No worries! You can try again later. Remember the command above when you\'re ready.');
    return 'DEFERRED';
  }
}

export async function executeCustomIconsStep(): Promise<StepStatus> {
  console.log('');
  printInfo('🎨 Time to make your site uniquely yours with custom icons!');
  console.log('');
  console.log('We have a complete guide to help you create custom icons and branding.');
  console.log('This includes favicon, social media cards, and app icons.');
  console.log('');
  
  await openGuide('docs/custom-icons-guide.md');
  
  const confirmResponse = await prompts({
    type: 'confirm',
    name: 'completed',
    message: 'Have you finished customizing your icons and branding?',
    initial: false
  });
  
  return confirmResponse.completed ? 'COMPLETED' : 'DEFERRED';
}

export async function executeCustomStylingStep(): Promise<StepStatus> {
  console.log('');
  printInfo('🌈 Let\'s customize your site\'s theme and styling!');
  console.log('');
  console.log('We have a guide for customizing your site theme using shadcn.');
  console.log('You can create a unique color scheme that matches your podcast brand.');
  console.log('');
  
  await openGuide('docs/custom-theme-guide.md');
  
  const confirmResponse = await prompts({
    type: 'confirm',
    name: 'completed',
    message: 'Have you finished customizing your site theme and colors?',
    initial: false
  });
  
  return confirmResponse.completed ? 'COMPLETED' : 'DEFERRED';
}

export async function executeAwsDeploymentStep(): Promise<StepStatus> {
  console.log('');
  printInfo('🚀 Ready to deploy your site to AWS!');
  console.log('');
  console.log('AWS deployment is the recommended way to host your podcast site.');
  console.log('It provides reliable hosting, search functionality, and automatic scaling.');
  console.log('');
  
  await openGuide('docs/deployment-guide.md');
  
  const confirmResponse = await prompts({
    type: 'confirm',
    name: 'completed',
    message: 'Have you successfully deployed your site to AWS?',
    initial: false
  });
  
  return confirmResponse.completed ? 'COMPLETED' : 'DEFERRED';
}

// Helper function to parse environment variables from .env.local
async function parseEnvLocal(): Promise<Record<string, string>> {
  const envLocalPath = '.env.local';
  const envVars: Record<string, string> = {};
  
  if (!(await exists(envLocalPath))) {
    return envVars;
  }
  
  try {
    const envContent = await readTextFile(envLocalPath);
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmedLine.substring(0, equalIndex).trim();
          let value = trimmedLine.substring(equalIndex + 1).trim();
          
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          
          envVars[key] = value;
        }
      }
    }
  } catch (error) {
    // If we can't read the file, just return empty object
  }
  
  return envVars;
}

export async function executeFirstTranscriptionsStep(progress: SetupProgress): Promise<StepStatus> {
  console.log('');
  printInfo('🎙️  Let\'s setup transcriptions for your first few episodes!');
  console.log('');
  console.log('This will help you see a working searchable site quickly. We\'ll download');
  console.log('and transcribe 2 episodes locally (this takes about 10-20 minutes).');
  console.log('');
  
  // Check if whisper configuration already exists in .env.local
  const existingEnvVars = await parseEnvLocal();
  const existingWhisperPath = existingEnvVars['WHISPER_CPP_PATH'];
  const existingWhisperModel = existingEnvVars['WHISPER_CPP_MODEL'];
  
  let whisperPath: string;
  let whisperModel: string;
  
  if (existingWhisperPath && existingWhisperModel) {
    // Skip prompts if configuration already exists
    printInfo('✅ Found existing Whisper configuration in .env.local');
    console.log(`   • Whisper path: ${existingWhisperPath}`);
    console.log(`   • Whisper model: ${existingWhisperModel}`);
    console.log('');
    printInfo('Skipping Whisper setup prompts and using existing configuration...');
    
    whisperPath = existingWhisperPath;
    whisperModel = existingWhisperModel;
  } else {
    // Proceed with normal prompts if configuration doesn't exist
    const hasWhisperResponse = await prompts({
      type: 'confirm',
      name: 'hasWhisper',
      message: 'Do you already have whisper.cpp configured locally on your machine?',
      initial: false
    });
    
    if (!hasWhisperResponse.hasWhisper) {
      console.log('');
      printInfo('📖 You\'ll need to setup whisper.cpp for local transcription.');
      console.log('');
      console.log('Please follow these steps:');
      console.log('1. Visit: https://github.com/ggml-org/whisper.cpp?tab=readme-ov-file#quick-start');
      console.log('2. Clone the whisper.cpp repository');
      console.log('3. Follow the build instructions for your platform');
      console.log('4. Download a model (we recommend large-v3-turbo)');
      console.log('');
      
      const setupResponse = await prompts({
        type: 'confirm',
        name: 'setupComplete',
        message: 'Have you completed the whisper.cpp setup?',
        initial: false
      });
      
      if (!setupResponse.setupComplete) {
        printInfo('No problem! You can continue with this step when you\'re ready.');
        return 'DEFERRED';
      }
    }
    
    // Get whisper.cpp path and model
    const pathResponse = await prompts({
      type: 'text',
      name: 'whisperPath',
      message: 'Please enter the path to your whisper.cpp directory:',
      validate: (value: string) => {
        if (!value.trim()) return 'Path is required';
        return true;
      }
    });
    
    if (!pathResponse.whisperPath) {
      return 'DEFERRED';
    }
    
    const modelResponse = await prompts({
      type: 'text',
      name: 'whisperModel',
      message: 'Which whisper model would you like to use?',
      initial: 'large-v3-turbo',
      validate: (value: string) => {
        if (!value.trim()) return 'Model name is required';
        return true;
      }
    });
    
    if (!modelResponse.whisperModel) {
      return 'DEFERRED';
    }
    
    whisperPath = pathResponse.whisperPath;
    whisperModel = modelResponse.whisperModel;
  }
  
  // Update .env.local if configuration was prompted
  if (!existingWhisperPath || !existingWhisperModel) {
    try {
      printInfo('⚙️  Updating .env.local with your configuration...');
      
      const envLocalPath = '.env.local';
      let envContent = '';
      
      if (await exists(envLocalPath)) {
        envContent = await readTextFile(envLocalPath);
      }
      
      const updates = {
        'FILE_STORAGE_ENV': 'local',
        'WHISPER_API_PROVIDER': 'local-whisper.cpp',
        'WHISPER_CPP_PATH': `"${whisperPath}"`,
        'WHISPER_CPP_MODEL': `"${whisperModel}"`
      };
      
      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      }
      
      await writeTextFile(envLocalPath, envContent);
      printSuccess('✅ Updated .env.local with your Whisper configuration');
    } catch (error) {
      printError(`Failed to update .env.local: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return 'DEFERRED';
    }
  }
  
  // Test whisper installation
  await testWhisperInstallation(whisperPath, whisperModel);
  
  // Run the ingestion pipeline
  return await runIngestionPipeline(progress);
}

async function testWhisperInstallation(whisperPath: string, whisperModel: string): Promise<void> {
  printInfo('🧪 Testing your Whisper installation...');
  console.log('This may take a moment...');
  
  try {
    const testAudioFile = '/Users/jackkoppa/Personal_Development/browse-dot-show/docs/welcome-to-browse-dot-show.wav';
    
    if (!(await exists(testAudioFile))) {
      printWarning('⚠️  Test audio file not found. Skipping whisper test...');
      printInfo('Proceeding with ingestion - if there are issues, they\'ll be caught during processing.');
      return;
    }
    
    const whisperCliBin = join(whisperPath, 'build/bin/whisper-cli');
    const whisperModelFile = `ggml-${whisperModel}.bin`;
    const modelPath = join(whisperPath, 'models', whisperModelFile);
    
    printInfo('🎧 Transcribing welcome message - this might take up to a minute, but likely less...');
    
    const result = await execCommand(whisperCliBin, ['-m', modelPath, '-f', testAudioFile], {
      timeout: 60000
    });
    
    if (result.exitCode !== 0 || !result.stdout) {
      throw new Error('Transcription test failed');
    }
    
    // Show the transcription result
    console.log('');
    printInfo('📝 Transcription result:');
    console.log('─'.repeat(60));
    console.log(result.stdout.trim());
    console.log('─'.repeat(60));
    console.log('');
    
    // Check if transcription contains expected content
    if (result.stdout.toLowerCase().includes('best of luck')) {
      printSuccess('Your local installation of the Whisper model is working correctly 🎉');
    } else {
      throw new Error('Transcription test failed - output did not contain expected phrase');
    }
    
  } catch (error) {
    printError(`❌ Whisper test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('');
    console.log('This usually means one of these issues:');
    console.log('1. whisper.cpp is not properly compiled');
    console.log('2. The model file is missing or incorrect');
    console.log('3. The path to whisper.cpp is incorrect');
    console.log('');
    
    const continueResponse = await prompts({
      type: 'confirm',
      name: 'continue',
      message: 'Would you like to continue anyway? (Transcription may fail later)',
      initial: false
    });
    
    if (!continueResponse.continue) {
      throw new Error('User chose not to continue with broken whisper setup');
    }
    
    printWarning('⚠️  Proceeding with potentially broken whisper setup...');
  }
}

async function runIngestionPipeline(progress: SetupProgress): Promise<StepStatus> {
  console.log('');
  const readyForIngestionResponse = await prompts({
    type: 'confirm',
    name: 'ready',
    message: 'Ready to start downloading and transcribing your first 2 episodes? This will take about 10-20 minutes.',
    initial: true
  });
  
  if (!readyForIngestionResponse.ready) {
    printInfo('No problem! You can continue with this step when you\'re ready.');
    return 'DEFERRED';
  }
  
  console.log('');
  printInfo('🎵 Processing your first 2 episodes...');
  console.log('We\'ll run this in 3 phases to get accurate timing metrics.');
  
  let downloadStartTime: number;
  let downloadEndTime: number = Date.now();
  let transcriptionStartTime: number;
  let transcriptionEndTime: number = Date.now();
  
  try {
    // Phase 1: Download episodes
    printInfo('📥 Phase 1: Downloading episode audio files...');
    downloadStartTime = Date.now();
    
    const downloadSuccess = await runSpawnCommand('pnpm', [
      'tsx', 'scripts/trigger-individual-ingestion-lambda.ts',
      `--sites=${progress.siteId}`,
      '--lambda=rss-retrieval',
      '--env=local',
      '--max-episodes=2'
    ]);
    
    downloadEndTime = Date.now();
    if (!downloadSuccess) throw new Error('Download phase failed');
    printSuccess('✅ Episode download completed!');
    
    // Phase 2: Transcription
    printInfo('🎙️  Phase 2: Transcribing episodes...');
    transcriptionStartTime = Date.now();
    
    const transcriptionSuccess = await runSpawnCommand('pnpm', [
      'tsx', 'scripts/trigger-individual-ingestion-lambda.ts',
      `--sites=${progress.siteId}`,
      '--lambda=process-audio',
      '--env=local'
    ]);
    
    transcriptionEndTime = Date.now();
    if (!transcriptionSuccess) throw new Error('Transcription phase failed');
    printSuccess('✅ Episode transcription completed!');
    
    // Phase 3: Indexing
    printInfo('🔍 Phase 3: Creating search index...');
    
    const indexingSuccess = await runSpawnCommand('pnpm', [
      'tsx', 'scripts/trigger-individual-ingestion-lambda.ts',
      `--sites=${progress.siteId}`,
      '--lambda=srt-indexing',
      '--env=local'
    ]);
    
    if (!indexingSuccess) throw new Error('Indexing phase failed');
    printSuccess('✅ All phases completed successfully!');
    
    // Collect metrics
    try {
      printInfo('📊 Collecting metrics from your first 2 episodes...');
      const downloadTimeInSeconds = Math.round((downloadEndTime - downloadStartTime) / 1000);
      const transcriptionTimeInSeconds = Math.round((transcriptionEndTime - transcriptionStartTime) / 1000);
      
      const metrics = await collectInitial2EpisodesMetrics(progress.siteId, downloadTimeInSeconds, transcriptionTimeInSeconds);
      
      const currentProgress = await loadProgress(progress.siteId);
      if (currentProgress) {
        currentProgress.initial2EpisodesResults = metrics;
        await saveProgress(currentProgress);
        printSuccess(`📈 Metrics saved: ${metrics.episodesSizeInMB.toFixed(1)}MB, ${Math.round(metrics.episodesDurationInSeconds/60)} min duration`);
      }
    } catch (metricsError) {
      printWarning(`Could not collect metrics: ${metricsError instanceof Error ? metricsError.message : 'Unknown error'}`);
    }
    
  } catch (error) {
    printError(`Failed during episode processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return 'DEFERRED';
  }
  
  // Test the result
  console.log('');
  printInfo('🎉 Your first episodes are now transcribed and searchable!');
  console.log(`To test: run \`pnpm client:dev --filter ${progress.siteId}\` and try searching.`);
  
  const testResponse = await prompts({
    type: 'confirm',
    name: 'tested',
    message: 'Have you successfully tested the search functionality?',
    initial: false
  });
  
  return testResponse.tested ? 'COMPLETED' : 'DEFERRED';
}

async function runSpawnCommand(command: string, args: string[]): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    child.stdout?.on('data', (data) => {
      process.stdout.write(data.toString());
    });
    
    child.stderr?.on('data', (data) => {
      process.stderr.write(data.toString());
    });
    
    child.on('close', (code) => {
      console.log('');
      resolve(code === 0);
    });
    
    child.on('error', () => {
      resolve(false);
    });
  });
} 