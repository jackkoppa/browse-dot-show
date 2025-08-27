import { arch, platform } from 'os';
import { readJsonFile } from '../utils/file-operations.js';
import { execCommand } from '../utils/shell-exec.js';
import { printInfo, printSuccess, printWarning, printError } from '../utils/logging.js';
// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import type { PlatformSupportConfig, StepStatus } from './types.js';

// Platform support functions
export async function loadPlatformSupportConfig(): Promise<PlatformSupportConfig> {
  const configPath = 'packages/config/platform-support.json';
  return await readJsonFile<PlatformSupportConfig>(configPath);
}

export function detectCurrentPlatform(): string {
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

export function displayPlatformSupport(config: PlatformSupportConfig, platformKey: string): void {
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

export function hasLimitedSupport(config: PlatformSupportConfig, platformKey: string): boolean {
  const platform = config.platforms[platformKey];
  if (!platform) return true;
  
  const features = Object.values(platform.features);
  const nonFullSupportCount = features.filter(level => level !== 'FULL_SUPPORT').length;
  return nonFullSupportCount > 1;
}

export async function executeRepoForkCheck(): Promise<void> {
  try {
    printInfo('🔍 Checking repository setup...');
    
    // Get the git remote origin URL
    const result = await execCommand('git', ['remote', 'get-url', 'origin']);
    
    if (result.exitCode !== 0) {
      printWarning('Could not check git repository setup. Proceeding anyway...');
      printInfo('💡 If you haven\'t already, consider forking https://github.com/jackkoppa/browse-dot-show');
      return;
    }
    
    const cleanUrl = result.stdout.trim();
    
    // Check if this is the original repo
    const originalRepoUrls = [
      'https://github.com/jackkoppa/browse-dot-show',
      'https://github.com/jackkoppa/browse-dot-show.git',
      'git@github.com:jackkoppa/browse-dot-show.git'
    ];
    
    const isOriginalRepo = originalRepoUrls.some(_url => cleanUrl.includes('jackkoppa/browse-dot-show'));
    
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
    
  } catch {
    // If we can't check git remote (maybe not a git repo?), just log a warning and continue
    printWarning('Could not check git repository setup. Proceeding anyway...');
    printInfo('💡 If you haven\'t already, consider forking https://github.com/jackkoppa/browse-dot-show');
  }
}

export async function executePlatformSupportStep(): Promise<StepStatus> {
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
  } catch {
    printWarning('Could not load platform support configuration. Proceeding anyway...');
    return 'COMPLETED';
  }
} 