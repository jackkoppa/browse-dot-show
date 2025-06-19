#!/usr/bin/env tsx

import { readdir, mkdir, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { execCommand } from './utils/shell-exec.js';
import { ensureDir, exists, writeTextFile } from './utils/file-operations.js';
import { printInfo, printSuccess, printWarning, printError, promptUser } from './utils/logging.js';

interface SiteConfig {
  siteId: string;
  domain: string;
  shortTitle: string;
  fullTitle: string;
  description: string;
  podcastTitle: string;
  rssFilename: string;
  rssUrl: string;
  awsProfile: string;
  awsRegion: string;
}

function validateSiteId(siteId: string): { isValid: boolean; error?: string } {
  // Check if empty
  if (!siteId.trim()) {
    return { isValid: false, error: 'Site ID cannot be empty' };
  }

  // Check if contains only lowercase, numbers, and hyphens
  if (!/^[a-z0-9-]+$/.test(siteId)) {
    return { isValid: false, error: 'Site ID can only contain lowercase letters, numbers, and hyphens' };
  }

  // Check if starts with letter
  if (!/^[a-z]/.test(siteId)) {
    return { isValid: false, error: 'Site ID must start with a letter' };
  }

  return { isValid: true };
}

async function validateSiteIdUnique(siteId: string): Promise<{ isValid: boolean; error?: string }> {
  // Check if directory already exists
  const siteDir = join('sites/my-sites', siteId);
  if (await exists(siteDir)) {
    return { isValid: false, error: `Site directory already exists: ${siteDir}` };
  }

  return { isValid: true };
}

function validateDomain(domain: string): { isValid: boolean; error?: string } {
  if (!domain.trim()) {
    return { isValid: false, error: 'Domain cannot be empty' };
  }

  // Basic domain validation
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    return { isValid: false, error: 'Please enter a valid domain (e.g., example.com or my-site.browse.show)' };
  }

  return { isValid: true };
}

function validateRssUrl(url: string): { isValid: boolean; error?: string } {
  if (!url.trim()) {
    return { isValid: false, error: 'RSS URL cannot be empty' };
  }

  if (!/^https?:\/\//.test(url)) {
    return { isValid: false, error: 'RSS URL must start with http:// or https://' };
  }

  return { isValid: true };
}



async function getValidSiteId(): Promise<string> {
  while (true) {
    const siteId = await promptUser('Enter your site ID (lowercase, hyphens only): ');
    
    const basicValidation = validateSiteId(siteId);
    if (!basicValidation.isValid) {
      printError(basicValidation.error!);
      console.log();
      continue;
    }

    const uniqueValidation = await validateSiteIdUnique(siteId);
    if (!uniqueValidation.isValid) {
      printError(uniqueValidation.error!);
      console.log();
      continue;
    }

    return siteId;
  }
}

async function getValidDomain(): Promise<string> {
  while (true) {
    const domain = await promptUser('Enter your domain (e.g., my-podcast.browse.show): ');
    
    const validation = validateDomain(domain);
    if (!validation.isValid) {
      printError(validation.error!);
      console.log();
      continue;
    }

    return domain;
  }
}

async function getValidRssUrl(): Promise<string> {
  while (true) {
    const rssUrl = await promptUser('Enter RSS feed URL: ');
    
    const validation = validateRssUrl(rssUrl);
    if (!validation.isValid) {
      printError(validation.error!);
      console.log();
      continue;
    }

    return rssUrl;
  }
}

