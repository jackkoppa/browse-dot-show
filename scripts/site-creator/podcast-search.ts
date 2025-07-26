import { join } from 'path';
import { exists } from '../utils/file-operations.js';
import { printInfo, printSuccess, printWarning, printError } from '../utils/logging.js';
// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import type { PodcastSearchResult, PodcastIndexResponse, SiteConfig } from './types.js';

export async function searchPodcastRSSFeed(podcastName: string): Promise<PodcastSearchResult[]> {
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

export function createSiteId(podcastName: string): string {
  return podcastName
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '') // Remove numbers and special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

export function createPodcastId(podcastName: string, siteId: string): string {
  let podcastId = podcastName
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '') // Remove numbers and special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  
  // If podcast ID matches site ID, add -podcast suffix to differentiate
  if (podcastId === siteId) {
    podcastId = `${podcastId}-podcast`;
  }
  
  return podcastId;
}

export async function promptForSiteId(podcastName: string): Promise<string> {
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

export function generateSiteConfig(
  siteId: string,
  podcastName: string,
  podcastHomepage: string,
  rssUrl: string
): SiteConfig {
  const domain = `${siteId}.browse.show`;
  const rssFilename = `${siteId}.xml`;
  const podcastId = createPodcastId(podcastName, siteId);
  
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
        id: podcastId,
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