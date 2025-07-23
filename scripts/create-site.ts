#!/usr/bin/env tsx

import { join } from 'path';
import { copyDir, ensureDir, exists, writeJsonFile, readJsonFile, writeTextFile, readTextFile } from './utils/file-operations.js';
import { printInfo, printSuccess, printWarning, printError, logInColor } from './utils/logging.js';
// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { CLIENT_PORT_NUMBER } from '@browse-dot-show/constants';
import { arch, platform } from 'os';

const execAsync = promisify(exec);

// Setup step definitions
const SETUP_STEPS: Omit<SetupStep, 'status' | 'completedAt'>[] = [
  {
    id: 'generate-site-files',
    displayName: 'Generate initial site files',
    description: 'Create the core site structure and configuration',
    optional: false
  },
  {
    id: 'run-locally',
    displayName: 'Run React site locally',
    description: 'Verify your local development environment works',
    optional: false
  },
  {
    id: 'first-transcriptions',
    displayName: 'Generate first episode transcriptions',
    description: 'Process a few episodes locally to test the workflow',
    optional: false
  },
  {
    id: 'custom-icons',
    displayName: 'Setup custom icons',
    description: 'Customize your site branding and visual identity',
    optional: true
  },
  {
    id: 'custom-styling',
    displayName: 'Setup custom CSS & styling',
    description: 'Customize your site theme and appearance',
    optional: true
  },
  {
    id: 'complete-transcriptions',
    displayName: 'Complete all episode transcriptions',
    description: 'Process your full podcast archive',
    optional: false
  },
  {
    id: 'aws-deployment',
    displayName: 'Setup AWS deployment',
    description: 'Deploy your site to production (recommended)',
    optional: true
  },
  {
    id: 'local-automation',
    displayName: 'Setup local automation',
    description: 'Automate future episode processing (recommended)',
    optional: true
  }
];

interface PodcastSearchResult {
  id: number;
  title: string;
  url: string;
  link?: string;
  description?: string;
  author?: string;
  image?: string;
}

interface PodcastIndexResponse {
  status: string;
  feeds: PodcastSearchResult[];
  count: number;
  query: string;
  description: string;
}

type StepStatus = 'NOT_STARTED' | 'COMPLETED' | 'CONFIRMED_SKIPPED' | 'DEFERRED';

interface SetupStep {
  id: string;
  displayName: string;
  description: string;
  status: StepStatus;
  optional: boolean;
  completedAt?: string;
}

interface SetupProgress {
  siteId: string;
  podcastName: string;
  createdAt: string;
  lastUpdated: string;
  steps: Record<string, SetupStep>;
}

interface SiteConfig {
  id: string;
  domain: string;
  appHeader: {
    primaryTitle: string;
    includeTitlePrefix: boolean;
    taglinePrimaryPodcastName: string;
    taglinePrimaryPodcastExternalURL: string;
    taglineSuffix: string;
  };
  socialAndMetadata: {
    pageTitle: string;
    canonicalUrl: string;
    openGraphImagePath: string;
    metaDescription: string;
    metaTitle: string;
  };
  includedPodcasts: Array<{
    id: string;
    rssFeedFile: string;
    title: string;
    status: string;
    url: string;
  }>;
  whisperTranscriptionPrompt: string;
  themeColor: string;
  themeColorDark: string;
  searchPlaceholderOptions: string[];
  trackingScript: string;
}

type SupportLevel = 'FULL_SUPPORT' | 'LIMITED_TESTING' | 'UNTESTED' | 'KNOWN_TO_BE_UNOPERATIONAL';

interface PlatformSupportConfig {
  platforms: Record<string, {
    name: string;
    features: Record<string, SupportLevel>;
  }>;
  features: Record<string, {
    name: string;
    description: string;
  }>;
  supportLevels: Record<SupportLevel, {
    emoji: string;
    description: string;
  }>;
}

// Platform support functions
async function loadPlatformSupportConfig(): Promise<PlatformSupportConfig> {
  const configPath = 'packages/config/platform-support.json';
  return await readJsonFile<PlatformSupportConfig>(configPath);
}

function detectCurrentPlatform(): string {
  const os = platform();
  const architecture = arch();
  
  if (os === 'darwin') {
    // Mac
    if (architecture === 'arm64') {
      return 'mac-silicon';
    } else {
      return 'mac-intel';
    }
  } else if (os === 'linux') {
    return 'linux';
  } else if (os === 'win32') {
    return 'windows';
  } else {
    // Default to linux for unknown platforms
    return 'linux';
  }
}

function displayPlatformSupport(config: PlatformSupportConfig, platformKey: string): void {
  const platform = config.platforms[platformKey];
  if (!platform) {
    printError(`Unknown platform: ${platformKey}`);
    return;
  }
  
  console.log(`\n🖥️  Platform: ${platform.name}`);
  console.log('📋 Feature Support:');
  console.log('');
  
  const features = Object.keys(platform.features);
  features.forEach(featureKey => {
    const feature = config.features[featureKey];
    const supportLevel = platform.features[featureKey];
    const supportInfo = config.supportLevels[supportLevel];
    
    if (feature && supportInfo) {
      console.log(`${supportInfo.emoji} ${feature.name}`);
      console.log(`   ${supportInfo.description}`);
      console.log('');
    }
  });
}

function hasLimitedSupport(config: PlatformSupportConfig, platformKey: string): boolean {
  const platform = config.platforms[platformKey];
  if (!platform) return true;
  
  const features = Object.values(platform.features);
  const nonFullSupportCount = features.filter(level => level !== 'FULL_SUPPORT').length;
  return nonFullSupportCount > 1;
}

// Progress management functions
function getProgressFilePath(siteId: string): string {
  return join('sites/my-sites', siteId, '.setup-progress.json');
}

