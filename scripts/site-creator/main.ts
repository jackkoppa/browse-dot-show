#!/usr/bin/env tsx

import { join } from 'path';
import { writeJsonFile } from '../utils/file-operations.js';
import { printInfo, printSuccess, logInColor } from '../utils/logging.js';
// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import { 
  loadProgress, 
  saveProgress,
  createInitialProgress, 
  updateStepStatus, 
  calculateProgress, 
  createProgressBar,
  displayProgressReview,
  SETUP_STEPS
} from './setup-steps.js';
import { executeRepoForkCheck, executePlatformSupportStep } from './platform-support.js';
import { searchPodcastRSSFeed, promptForSiteId, generateSiteConfig } from './podcast-search.js';
import { getExistingSites, copyTemplateAndAssets, runSiteValidation } from './site-operations.js';
import { executeStep } from './step-executors.js';
import type { SetupProgress, StepStatus } from './types.js';

// Track steps deferred in current session to avoid infinite loops
const sessionDeferredSteps = new Set<string>();

export async function main(): Promise<void> {
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
      printInfo(`Could not load progress for ${siteId}. Starting fresh...`);
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
        printInfo(`Could not load progress for ${response.selectedSite}. Starting fresh...`);
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
  
  // Step 3: Get podcast name
  const nameResponse = await prompts({
    type: 'text',
    name: 'podcastName',
    message: 'What is the name of your podcast?',
    validate: (value: string) => value.trim() ? true : 'Podcast name is required'
  });
  
  if (!nameResponse.podcastName) {
    printInfo('Site creation cancelled.');
    process.exit(0);
  }
  
  const podcastName = nameResponse.podcastName;
  
  // Step 4: Search for RSS feed
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
      printInfo('Site creation cancelled.');
      process.exit(0);
    }
    
    rssUrl = manualRssResponse.rssUrl;
    podcastHomepage = manualHomepageResponse.podcastHomepage;
  }
  
  // Step 5: Get site ID with user customization
  const siteId = await promptForSiteId(podcastName);
  
  printInfo(`\n🏗️  Creating site: ${siteId}`);
  printInfo(`📧 Domain: ${siteId}.browse.show`);
  printInfo(`📡 RSS: ${rssUrl}\n`);
  
  // Step 6: Copy template and assets
  await copyTemplateAndAssets(siteId);
  
  // Step 7: Generate site configuration
  const siteConfig = generateSiteConfig(siteId, podcastName, podcastHomepage, rssUrl);
  const configPath = join('sites/my-sites', siteId, 'site.config.json');
  await writeJsonFile(configPath, siteConfig, { spaces: 2 });
  printSuccess('📝 Generated site configuration');
  
  // Step 8: Run validation
  await runSiteValidation(siteId);
  
  // Step 9: Create initial progress and mark first step complete
  const progress = createInitialProgress(siteId, podcastName);
  await saveProgress(progress); // Save the initial progress before updating
  await updateStepStatus(siteId, 'generate-site-files', 'COMPLETED');
  
  // Step 10: Continue with progressive setup
  const updatedProgress = await loadProgress(siteId);
  if (updatedProgress) {
    await continueProgressiveSetup(updatedProgress);
  }
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
    
    // Skip steps that were deferred in this session (to avoid infinite loops)
    if (step.status === 'DEFERRED' && sessionDeferredSteps.has(stepDef.id)) {
      return false;
    }
    
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
    
    // Track deferred steps in current session
    if (newStatus === 'DEFERRED') {
      sessionDeferredSteps.add(nextStep.id);
    }
    
    // If user completed a step, clear session deferred tracking and ask if they want to continue
    if (newStatus === 'COMPLETED') {
      // Clear deferred tracking since completing a step means user is ready to tackle more
      sessionDeferredSteps.clear();
      
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

// Run the script if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('An error occurred during site creation:');
    console.error(error);
    process.exit(1);
  });
} 