function createPodcastId(podcastTitle: string): string {
  return podcastTitle
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function createSiteConfigFile(siteDir: string, config: SiteConfig): Promise<void> {
  const podcastId = createPodcastId(config.podcastTitle);
  
  const siteConfigContent = {
    id: config.siteId,
    domain: config.domain,
    shortTitle: config.shortTitle,
    fullTitle: config.fullTitle,
    description: config.description,
    includedPodcasts: [
      {
        id: podcastId,
        rssFeedFile: config.rssFilename,
        title: config.podcastTitle,
        status: 'active',
        url: config.rssUrl
      }
    ]
  };

  const configPath = join(siteDir, 'site.config.json');
  await writeTextFile(configPath, JSON.stringify(siteConfigContent, null, 4));
}

async function createEnvAwsSsoFile(siteDir: string, config: SiteConfig): Promise<void> {
  const envContent = `# AWS Configuration for ${config.siteId}
AWS_PROFILE=${config.awsProfile}
AWS_REGION=${config.awsRegion}
`;

  const envPath = join(siteDir, '.env.aws-sso');
  await writeTextFile(envPath, envContent);
}

async function copyOptionalFiles(siteDir: string): Promise<void> {
  const exampleCssPath = 'sites/my-sites/example-site/index.css';
  if (await exists(exampleCssPath)) {
    printInfo('Copying example CSS file (optional)');
    // Read and write the CSS file
    const { readFile } = await import('fs/promises');
    const cssContent = await readFile(exampleCssPath, 'utf-8');
    await writeTextFile(join(siteDir, 'index.css'), cssContent);
  }
}

async function main(): Promise<void> {
  // Setup stdin for interactive mode
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  try {
    console.log();
    printInfo('🚀 Welcome to the Browse.Show Site Creator!');
    console.log();
    printInfo('This script will help you create a new podcast archive site.');
    printInfo('You\'ll need:');
    printInfo('  - A unique site ID (used for AWS resources)');
    printInfo('  - A domain name for your site');
    printInfo('  - RSS feed URL(s) for the podcast(s) you want to archive');
    printInfo('  - AWS profile configured for deployment');
    console.log();

    // Check if we're in the right directory
    if (!(await exists('package.json')) || !(await exists('sites'))) {
      printError('This script must be run from the root directory of the browse-dot-show repository');
      process.exit(1);
    }

    // Create my-sites directory if it doesn't exist
    await ensureDir('sites/my-sites');

    // Collect site configuration
    const siteId = await getValidSiteId();
    console.log();

    const domain = await getValidDomain();
    console.log();

    const shortTitle = await promptUser('Enter short title for your site: ');
    const fullTitle = await promptUser('Enter full title for your site: ');
    const description = await promptUser('Enter description for your site: ');

    const podcastTitle = await promptUser('Enter podcast title: ');
    const rssFilename = await promptUser('Enter RSS feed filename (e.g., my-podcast.xml): ');

    const rssUrl = await getValidRssUrl();
    console.log();

    const awsProfile = await promptUser('Enter your AWS profile name (from ~/.aws/config): ');
    const awsRegionInput = await promptUser('Enter AWS region (press Enter for us-east-1): ');
    const awsRegion = awsRegionInput.trim() || 'us-east-1';

    const config: SiteConfig = {
      siteId,
      domain,
      shortTitle,
      fullTitle,
      description,
      podcastTitle,
      rssFilename,
      rssUrl,
      awsProfile,
      awsRegion
    };

    console.log();
    printInfo('Creating site with the following configuration:');
    console.log(`  Site ID: ${config.siteId}`);
    console.log(`  Domain: ${config.domain}`);
    console.log(`  Short Title: ${config.shortTitle}`);
    console.log(`  Full Title: ${config.fullTitle}`);
    console.log(`  Description: ${config.description}`);
    console.log(`  Podcast Title: ${config.podcastTitle}`);
    console.log(`  RSS Filename: ${config.rssFilename}`);
    console.log(`  RSS URL: ${config.rssUrl}`);
    console.log(`  AWS Profile: ${config.awsProfile}`);
    console.log(`  AWS Region: ${config.awsRegion}`);
    console.log();

    const confirm = await promptUser('Continue? (y/N): ');
    if (!/^[Yy]$/.test(confirm)) {
      printInfo('Site creation cancelled.');
      process.exit(0);
    }

    // Create site directory
    const siteDir = join('sites/my-sites', config.siteId);
    printInfo(`Creating site directory: ${siteDir}`);
    await ensureDir(siteDir);

    // Create site.config.json
    printInfo('Creating site.config.json');
    await createSiteConfigFile(siteDir, config);

    // Create .env.aws-sso
    printInfo('Creating .env.aws-sso');
    await createEnvAwsSsoFile(siteDir, config);

    // Copy optional files
    await copyOptionalFiles(siteDir);

    printSuccess('✅ Site created successfully!');
    console.log();
    printInfo('Next steps:');
    console.log('  1. Review your configuration in: ' + siteDir + '/');
    console.log('  2. Set up local directories: pnpm setup:site-directories');
    console.log('  3. Test locally: pnpm client:dev');
    console.log('  4. Deploy to AWS: pnpm all:deploy');
    console.log();
    printInfo(`Your site will be available at: https://${config.domain}`);
    console.log();
    printWarning('Note: Make sure your AWS profile has the necessary permissions!');
    printWarning('DNS configuration for your domain is required for production deployment.');
    console.log();

  } catch (error) {
    printError(`Site creation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nSite creation cancelled...');
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
});

main(); 