async function loadProgress(siteId: string): Promise<SetupProgress | null> {
  const progressPath = getProgressFilePath(siteId);
  if (!(await exists(progressPath))) {
    return null;
  }
  
  try {
    return await readJsonFile<SetupProgress>(progressPath);
  } catch (error) {
    printWarning(`Could not load progress file for ${siteId}`);
    return null;
  }
}

async function saveProgress(progress: SetupProgress): Promise<void> {
  const progressPath = getProgressFilePath(progress.siteId);
  progress.lastUpdated = new Date().toISOString();
  await writeJsonFile(progressPath, progress, { spaces: 2 });
}

function createInitialProgress(siteId: string, podcastName: string): SetupProgress {
  const now = new Date().toISOString();
  const steps: Record<string, SetupStep> = {};
  
  SETUP_STEPS.forEach(stepDef => {
    steps[stepDef.id] = {
      ...stepDef,
      status: 'NOT_STARTED'
    };
  });
  
  return {
    siteId,
    podcastName,
    createdAt: now,
    lastUpdated: now,
    steps
  };
}

async function updateStepStatus(siteId: string, stepId: string, status: StepStatus): Promise<void> {
  const progress = await loadProgress(siteId);
  if (!progress) {
    printError(`Could not find progress for site: ${siteId}`);
    return;
  }
  
  // Create step if it doesn't exist (for newly added steps)
  if (!progress.steps[stepId]) {
    const stepDef = SETUP_STEPS.find(s => s.id === stepId);
    if (stepDef) {
      progress.steps[stepId] = {
        ...stepDef,
        status: 'NOT_STARTED'
      };
    }
  }
  
  if (progress.steps[stepId]) {
    const oldStatus = progress.steps[stepId].status;
    progress.steps[stepId].status = status;
    if (status === 'COMPLETED') {
      progress.steps[stepId].completedAt = new Date().toISOString();
    }
    await saveProgress(progress);
    
    // Show progress update
    displayProgressUpdate(progress, stepId, oldStatus, status);
  }
}

function calculateProgress(progress: SetupProgress): { completed: number; total: number; percentage: number } {
  // Use SETUP_STEPS as the source of truth for total steps
  const total = SETUP_STEPS.length;
  const completed = SETUP_STEPS.filter(stepDef => {
    const step = progress.steps[stepDef.id];
    return step?.status === 'COMPLETED';
  }).length;
  const percentage = Math.round((completed / total) * 100);
  
  return { completed, total, percentage };
}

function createProgressBar(percentage: number, width: number = 30): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percentage}%`;
}

function displayProgressUpdate(progress: SetupProgress, stepId: string, oldStatus: StepStatus, newStatus: StepStatus): void {
  const { completed, total, percentage } = calculateProgress(progress);
  const step = progress.steps[stepId];
  
  console.log('');
  
  if (newStatus === 'COMPLETED' && oldStatus !== 'COMPLETED') {
    // Celebration for completion
    printSuccess(`🎉 ${step.displayName} - Complete!`);
    
    if (percentage === 100) {
      console.log('');
      printSuccess('🚀 AMAZING! You\'ve completed your entire podcast site setup!');
      console.log('🎊 Time to celebrate - your site is ready for the world! 🎊');
    }
  } else if (newStatus === 'DEFERRED') {
    printInfo(`📅 ${step.displayName} - We'll come back to this later`);
  } else if (newStatus === 'CONFIRMED_SKIPPED') {
    printInfo(`⏭️  ${step.displayName} - Skipped`);
  }
  
  // Always show current progress
  console.log('');
  console.log(`📊 Overall Progress: ${createProgressBar(percentage)} (${completed}/${total} complete)`);
  console.log('');
}

async function promptForStep(progress: SetupProgress, stepId: string): Promise<StepStatus> {
  const step = progress.steps[stepId];
  
  console.log(`\n🎯 Next Step: ${step.displayName}`);
  console.log(`   ${step.description}`);
  if (step.optional) {
    console.log('   (This step is optional)');
  }
  console.log('');
  
  const response = await prompts({
    type: 'select',
    name: 'action',
    message: `Ready to ${step.displayName.toLowerCase()}?`,
    choices: [
      {
        title: 'Yes, let\'s do it now! 🚀',
        description: 'Proceed with this step immediately',
        value: 'yes'
      },
      {
        title: 'Not right now, ask me later 📅',
        description: 'I\'ll come back to this step in a future session',
        value: 'defer'
      },
      {
        title: 'Skip this permanently ⏭️',
        description: 'I don\'t want to do this step (can\'t be undone easily)',
        value: 'skip'
      }
    ],
    initial: 0
  });
  
  if (!response.action) {
    return 'NOT_STARTED'; // User cancelled
  }
  
  if (response.action === 'skip') {
    // Confirm permanent skip
    const confirmResponse = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to skip "${step.displayName}" permanently? We won't ask you about this again.`,
      initial: false
    });
    
    if (confirmResponse.confirm) {
      return 'CONFIRMED_SKIPPED';
    } else {
      return 'NOT_STARTED'; // User changed their mind
    }
  }
  
  if (response.action === 'defer') {
    return 'DEFERRED';
  }
  
  // response.action === 'yes'
  return await executeStep(progress, stepId);
}

