#!/usr/bin/env tsx

import { join, basename } from 'path';
import { copySync, ensureDir, exists, writeJsonFile, readJsonFile, writeTextFile, readTextFile } from './utils/file-operations.js';
import { printInfo, printSuccess, printWarning, printError } from './utils/logging.js';
// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PodcastSearchResult {
  id: string;
  title_original: string;
  rss: string;
  website?: string;
  description_original?: string;
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

function createSiteId(podcastName: string): string {
  return podcastName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

async function searchPodcastRSSFeed(podcastName: string, website?: string): Promise<PodcastSearchResult[]> {
  try {
    // Using Listen Notes API for podcast search
    // For demo purposes, we'll use their free tier endpoint
    const searchQuery = encodeURIComponent(podcastName);
    const mockUrl = `https://listen-api.listennotes.com/api/v2/search?q=${searchQuery}&type=podcast&only_in=title&safe_mode=0`;
    
    // Since we can't make actual API calls without a key in this environment,
    // we'll implement a fallback that prompts user for RSS feed
    printInfo(`Searching for "${podcastName}" podcast RSS feed...`);
    
    // TODO: Implement actual API call when API key is available
    // For now, return empty array to trigger manual input
    return [];
  } catch (error) {
    printWarning('RSS feed search failed, will prompt for manual input');
    return [];
  }
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
        if (!/^[a-z0-9-]+$/.test(value)) return 'Site ID can only contain lowercase letters, numbers, and hyphens';
        if (!/^[a-z]/.test(value)) return 'Site ID must start with a letter';
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
  copySync(templateDir, targetDir);
  
  // Copy default theme CSS
  const themeSourcePath = 'packages/blocks/styles/browse-dot-show-base-theme.css';
  const themeTargetPath = join(targetDir, 'browse-dot-show-theme.css');
  
  if (await exists(themeSourcePath)) {
    const themeContent = await readTextFile(themeSourcePath);
    await writeTextFile(themeTargetPath, themeContent);
    printInfo('🎨 Copied default browse.show theme');
  }
  
  // Copy default assets from homepage
  const assetsSourceDir = 'packages/homepage/original-assets';
  const assetsTargetDir = join(targetDir, 'assets');
  
  if (await exists(assetsSourceDir)) {
    await ensureDir(assetsTargetDir);
    copySync(assetsSourceDir, assetsTargetDir);
    printInfo('🖼️  Copied default assets');
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
# AUTH0_DOMAIN=your-auth0-domain
# AUTH0_CLIENT_ID=your-auth0-client-id
# AUTH0_CLIENT_SECRET=your-auth0-client-secret
`;
  
  await writeTextFile(join(terraformDir, '.env.example'), envContent);
  
  printSuccess(`📄 Generated Terraform files in terraform/sites/${siteId}/`);
}

async function runSiteValidation(siteId: string): Promise<boolean> {
  try {
    printInfo('🔍 Running site validation...');
    
    // Run the sites validation script
    const { stdout, stderr } = await execAsync('pnpm run validate:sites');
    
    if (stderr && !stderr.includes('warning')) {
      printWarning('Validation completed with warnings:');
      console.log(stderr);
    }
    
    printSuccess('✅ Site validation passed');
    return true;
  } catch (error) {
    printWarning('⚠️  Site validation found issues (this is normal for new sites)');
    printInfo('You can address these after completing the setup.');
    return false;
  }
}

async function presentNextSteps(): Promise<void> {
  printSuccess('\n🎉 Site created successfully!\n');
  
  const choices = [
    {
      title: '🎨 Generate custom icons for your site',
      description: 'Learn how to create custom icons and branding',
      value: 'icons'
    },
    {
      title: '🌈 Customize your color scheme',
      description: 'Create a custom theme using shadcn',
      value: 'theme'
    },
    {
      title: '🚀 View deployment guide',
      description: 'Learn how to configure SSO and deploy your site',
      value: 'deploy'
    },
    {
      title: '📁 View site configuration',
      description: 'Review and modify your site settings',
      value: 'config'
    },
    {
      title: '✅ All done for now',
      description: 'Exit the setup wizard',
      value: 'done'
    }
  ];
  
  const response = await prompts({
    type: 'select',
    name: 'nextStep',
    message: 'What would you like to do next?',
    choices: choices,
    initial: 0
  });
  
  switch (response.nextStep) {
    case 'icons':
      await openGuide('docs/custom-icons-guide.md');
      break;
    case 'theme':
      await openGuide('docs/custom-theme-guide.md');
      break;
    case 'deploy':
      await openGuide('docs/deployment-guide.md');
      break;
    case 'config':
      printInfo('Your site configuration is located at:');
      printInfo(`sites/my-sites/${response.siteId}/site.config.json`);
      break;
    case 'done':
    default:
      printSuccess('Setup complete! Happy podcasting! 🎧');
      break;
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
  } catch (error) {
    printInfo(`📖 Please open: ${guidePath}`);
  }
}

async function main(): Promise<void> {
  console.log('🎧 Welcome to the browse.show Site Creator!\n');
  
  // Step 1: Get podcast name
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
  
  // Step 2: Get podcast homepage
  const homepageResponse = await prompts({
    type: 'text',
    name: 'podcastHomepage',
    message: 'What is the homepage URL of your podcast?',
    validate: (value: string) => {
      if (!value.trim()) return 'Homepage URL is required';
      if (!/^https?:\/\//.test(value)) return 'Please enter a valid URL starting with http:// or https://';
      return true;
    }
  });
  
  if (!homepageResponse.podcastHomepage) {
    printError('Site creation cancelled.');
    process.exit(0);
  }
  
  const { podcastName, podcastHomepage } = { ...nameResponse, ...homepageResponse };
  
  // Step 3: Search for RSS feed
  printInfo('\n🔍 Searching for your podcast RSS feed...');
  const searchResults = await searchPodcastRSSFeed(podcastName, podcastHomepage);
  
  let rssUrl: string;
  
  if (searchResults.length > 0) {
    // Present search results for confirmation
    const rssResponse = await prompts({
      type: 'select',
      name: 'selectedRss',
      message: 'Found potential RSS feeds. Please select the correct one:',
      choices: [
        ...searchResults.map((result, index) => ({
          title: result.title_original,
          description: result.rss,
          value: result.rss
        })),
        {
          title: 'None of these are correct',
          description: 'I will enter the RSS URL manually',
          value: 'manual'
        }
      ]
    });
    
    if (rssResponse.selectedRss === 'manual') {
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
      rssUrl = manualRssResponse.rssUrl;
    } else {
      rssUrl = rssResponse.selectedRss;
    }
  } else {
    // No search results, prompt for manual input
    printInfo('Could not automatically find RSS feed. Please enter it manually.');
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
    
    if (!manualRssResponse.rssUrl) {
      printError('Site creation cancelled.');
      process.exit(0);
    }
    
    rssUrl = manualRssResponse.rssUrl;
  }
  
  // Step 4: Generate site ID and validate
  const suggestedSiteId = createSiteId(podcastName);
  const siteId = await getValidSiteId(suggestedSiteId);
  
  printInfo(`\n🏗️  Creating site: ${siteId}`);
  printInfo(`📧 Domain: ${siteId}.browse.show`);
  printInfo(`📡 RSS: ${rssUrl}\n`);
  
  // Step 5: Copy template and assets
  await copyTemplateAndAssets(siteId);
  
  // Step 6: Generate site configuration
  const siteConfig = generateSiteConfig(siteId, podcastName, podcastHomepage, rssUrl);
  const configPath = join('sites/my-sites', siteId, 'site.config.json');
  await writeJsonFile(configPath, siteConfig, 2);
  printSuccess('📝 Generated site configuration');
  
  // Step 7: Generate Terraform files
  await generateTerraformFiles(siteId);
  
  // Step 8: Run validation
  await runSiteValidation(siteId);
  
  // Step 9: Present next steps
  await presentNextSteps();
}

// Run the script
main().catch((error) => {
  printError('An error occurred during site creation:');
  console.error(error);
  process.exit(1);
});