async function executeStep(progress: SetupProgress, stepId: string): Promise<StepStatus> {
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
      printInfo('🚧 Full transcription workflow coming soon! For now, we\'ll mark this as complete.');
      return 'COMPLETED';
      
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

async function executeRepoForkCheck(): Promise<void> {
  try {
    printInfo('🔍 Checking repository setup...');
    
    // Get the git remote origin URL
    const { stdout: remoteUrl } = await execAsync('git remote get-url origin');
    const cleanUrl = remoteUrl.trim();
    
    // Check if this is the original repo
    const originalRepoUrls = [
      'https://github.com/jackkoppa/browse-dot-show',
      'https://github.com/jackkoppa/browse-dot-show.git',
      'git@github.com:jackkoppa/browse-dot-show.git'
    ];
    
    const isOriginalRepo = originalRepoUrls.some(url => cleanUrl.includes('jackkoppa/browse-dot-show'));
    
    if (!isOriginalRepo) {
      // This appears to be a fork - good!
      printSuccess('✅ Great! You\'re using a fork of the repository.');
      printInfo('This will make it easy to version control your custom sites and configurations.');
      return;
    }
    
    // This is the original repo - show warning
    console.log('');
    printWarning('⚠️  WARNING: You\'re using the original repository, not a fork!');
    console.log('');
    console.log('🔧 We highly recommend forking this repo first, so that you\'re able to easily');
    console.log('   version control your site(s). If you proceed with cloning the main repo,');
    console.log('   it will be fairly difficult to move your local dev files over to a fork');
    console.log('   in the future.');
    console.log('');
    console.log('💡 To fork: Visit https://github.com/jackkoppa/browse-dot-show and click "Fork"');
    console.log('');
    
    const firstPromptResponse = await prompts({
      type: 'confirm',
      name: 'exitToFork',
      message: 'Would you like to exit now, so you can fork the repo & start over from that clone?',
      initial: true
    });
    
    if (firstPromptResponse.exitToFork) {
      printInfo('👍 Smart choice! Please fork the repo and clone your fork, then run this setup again.');
      printInfo('Fork at: https://github.com/jackkoppa/browse-dot-show');
      process.exit(0);
    }
    
    // Second confirmation
    console.log('');
    const secondPromptResponse = await prompts({
      type: 'confirm',
      name: 'reallyProceed',
      message: 'Are you sure you wish to proceed with this clone of the main repo?',
      initial: false
    });
    
    if (!secondPromptResponse.reallyProceed) {
      printInfo('👍 Good decision! Please fork the repo and clone your fork, then run this setup again.');
      printInfo('Fork at: https://github.com/jackkoppa/browse-dot-show');
      process.exit(0);
    }
    
    // User really wants to proceed
    printWarning('⚠️  Proceeding with original repo clone. Remember to fork later if you want to version control your changes.');
    console.log('');
    
  } catch (error) {
    // If we can't check git remote (maybe not a git repo?), just log a warning and continue
    printWarning('Could not check git repository setup. Proceeding anyway...');
    printInfo('💡 If you haven\'t already, consider forking https://github.com/jackkoppa/browse-dot-show');
  }
}

async function executePlatformSupportStep(): Promise<StepStatus> {
  console.log('');
  printInfo('🔍 Checking your platform compatibility...');
  
  try {
    const config = await loadPlatformSupportConfig();
    const currentPlatform = detectCurrentPlatform();
    
    displayPlatformSupport(config, currentPlatform);
    
    if (hasLimitedSupport(config, currentPlatform)) {
      printWarning('⚠️  Your platform has limited support for some features.');
      console.log('');
      console.log('You may encounter errors during setup or when using certain features.');
      console.log('All platforms should eventually work, but you might need to troubleshoot');
      console.log('or contribute fixes for your specific platform.');
      console.log('');
      console.log('💡 If you run into issues, please check our GitHub issues:');
      console.log('   https://github.com/jackkoppa/browse-dot-show/issues');
      console.log('');
    }
    
    const confirmResponse = await prompts({
      type: 'confirm',
      name: 'continue',
      message: 'Would you like to continue with the setup?',
      initial: true
    });
    
    if (confirmResponse.continue) {
      printSuccess('Great! Let\'s proceed with the setup.');
      return 'COMPLETED';
    } else {
      printInfo('Setup cancelled. You can restart anytime with `pnpm run site:create`.');
      process.exit(0);
    }
  } catch (error) {
    printWarning('Could not load platform support configuration. Proceeding anyway...');
    return 'COMPLETED';
  }
}

async function executeRunLocallyStep(progress: SetupProgress): Promise<StepStatus> {
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

async function executeCustomIconsStep(): Promise<StepStatus> {
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

async function executeCustomStylingStep(): Promise<StepStatus> {
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

async function executeFirstTranscriptionsStep(progress: SetupProgress): Promise<StepStatus> {
  console.log('');
  printInfo('🎙️  Let\'s setup transcriptions for your first few episodes!');
  console.log('');
  console.log('This will help you see a working searchable site quickly. We\'ll download');
  console.log('and transcribe 2 episodes locally (this takes about 10-20 minutes).');
  console.log('');
  
  // Step 1: Check existing Whisper setup
  const hasWhisperResponse = await prompts({
    type: 'confirm',
    name: 'hasWhisper',
    message: 'Do you already have whisper.cpp configured locally on your machine?',
    initial: false
  });
  
  if (!hasWhisperResponse.hasWhisper) {
    // User needs to setup whisper.cpp
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
  
  // Step 2: Get whisper.cpp path
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
  
  // Step 3: Get model preference
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
  
  // Step 4: Update .env.local
  try {
    printInfo('⚙️  Updating .env.local with your configuration...');
    
    const envLocalPath = '.env.local';
    let envContent = '';
    
    if (await exists(envLocalPath)) {
      envContent = await readTextFile(envLocalPath);
    }
    
    // Update or add the required environment variables
    const updates = {
      'FILE_STORAGE_ENV': 'local',
      'WHISPER_API_PROVIDER': 'local-whisper.cpp',
      'WHISPER_CPP_PATH': `"${pathResponse.whisperPath}"`,
      'WHISPER_CPP_MODEL': `"${modelResponse.whisperModel}"`
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
  
  // Step 5: Test whisper installation
  printInfo('🧪 Testing your Whisper installation...');
  console.log('This may take a moment...');
  
  try {
    // Test with a known audio file
    const testAudioFile = '/Users/jackkoppa/Personal_Development/browse-dot-show/docs/welcome-to-browse-dot-show.wav';
    
    if (!(await exists(testAudioFile))) {
      printWarning('⚠️  Test audio file not found. Skipping whisper test...');
      printInfo('Proceeding with ingestion - if there are issues, they\'ll be caught during processing.');
    } else {
      // Build whisper command
      const whisperCliBin = join(pathResponse.whisperPath, 'build/bin/whisper-cli');
      const whisperModel = `ggml-${modelResponse.whisperModel}.bin`;
      const modelPath = join(pathResponse.whisperPath, 'models', whisperModel);
      
      // Run simple whisper test command (output to stdout)
      const testCommand = `"${whisperCliBin}" -m "${modelPath}" -f "${testAudioFile}"`;
      
      printInfo(`Running test: ${testCommand}`);
      printInfo('🎧 Transcribing welcome message - this might take up to a minute, but likely less...');
      
      const { stdout } = await execAsync(testCommand, {
        timeout: 60000, // 60 second timeout for test
        maxBuffer: 1024 * 1024 // 1MB buffer
      });
      
      // Show the transcription result
      if (stdout && stdout.trim()) {
        console.log('');
        printInfo('📝 Transcription result:');
        console.log('─'.repeat(60));
        console.log(stdout.trim());
        console.log('─'.repeat(60));
        console.log('');
      }
      
      // Check if transcription contains expected content
      if (stdout && stdout.toLowerCase().includes('best of luck')) {
        printInfo('🎉 The transcription contains the expected content - you\'re all set!');
        printSuccess('Your local installation of the Whisper model is working correctly 🎉');
        console.log('');
        printSuccess('This is one of the best features of browse.show - local transcriptions means free site setup, rather than paid transcriptions via the OpenAI API.');
        printSuccess('This could otherwise end up costing $100+ for a few hundred hours of audio.');
        console.log('');
        printSuccess(`You'll also be able to use local transcriptions on a schedule, if you'd like to transcribe locally for all future episodes, too.`);
        console.log('');
        console.log('');
        console.log('');
      } else {
        throw new Error('Transcription test failed - output did not contain expected phrase "best of luck"');
      }
    }
  } catch (error) {
    printError(`❌ Whisper test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('');
    console.log('This usually means one of these issues:');
    console.log('1. whisper.cpp is not properly compiled');
    console.log('2. The model file is missing or incorrect');
    console.log('3. The path to whisper.cpp is incorrect');
    console.log('');
    console.log('Please check the whisper.cpp documentation:');
    console.log('https://github.com/ggml-org/whisper.cpp?tab=readme-ov-file#quick-start');
    console.log('');
    
    const continueResponse = await prompts({
      type: 'confirm',
      name: 'continue',
      message: 'Would you like to continue anyway? (Transcription may fail later)',
      initial: false
    });
    
    if (!continueResponse.continue) {
      return 'DEFERRED';
    }
    
    printWarning('⚠️  Proceeding with potentially broken whisper setup...');
  }
  
  // Add confirmation prompt before starting ingestion pipeline
  console.log('');
  const readyForIngestionResponse = await prompts({
    type: 'confirm',
    name: 'ready',
    message: 'Ready to start downloading and transcribing your first 2 episodes? This will take about 10-20 minutes (depends on your machine).',
    initial: true
  });
  
  if (!readyForIngestionResponse.ready) {
    printInfo('No problem! You can continue with this step when you\'re ready.');
    return 'DEFERRED';
  }
  
  // Step 6: Run ingestion pipeline
  console.log('');
  printInfo('🎵 Running ingestion pipeline for your first 2 episodes...');
  console.log('This will download and transcribe 2 episodes (estimated 10-20 minutes).');
  console.log('');
  
  try {
    const ingestionArgs = [
      'tsx', 'scripts/run-ingestion-pipeline.ts',
      `--sites=${progress.siteId}`,
      '--max-episodes=2',
      '--skip-pre-sync',
      '--skip-s3-sync',
      '--force-local-indexing'
    ];
    
    // Use spawn for real-time output
    const success = await new Promise<boolean>((resolve, reject) => {
      const child = spawn('pnpm', ingestionArgs, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Stream stdout in real-time
      child.stdout?.on('data', (data) => {
        const output = data.toString();
        // Print output as it comes, preserving formatting
        process.stdout.write(output);
      });
      
      // Stream stderr in real-time  
      child.stderr?.on('data', (data) => {
        const output = data.toString();
        // Print errors/warnings as they come
        process.stderr.write(output);
      });
      
      child.on('close', (code) => {
        console.log(''); // Add spacing after ingestion output
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(`Ingestion pipeline failed with exit code ${code}`));
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
    });
    
    if (success) {
      printSuccess('✅ Ingestion pipeline completed successfully!');
    }
  } catch (error) {
    printError(`Failed to run ingestion pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('');
    console.log('You can try running this manually:');
    console.log(`pnpm tsx scripts/run-ingestion-pipeline.ts --sites=${progress.siteId} --max-episodes=2 --skip-s3-sync --force-local-indexing`);
    return 'DEFERRED';
  }
  
  // Step 7: Test the result
  console.log('');
  printInfo('🎉 Your first episodes are now transcribed and searchable!');
  console.log('');
  console.log('To test your setup:');
  console.log(`1. Run: pnpm client:dev --filter ${progress.siteId}`);
  console.log(`2. Visit: http://localhost:5173`);
  console.log('3. Try searching for a topic from your podcast');
  console.log('');
  
  const testResponse = await prompts({
    type: 'confirm',
    name: 'tested',
    message: 'Have you successfully tested the search functionality?',
    initial: false
  });
  
  return testResponse.tested ? 'COMPLETED' : 'DEFERRED';
}

async function executeAwsDeploymentStep(): Promise<StepStatus> {
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

async function displayProgressReview(progress: SetupProgress): Promise<void> {
  const { completed, total, percentage } = calculateProgress(progress);
  
  console.log(`\n📊 Setup Progress for "${progress.podcastName}":`);
  console.log(`${createProgressBar(percentage)} (${completed}/${total} complete)\n`);
  
  SETUP_STEPS.forEach(stepDef => {
    const step = progress.steps[stepDef.id];
    const status = step?.status || 'NOT_STARTED';
    let icon = '⬜';
    let label = 'Not Started';
    
    switch (status) {
      case 'COMPLETED':
        icon = '✅';
        label = `Completed${step?.completedAt ? ` on ${new Date(step.completedAt).toLocaleDateString()}` : ''}`;
        break;
      case 'DEFERRED':
        icon = '📅';
        label = 'Deferred (will ask again)';
        break;
      case 'CONFIRMED_SKIPPED':
        icon = '⏭️';
        label = 'Skipped';
        break;
    }
    
    console.log(`${icon} ${stepDef.displayName}${stepDef.optional ? ' (optional)' : ''}`);
    console.log(`   ${label}`);
    if (status === 'NOT_STARTED' || status === 'DEFERRED') {
      console.log(`   ${stepDef.description}`);
    }
    console.log('');
  });
}

async function getExistingSites(): Promise<string[]> {
  const mySitesDir = 'sites/my-sites';
  if (!(await exists(mySitesDir))) {
    return [];
  }
  
  try {
    // Use Node.js fs to read directory since file-operations doesn't export readdir
    const fs = await import('fs');
    const entries = await fs.promises.readdir(mySitesDir, { withFileTypes: true });
    const sites: string[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sitePath = join(mySitesDir, entry.name);
        if (await exists(join(sitePath, 'site.config.json'))) {
          sites.push(entry.name);
        }
      }
    }
    
    return sites;
  } catch (_error) {
    // Directory might not be readable, return empty array
    return [];
  }
}

function createSiteId(podcastName: string): string {
  return podcastName
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '') // Remove numbers and special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

async function searchPodcastRSSFeed(podcastName: string): Promise<PodcastSearchResult[]> {
  try {
    printInfo(`Searching for "${podcastName}" podcast RSS feed...`);
    
    // Use Podcast Index API for podcast search
    const searchQuery = encodeURIComponent(podcastName);
    const apiUrl = `https://podcastindex.org/api/search/byterm?q=${searchQuery}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const data: PodcastIndexResponse = await response.json();
    
    if (data.status === 'true' && data.feeds && data.feeds.length > 0) {
      printSuccess(`Found ${data.feeds.length} potential match(es)`);
      return data.feeds;
    } else {
      printInfo('No exact matches found in Podcast Index');
      return [];
    }
  } catch (error) {
    printWarning(`RSS feed search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return [];
  }
}

async function promptForSiteId(podcastName: string): Promise<string> {
  const suggestedSiteId = createSiteId(podcastName);
  
  console.log('\n🏷️  Site ID Configuration');
  console.log(`Based on your podcast name, we suggest the site ID: "${suggestedSiteId}"`);
  console.log(`Your site will be available at: ${suggestedSiteId}.browse.show`);
  console.log('');
  console.log('💡 Tips for a great site ID:');
  console.log('   • Simpler is better (e.g. all lowercase letters)');
  console.log('   • Must be less than 32 characters');
  console.log('   • No numbers or other special characters allowed');
  console.log('');
  
  const customizeResponse = await prompts({
    type: 'confirm',
    name: 'customize',
    message: `Use "${suggestedSiteId}" as your site ID?`,
    initial: true
  });
  
  if (!customizeResponse.customize) {
    // User wants to customize
    while (true) {
      const customResponse = await prompts({
        type: 'text',
        name: 'customSiteId',
        message: 'Enter your preferred site ID:',
        initial: suggestedSiteId,
        validate: (value: string) => {
          if (!value.trim()) return 'Site ID cannot be empty';
          if (value.length > 32) return `Site ID must be 32 characters or less (current: ${value.length})`;
          if (!/^[a-z_-]+$/.test(value)) return 'Site ID can only contain lowercase letters, hyphens (-), and underscores (_)';
          return true;
        }
      });
      
      if (!customResponse.customSiteId) {
        printError('Site creation cancelled.');
        process.exit(0);
      }
      
      const customSiteId = customResponse.customSiteId.trim();
      
      // Check if custom ID is available
      const customSiteDir = join('sites/my-sites', customSiteId);
      if (!(await exists(customSiteDir))) {
        printInfo(`✅ Great choice! Using "${customSiteId}" for your site ID.`);
        return customSiteId;
      } else {
        printError(`❌ Site "${customSiteId}" already exists. Please try another name.`);
        // Continue the loop to ask again
      }
    }
  }
  
  // User accepted the suggestion, but we still need to validate it's available
  return await getValidSiteId(suggestedSiteId);
}

async function getValidSiteId(suggestedId: string): Promise<string> {
  // Check if suggested ID is available
  const siteDir = join('sites/my-sites', suggestedId);
  if (!(await exists(siteDir))) {
    return suggestedId;
  }

  // If not available, prompt for alternative
  while (true) {
    const response = await prompts({
      type: 'text',
      name: 'siteId',
      message: `Site "${suggestedId}" already exists. Enter alternative site ID:`,
      initial: `${suggestedId}-2`,
      validate: (value: string) => {
        if (!value.trim()) return 'Site ID cannot be empty';
        if (value.length > 32) return `Site ID must be 32 characters or less (current: ${value.length})`;
        if (!/^[a-z_-]+$/.test(value)) return 'Site ID can only contain lowercase letters, hyphens (-), and underscores (_)';
        return true;
      }
    });

    if (!response.siteId) {
      printError('Site creation cancelled.');
      process.exit(0);
    }

    const testDir = join('sites/my-sites', response.siteId);
    if (!(await exists(testDir))) {
      return response.siteId;
    }

    printError(`Site "${response.siteId}" already exists. Please try another name.`);
  }
}

async function copyTemplateAndAssets(siteId: string): Promise<void> {
  const targetDir = join('sites/my-sites', siteId);
  const templateDir = 'sites/template-site';
  
  printInfo('📁 Copying template files...');
  
  // Ensure target directory exists
  await ensureDir(targetDir);
  
  // Copy template files
  await copyDir(templateDir, targetDir);
  
  // Copy default theme CSS
  const themeSourcePath = 'packages/blocks/styles/browse-dot-show-base-theme.css';
  const themeTargetPath = join(targetDir, 'index.css');
  
  if (await exists(themeSourcePath)) {
    const themeContent = await readTextFile(themeSourcePath);
    await writeTextFile(themeTargetPath, themeContent);
    printInfo('🎨 Copied default browse.show theme');
  }
  
  // Copy key colors CSS
  const keyColorsSourcePath = 'packages/blocks/styles/key-colors.css';
  const keyColorsTargetPath = join(targetDir, 'key-colors.css');
  
  if (await exists(keyColorsSourcePath)) {
    const keyColorsContent = await readTextFile(keyColorsSourcePath);
    await writeTextFile(keyColorsTargetPath, keyColorsContent);
    printInfo('🎨 Copied key colors CSS');
  }
  
  // Copy default assets from homepage
  const assetsSourceDir = 'packages/homepage/original-assets';
  const assetsTargetDir = join(targetDir, 'assets');
  
  if (await exists(assetsSourceDir)) {
    await ensureDir(assetsTargetDir);
    await copyDir(assetsSourceDir, assetsTargetDir);
    printInfo('🖼️  Copied default assets');
  }
  
  // Copy .env to .env.local if it doesn't exist
  const envSourcePath = '.env';
  const envLocalPath = '.env.local';
  
  if (await exists(envSourcePath) && !(await exists(envLocalPath))) {
    const envContent = await readTextFile(envSourcePath);
    await writeTextFile(envLocalPath, envContent);
    printInfo('⚙️  Copied .env to .env.local for local configuration');
  }
}

function generateSiteConfig(
  siteId: string,
  podcastName: string,
  podcastHomepage: string,
  rssUrl: string
): SiteConfig {
  const domain = `${siteId}.browse.show`;
  const rssFilename = `${siteId}.xml`;
  
  return {
    id: siteId,
    domain: domain,
    appHeader: {
      primaryTitle: podcastName,
      includeTitlePrefix: true,
      taglinePrimaryPodcastName: podcastName,
      taglinePrimaryPodcastExternalURL: podcastHomepage,
      taglineSuffix: "podcast archives"
    },
    socialAndMetadata: {
      pageTitle: `[browse.show] ${podcastName}`,
      canonicalUrl: `https://${domain}`,
      openGraphImagePath: "./assets/social-cards/open-graph-card-1200x630.jpg",
      metaDescription: `Search all episodes of the ${podcastName} podcast`,
      metaTitle: `[browse.show] ${podcastName}`
    },
    includedPodcasts: [
      {
        id: siteId,
        rssFeedFile: rssFilename,
        title: podcastName,
        status: "active",
        url: rssUrl
      }
    ],
    whisperTranscriptionPrompt: `Hi, welcome to ${podcastName}. Let's jump in!`,
    themeColor: "#734ee4",
    themeColorDark: "#2f6a9e", 
    searchPlaceholderOptions: [
      "Episode topic",
      "Guest name", 
      "Key discussion",
      "Recent episode"
    ],
    trackingScript: "<script data-goatcounter=\"https://browse-dot-show.goatcounter.com/count\" async src=\"//gc.zgo.at/count.js\"></script>"
  };
}

async function generateTerraformFiles(siteId: string): Promise<void> {
  printInfo('🏗️  Generating Terraform configuration files...');
  
  const terraformDir = join('terraform/sites', siteId);
  await ensureDir(terraformDir);
  
  // Generate backend.tf
  const backendContent = `terraform {
  backend "s3" {
    bucket = "browse-dot-show-terraform-state"
    key    = "sites/${siteId}/terraform.tfstate"
    region = "us-east-1"
    
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
`;
  
  await writeTextFile(join(terraformDir, 'backend.tf'), backendContent);
  
  // Generate variables.tf
  const variablesContent = `variable "site_id" {
  description = "Unique identifier for the site"
  type        = string
  default     = "${siteId}"
}

variable "domain_name" {
  description = "Domain name for the site"
  type        = string
  default     = "${siteId}.browse.show"
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}
`;
  
  await writeTextFile(join(terraformDir, 'variables.tf'), variablesContent);
  
  // Generate .env.example
  const envContent = `# Environment variables for ${siteId}
SITE_ID=${siteId}
DOMAIN_NAME=${siteId}.browse.show
AWS_REGION=us-east-1
ENVIRONMENT=prod

# Add your specific environment variables here
`;
  
  await writeTextFile(join(terraformDir, '.env.example'), envContent);
  
  printSuccess(`📄 Generated Terraform files in terraform/sites/${siteId}/`);
}

async function runSiteValidation(_siteId: string): Promise<boolean> {
  try {
    printInfo('🔍 Running site validation...');
    
    // Run the sites validation script
    const { stderr } = await execAsync('pnpm run validate:sites');
    
    if (stderr && !stderr.includes('warning')) {
      printWarning('Validation completed with warnings:');
      console.log(stderr);
    }
    
    printSuccess('✅ Site validation passed');
    return true;
  } catch (_error) {
    printWarning('⚠️  Site validation found issues (this is normal for new sites)');
    printInfo('You can address these after completing the setup.');
    return false;
  }
}



async function openGuide(guidePath: string): Promise<void> {
  try {
    // Try to open the guide file with the default system editor
    if (process.platform === 'darwin') {
      await execAsync(`open "${guidePath}"`);
    } else if (process.platform === 'win32') {
      await execAsync(`start "${guidePath}"`);
    } else {
      await execAsync(`xdg-open "${guidePath}"`);
    }
    printSuccess(`📖 Opened ${guidePath}`);
  } catch (_error) {
    printInfo(`📖 Please open: ${guidePath}`);
  }
}

async function main(): Promise<void> {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const isReviewMode = args.includes('--review');
  
  logInColor('green', '🎧 Welcome to the browse.show Site Creator!\n');
  
  if (isReviewMode) {
    return await handleReviewMode();
  }
  
  // Check for existing sites
  const existingSites = await getExistingSites();
  
  if (existingSites.length > 0) {
    return await handleExistingSites(existingSites);
  } else {
    return await handleNewSiteCreation();
  }
}

async function handleReviewMode(): Promise<void> {
  const existingSites = await getExistingSites();
  
  if (existingSites.length === 0) {
    printInfo('No sites found yet. Run `pnpm run site:create` to create your first site!');
    return;
  }
  
  console.log('📊 Here\'s the current status of all your podcast sites:\n');
  
  for (const siteId of existingSites) {
    const progress = await loadProgress(siteId);
    if (progress) {
      await displayProgressReview(progress);
      console.log('───────────────────────────────────────\n');
    }
  }
  
  console.log('💡 To continue setup for any site, run `pnpm run site:create` without --review');
}

async function handleExistingSites(existingSites: string[]): Promise<void> {
  if (existingSites.length === 1) {
    // Single site - continue its setup
    const siteId = existingSites[0];
    const progress = await loadProgress(siteId);
    
    if (!progress) {
      printWarning(`Could not load progress for ${siteId}. Starting fresh...`);
      return await handleNewSiteCreation();
    }
    
    printInfo(`Continuing setup for "${progress.podcastName}"`);
    return await continueProgressiveSetup(progress);
  } else {
    // Multiple sites - let user choose
    const choices = await Promise.all(
      existingSites.map(async (siteId) => {
        const progress = await loadProgress(siteId);
        const { completed, total } = progress ? calculateProgress(progress) : { completed: 0, total: 8 };
        
        return {
          title: progress ? progress.podcastName : siteId,
          description: `${completed}/${total} steps complete`,
          value: siteId
        };
      })
    );
    
    choices.push({
      title: '+ Create a new site',
      description: 'Start setup for a brand new podcast site',
      value: 'new'
    });
    
    const response = await prompts({
      type: 'select',
      name: 'selectedSite',
      message: 'Which site would you like to work on?',
      choices
    });
    
    if (!response.selectedSite) {
      printInfo('Setup cancelled.');
      return;
    }
    
    if (response.selectedSite === 'new') {
      return await handleNewSiteCreation();
    } else {
      const progress = await loadProgress(response.selectedSite);
      if (!progress) {
        printWarning(`Could not load progress for ${response.selectedSite}. Starting fresh...`);
        return await handleNewSiteCreation();
      }
      
      return await continueProgressiveSetup(progress);
    }
  }
}

async function handleNewSiteCreation(): Promise<void> {
  console.log('This quick setup will help you create a searchable podcast archive site.');
  console.log('We\'ll walk you through up to 8 phases (some are optional) - you can complete');
  console.log('them all now or come back later!\n');
  console.log('⏱️  Phase 1 takes about a minute, then you\'ll see your progress');
  console.log('   and can choose what to do next.\n');
  
  const readyResponse = await prompts({
    type: 'confirm',
    name: 'ready',
    message: 'Ready to get started?',
    initial: true
  });
  
  if (!readyResponse.ready) {
    printInfo('No problem! Run this command again when you\'re ready.');
    printInfo('');
    printInfo('💡 Helpful commands:');
    printInfo('   • `pnpm run site:create` - Start or continue setup');
    printInfo('   • `pnpm run site:create --review` - See progress on all sites');
    process.exit(0);
  }
  
  console.log('Great! Let\'s build your podcast site. 🚀\n');
  
  // Step 1: Check if using fork vs original repo
  await executeRepoForkCheck();
  
  // Step 2: Check platform compatibility
  await executePlatformSupportStep();
  
  // Step 2: Get podcast name
  const nameResponse = await prompts({
    type: 'text',
    name: 'podcastName',
    message: 'What is the name of your podcast?',
    validate: (value: string) => value.trim() ? true : 'Podcast name is required'
  });
  
  if (!nameResponse.podcastName) {
    printError('Site creation cancelled.');
    process.exit(0);
  }
  
  const podcastName = nameResponse.podcastName;
  
  // Step 3: Search for RSS feed
  printInfo('\n🔍 Searching for your podcast RSS feed...');
  const searchResults = await searchPodcastRSSFeed(podcastName);
  
  let rssUrl: string;
  let podcastHomepage: string;
  
  if (searchResults.length > 0) {
    // Present search results for confirmation
    const rssResponse = await prompts({
      type: 'select',
      name: 'selectedRss',
      message: 'Found potential RSS feeds. Please select the correct one:',
      choices: [
        ...searchResults.map((result, index) => ({
          title: result.title,
          description: result.description || result.url,
          value: index.toString()
        })),
        {
          title: 'None of these are correct',
          description: 'I will enter the RSS URL manually',
          value: 'manual'
        }
      ]
    });
    
    if (rssResponse.selectedRss === 'manual') {
      // Prompt for both RSS URL and homepage when manually entering
      const manualRssResponse = await prompts({
        type: 'text',
        name: 'rssUrl',
        message: 'Please enter the RSS feed URL:',
        validate: (value: string) => {
          if (!value.trim()) return 'RSS URL is required';
          if (!/^https?:\/\//.test(value)) return 'Please enter a valid URL starting with http:// or https://';
          return true;
        }
      });
      
      const manualHomepageResponse = await prompts({
        type: 'text',
        name: 'podcastHomepage',
        message: 'Please enter the podcast homepage URL:',
        validate: (value: string) => {
          if (!value.trim()) return 'Homepage URL is required';
          if (!/^https?:\/\//.test(value)) return 'Please enter a valid URL starting with http:// or https://';
          return true;
        }
      });
      
      rssUrl = manualRssResponse.rssUrl;
      podcastHomepage = manualHomepageResponse.podcastHomepage;
    } else {
      // Use selected result from search
      const selectedResult = searchResults[parseInt(rssResponse.selectedRss)];
      rssUrl = selectedResult.url;
      podcastHomepage = selectedResult.link || selectedResult.url; // Fallback to RSS URL if no homepage link
    }
  } else {
    // No search results, direct user to manual search
    const searchQuery = encodeURIComponent(podcastName);
    const searchUrl = `https://podcastindex.org/search?q=${searchQuery}&type=all`;
    
    printInfo('Could not automatically find RSS feed.');
    printInfo(`Please visit this URL to search for your podcast: ${searchUrl}`);
    
    const manualRssResponse = await prompts({
      type: 'text',
      name: 'rssUrl',
      message: 'Please enter the RSS feed URL from your search:',
      validate: (value: string) => {
        if (!value.trim()) return 'RSS URL is required';
        if (!/^https?:\/\//.test(value)) return 'Please enter a valid URL starting with http:// or https://';
        return true;
      }
    });
    
    const manualHomepageResponse = await prompts({
      type: 'text',
      name: 'podcastHomepage',
      message: 'Please enter the podcast homepage URL:',
      validate: (value: string) => {
        if (!value.trim()) return 'Homepage URL is required';
        if (!/^https?:\/\//.test(value)) return 'Please enter a valid URL starting with http:// or https://';
        return true;
      }
    });
    
    if (!manualRssResponse.rssUrl || !manualHomepageResponse.podcastHomepage) {
      printError('Site creation cancelled.');
      process.exit(0);
    }
    
    rssUrl = manualRssResponse.rssUrl;
    podcastHomepage = manualHomepageResponse.podcastHomepage;
  }
  
  // Step 4: Get site ID with user customization
  const siteId = await promptForSiteId(podcastName);
  
  printInfo(`\n🏗️  Creating site: ${siteId}`);
  printInfo(`📧 Domain: ${siteId}.browse.show`);
  printInfo(`📡 RSS: ${rssUrl}\n`);
  
  // Step 5: Copy template and assets
  await copyTemplateAndAssets(siteId);
  
  // Step 6: Generate site configuration
  const siteConfig = generateSiteConfig(siteId, podcastName, podcastHomepage, rssUrl);
  const configPath = join('sites/my-sites', siteId, 'site.config.json');
  await writeJsonFile(configPath, siteConfig, { spaces: 2 });
  printSuccess('📝 Generated site configuration');
  
  // Step 7: Generate Terraform files
  await generateTerraformFiles(siteId);
  
  // Step 8: Run validation
  await runSiteValidation(siteId);
  
  // Step 9: Create initial progress and mark first step complete
  const progress = createInitialProgress(siteId, podcastName);
  await saveProgress(progress);
  await updateStepStatus(siteId, 'generate-site-files', 'COMPLETED');
  
  // Step 10: Continue with progressive setup
  const updatedProgress = await loadProgress(siteId);
  if (updatedProgress) {
    await continueProgressiveSetup(updatedProgress);
  }
}

async function continueProgressiveSetup(progress: SetupProgress): Promise<void> {
  // Show current progress
  console.log('');
  const { completed, total, percentage } = calculateProgress(progress);
  console.log(`📊 Current Progress: ${createProgressBar(percentage)} (${completed}/${total} complete)`);
  console.log('');
  
  // Find next step to work on
  const nextStep = SETUP_STEPS.find(stepDef => {
    const step = progress.steps[stepDef.id];
    // If step doesn't exist in progress (new step added), treat as NOT_STARTED
    if (!step) return true;
    return step.status === 'NOT_STARTED' || step.status === 'DEFERRED';
  });
  
  if (!nextStep) {
    // All steps are either completed or skipped
    printSuccess('🎉 Congratulations! You\'ve addressed all setup steps for your podcast site!');
    console.log('');
    console.log('🚀 Your site is ready to go! Here are some helpful next steps:');
    console.log('   • Run locally: `pnpm run client:dev --filter ' + progress.siteId + '`');
    console.log('   • Review status: `pnpm run site:create --review`');
    console.log('   • Documentation: Check the docs/ folder for guides');
    console.log('');
    return;
  }
  
  // Prompt for next step
  const newStatus = await promptForStep(progress, nextStep.id);
  
  if (newStatus !== 'NOT_STARTED') {
    await updateStepStatus(progress.siteId, nextStep.id, newStatus);
    
    // If user completed a step, ask if they want to continue
    if (newStatus === 'COMPLETED') {
      console.log('');
      const continueResponse = await prompts({
        type: 'confirm',
        name: 'continue',
        message: 'Great job! Ready to tackle the next step?',
        initial: true
      });
      
      if (continueResponse.continue) {
        const updatedProgress = await loadProgress(progress.siteId);
        if (updatedProgress) {
          return await continueProgressiveSetup(updatedProgress);
        }
             } else {
         printInfo('Perfect! Run `pnpm run site:create` anytime to continue where you left off.');
         printInfo('💡 Use `pnpm run site:create --review` to see your current progress.');
       }
    } else {
      // User deferred or skipped, offer to continue
      console.log('');
      const continueResponse = await prompts({
        type: 'confirm',
        name: 'continue',
        message: 'Would you like to continue with the next step?',
        initial: false
      });
      
      if (continueResponse.continue) {
        const updatedProgress = await loadProgress(progress.siteId);
        if (updatedProgress) {
          return await continueProgressiveSetup(updatedProgress);
        }
      } else {
        printInfo('No problem! Run `pnpm run site:create` anytime to continue setup.');
      }
    }
  } else {
    printInfo('Setup paused. Run `pnpm run site:create` anytime to continue.');
  }
}

// Run the script
main().catch((error) => {
  printError('An error occurred during site creation:');
  console.error(error);
  process.exit(1);
});