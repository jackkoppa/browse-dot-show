import fs from 'fs';
import path from 'path';
import { discoverSites, validateSite, getSiteDirectory, loadSitesFromDirectory } from './index.js';
import { SiteConfig } from './types.js';

interface ValidationResult {
    site_id: string;
    errors: string[];
    warnings: string[];
}

/**
 * Validates all sites and their associated configuration files
 */
export function validateAllSites(): {
    results: ValidationResult[];
    hasErrors: boolean;
    hasWarnings: boolean;
} {
    const sites = discoverSites();
    
    // Log discovery results once at the beginning
    const sitesDir = process.cwd();
    const mySitesDir = path.join(sitesDir, 'my-sites');
    const mySites = loadSitesFromDirectory(mySitesDir);
    
    if (mySites.length > 0) {
        console.log(`Found ${sites.length} site(s) in my-sites/, ignoring origin-sites/`);
    } else {
        console.log(`No sites in my-sites/, using ${sites.length} site(s) from origin-sites/`);
    }
    
    const results: ValidationResult[] = [];
    
    console.log(`🔍 Validating ${sites.length} site(s)...`);
    
    for (const site of sites) {
        const result = validateSiteConfiguration(site);
        results.push(result);
        
        if (result.errors.length > 0) {
            console.error(`❌ ${site.id}: ${result.errors.length} error(s)`);
            result.errors.forEach(error => console.error(`   - ${error}`));
        }
        
        if (result.warnings.length > 0) {
            console.warn(`⚠️  ${site.id}: ${result.warnings.length} warning(s)`);
            result.warnings.forEach(warning => console.warn(`   - ${warning}`));
        }
        
        if (result.errors.length === 0 && result.warnings.length === 0) {
            console.log(`✅ ${site.id}: All validations passed`);
        }
    }
    
    const hasErrors = results.some(r => r.errors.length > 0);
    const hasWarnings = results.some(r => r.warnings.length > 0);
    
    return { results, hasErrors, hasWarnings };
}

/**
 * Validates a single site's configuration
 */
function validateSiteConfiguration(site: SiteConfig): ValidationResult {
    const result: ValidationResult = {
        site_id: site.id,
        errors: [],
        warnings: []
    };
    
    // 1. Validate basic site structure
    const siteValidation = validateSite(site.id);
    if (!siteValidation.valid) {
        result.errors.push(...siteValidation.errors);
    }
    
    // 2. Validate site.config.json structure
    validateSiteConfigStructure(site, result);
    
    // 3. Validate .env.aws-sso file
    validateEnvAwsFile(site, result);
    
    // 4. Validate index.css file
    validateSiteStyling(site, result);

    // 5. Validate /assets directory
    validateAssetsDirectory(site, result);
    
    // 6. Validate terraform .tfvars file exists
    validateTerraformConfig(site, result);
    
    // 7. Validate color consistency across files
    validateColorConsistency(site, result);
    
    return result;
}

/**
 * Validates that site.config.json has all required fields
 */
function validateSiteConfigStructure(site: SiteConfig, result: ValidationResult): void {
    // Check required fields
    if (!site.id) {
        result.errors.push('Missing required field: id');
    } else {
        // Validate site ID length (32 character limit)
        if (site.id.length > 32) {
            result.errors.push(`Site ID "${site.id}" exceeds 32 character limit (current length: ${site.id.length})`);
        }
        
        // Validate site ID format (lowercase letters, hyphens, and underscores only)
        if (!/^[a-z_-]+$/.test(site.id)) {
            result.errors.push(`Site ID "${site.id}" can only contain lowercase letters, hyphens (-), and underscores (_). No numbers or other special characters allowed.`);
        }
        
        // Validate site ID matches directory name
        const siteDir = getSiteDirectory(site.id);
        if (siteDir) {
            const dirName = path.basename(siteDir);
            if (site.id !== dirName) {
                result.errors.push(`Site ID "${site.id}" doesn't match directory name "${dirName}"`);
            }
        }
    }
    
    if (!site.domain) {
        result.errors.push('Missing required field: domain');
    }
    
    // Validate appHeader object
    if (!site.appHeader) {
        result.errors.push('Missing required field: appHeader');
    } else {
        if (!site.appHeader.primaryTitle) {
            result.errors.push('Missing required field: appHeader.primaryTitle');
        } else if (site.appHeader.primaryTitle.length > 22) {
            result.errors.push(`appHeader.primaryTitle "${site.appHeader.primaryTitle}" exceeds 22 character limit for proper mobile header display (current length: ${site.appHeader.primaryTitle.length})`);
        }
        
        if (typeof site.appHeader.includeTitlePrefix !== 'boolean') {
            result.errors.push('Missing or invalid field: appHeader.includeTitlePrefix (must be boolean)');
        }
        
        if (!site.appHeader.taglinePrimaryPodcastName) {
            result.errors.push('Missing required field: appHeader.taglinePrimaryPodcastName');
        }
        
        if (!site.appHeader.taglinePrimaryPodcastExternalURL) {
            result.errors.push('Missing required field: appHeader.taglinePrimaryPodcastExternalURL');
        }
        
        if (!site.appHeader.taglineSuffix) {
            result.errors.push('Missing required field: appHeader.taglineSuffix');
        }
    }
    
    // Validate socialAndMetadata object
    if (!site.socialAndMetadata) {
        result.errors.push('Missing required field: socialAndMetadata');
    } else {
        if (!site.socialAndMetadata.pageTitle) {
            result.errors.push('Missing required field: socialAndMetadata.pageTitle');
        }
        
        if (!site.socialAndMetadata.canonicalUrl) {
            result.errors.push('Missing required field: socialAndMetadata.canonicalUrl');
        }
        
        if (!site.socialAndMetadata.openGraphImagePath) {
            result.errors.push('Missing required field: socialAndMetadata.openGraphImagePath');
        }
        
        if (!site.socialAndMetadata.metaDescription) {
            result.errors.push('Missing required field: socialAndMetadata.metaDescription');
        }
        
        if (!site.socialAndMetadata.metaTitle) {
            result.errors.push('Missing required field: socialAndMetadata.metaTitle');
        }
    }
    
    if (!site.whisperTranscriptionPrompt) {
        result.errors.push('Missing required field: whisperTranscriptionPrompt');
    }
    
    if (!site.themeColor) {
        result.errors.push('Missing required field: themeColor');
    }

    if (!site.themeColorDark) {
        result.errors.push('Missing required field: themeColorDark');
    }

    if (!site.searchPlaceholderOptions) {
        result.errors.push('Missing required field: searchPlaceholderOptions');
    } else if (site.searchPlaceholderOptions.length < 1) {
        result.errors.push('searchPlaceholderOptions must have at least 1 option');
    }

    // Validate trackingScript if present
    if (site.trackingScript) {
        const hasOpeningTag = site.trackingScript.includes('<script');
        const hasClosingTag = site.trackingScript.includes('</script>');
        
        if (!hasOpeningTag) {
            result.errors.push('trackingScript must contain an opening <script> tag');
        }
        if (!hasClosingTag) {
            result.errors.push('trackingScript must contain a closing </script> tag');
        }
    }

    
    if (!site.includedPodcasts || site.includedPodcasts.length === 0) {
        result.errors.push('Missing or empty includedPodcasts array');
    } else {
        // Track podcast IDs to check for duplicates
        const podcastIds = new Set<string>();
        
        // Validate each podcast
        site.includedPodcasts.forEach((podcast, index) => {
            if (!podcast.id) {
                result.errors.push(`Podcast ${index}: Missing required field: id`);
            } else {
                // Validate podcast ID length (64 character limit)
                if (podcast.id.length > 64) {
                    result.errors.push(`Podcast ${index}: ID "${podcast.id}" exceeds 64 character limit (current length: ${podcast.id.length})`);
                }
                
                // Validate podcast ID format (lowercase letters, hyphens, and underscores only)
                if (!/^[a-z_-]+$/.test(podcast.id)) {
                    result.errors.push(`Podcast ${index}: ID "${podcast.id}" can only contain lowercase letters, hyphens (-), and underscores (_). No numbers or other special characters allowed.`);
                }
                
                // Validate podcast ID doesn't match site ID (they should be different)
                if (podcast.id === site.id) {
                    result.errors.push(`Podcast ${index}: ID "${podcast.id}" cannot be the same as site ID "${site.id}". Podcast IDs should be distinct from site IDs.`);
                }
                
                // Check for duplicate podcast IDs
                if (podcastIds.has(podcast.id)) {
                    result.errors.push(`Podcast ${index}: Duplicate podcast ID "${podcast.id}". Each podcast must have a unique ID.`);
                } else {
                    podcastIds.add(podcast.id);
                }
            }
            if (!podcast.title) {
                result.errors.push(`Podcast ${index}: Missing required field: title`);
            }
            if (!podcast.url) {
                result.errors.push(`Podcast ${index}: Missing required field: url`);
            }
            if (!podcast.rssFeedFile) {
                result.errors.push(`Podcast ${index}: Missing required field: rssFeedFile`);
            }
            if (!['active', 'inactive'].includes(podcast.status)) {
                result.errors.push(`Podcast ${index}: Invalid status. Must be 'active' or 'inactive'`);
            }
        });
    }
}

/**
 * Validates .env.aws-sso file exists and has proper structure
 */
function validateEnvAwsFile(site: SiteConfig, result: ValidationResult): void {
    const siteDir = getSiteDirectory(site.id);
    if (!siteDir) {
        result.errors.push('.env.aws-sso validation skipped - site directory not found');
        return;
    }
    
    const envAwsPath = path.join(siteDir, '.env.aws-sso');
    if (!fs.existsSync(envAwsPath)) {
        result.errors.push('Missing .env.aws-sso file');
        return;
    }
    
    try {
        const envContent = fs.readFileSync(envAwsPath, 'utf8');
        const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        
        const hasAwsProfile = lines.some(line => line.startsWith('AWS_PROFILE='));
        if (!hasAwsProfile) {
            result.errors.push('.env.aws-sso file missing AWS_PROFILE setting');
        }
        
        // TODO: Validate that AWS_PROFILE is configured in AWS CLI
        // This would require running `aws configure list-profiles` and checking
        
    } catch (error) {
        result.errors.push(`Error reading .env.aws-sso file: ${error}`);
    }
}

/**
 * Validates site has styling configuration
 */
function validateSiteStyling(site: SiteConfig, result: ValidationResult): void {
    const siteDir = getSiteDirectory(site.id);
    if (!siteDir) {
        result.warnings.push('Styling validation skipped - site directory not found');
        return;
    }
    
    const cssPath = path.join(siteDir, 'index.css');
    if (!fs.existsSync(cssPath)) {
        result.warnings.push('Missing index.css file for site-specific styling');
    }
}

/**
 * Validates that /assets directory contains all required files
 */
function validateAssetsDirectory(site: SiteConfig, result: ValidationResult): void {
    const siteDir = getSiteDirectory(site.id);
    if (!siteDir) {
        result.warnings.push('Assets validation skipped - site directory not found');
        return;
    }
    
    const assetsDir = path.join(siteDir, 'assets');
    
    // Define expected asset files
    const requiredAssetFiles = [
        'apple-touch-icon.png',
        'favicon-96x96.png', 
        'favicon.ico',
        'favicon.svg',
        'site.webmanifest',
        'web-app-manifest-192x192.png',
        'web-app-manifest-512x512.png'
    ];
    
    // Define expected directories
    const expectedDirectories = ['social-cards'];
    
    // Check if assets directory exists
    if (!fs.existsSync(assetsDir)) {
        result.warnings.push('Missing /assets directory');
        result.warnings.push(`Expected assets directory at: ${assetsDir}`);
        result.warnings.push(`Should contain files: ${requiredAssetFiles.join(', ')}`);
        result.warnings.push(`Should contain directories: ${expectedDirectories.join(', ')}`);
        return;
    }
    
    // Check each required file
    const missingFiles: string[] = [];
    for (const fileName of requiredAssetFiles) {
        const filePath = path.join(assetsDir, fileName);
        if (!fs.existsSync(filePath)) {
            missingFiles.push(fileName);
        }
    }
    
    if (missingFiles.length > 0) {
        result.warnings.push(`Missing asset files: ${missingFiles.join(', ')}`);
    }
    
    // Validate social-cards directory and its contents
    const socialCardsDir = path.join(assetsDir, 'social-cards');
    if (!fs.existsSync(socialCardsDir)) {
        result.warnings.push('Missing social-cards directory in /assets');
    } else {
        // Check for required open graph image (allow either .jpg or .png)
        const openGraphJpgPath = path.join(socialCardsDir, 'open-graph-card-1200x630.jpg');
        const openGraphPngPath = path.join(socialCardsDir, 'open-graph-card-1200x630.png');
        
        const hasJpg = fs.existsSync(openGraphJpgPath);
        const hasPng = fs.existsSync(openGraphPngPath);
        
        if (!hasJpg && !hasPng) {
            result.warnings.push('Missing open-graph-card-1200x630.jpg or open-graph-card-1200x630.png in /assets/social-cards');
        }
        
        // Validate that site config openGraphImagePath matches an existing file
        if (site.socialAndMetadata?.openGraphImagePath) {
            if (site.socialAndMetadata.openGraphImagePath === 'TO_BE_ADDED') {
                result.warnings.push('Site config openGraphImagePath needs to be updated from "TO_BE_ADDED"');
            } else {
                // Extract the filename from the config path
                const configPath = site.socialAndMetadata.openGraphImagePath;
                const configFilename = path.basename(configPath);
                
                // Check if the specified file exists
                const specifiedFilePath = path.join(socialCardsDir, configFilename);
                if (!fs.existsSync(specifiedFilePath)) {
                    result.warnings.push(`Site config openGraphImagePath points to "${configPath}", but file does not exist at ${specifiedFilePath}`);
                }
                
                // Validate the path format is correct
                const expectedJpgPath = './assets/social-cards/open-graph-card-1200x630.jpg';
                const expectedPngPath = './assets/social-cards/open-graph-card-1200x630.png';
                
                if (configPath !== expectedJpgPath && configPath !== expectedPngPath) {
                    const suggestion = hasJpg ? expectedJpgPath : (hasPng ? expectedPngPath : expectedJpgPath);
                    result.warnings.push(`Site config openGraphImagePath should be "${suggestion}", but is "${configPath}"`);
                }
            }
        }
    }
    
    // Check for unexpected files (files that exist but aren't in our expected list)
    try {
        const actualItems = fs.readdirSync(assetsDir);
        const allowedItems = [...requiredAssetFiles, ...expectedDirectories];
        const unexpectedItems = actualItems.filter(item => !allowedItems.includes(item));
        
        if (unexpectedItems.length > 0) {
            result.warnings.push(`Unexpected files/directories in /assets directory: ${unexpectedItems.join(', ')}`);
        }
    } catch (error) {
        result.warnings.push(`Error reading /assets directory: ${error}`);
    }
}

/**
 * Validates that corresponding terraform .tfvars file exists
 */
function validateTerraformConfig(site: SiteConfig, result: ValidationResult): void {
    // Check for terraform configuration in new location
    const siteDir = getSiteDirectory(site.id);
    if (!siteDir) {
        result.errors.push(`Site directory not found for ${site.id}`);
        return;
    }
    const tfvarsPath = path.join(siteDir, 'terraform', 'prod.tfvars');
    const backendPath = path.join(siteDir, 'terraform', 'backend.tfbackend');
    
    if (!fs.existsSync(tfvarsPath)) {
        result.errors.push(`Missing terraform configuration: prod.tfvars not found in ${site.id}/terraform/ (looked in: ${tfvarsPath})`);
        return;
    }
    
    if (!fs.existsSync(backendPath)) {
        result.errors.push(`Missing terraform backend config: backend.tfbackend not found in ${site.id}/terraform/ (looked in: ${backendPath})`);
        return;
    }
    
    try {
        const tfvarsContent = fs.readFileSync(tfvarsPath, 'utf8');
        
        // Validate that site_id matches in tfvars
        const siteIdMatch = tfvarsContent.match(/site_id\s*=\s*"([^"]+)"/);
        if (!siteIdMatch) {
            result.errors.push('terraform .tfvars file missing site_id variable');
        } else if (siteIdMatch[1] !== site.id) {
            result.errors.push(`terraform .tfvars site_id (${siteIdMatch[1]}) doesn't match site config id (${site.id})`);
        }
        
        // Check for required terraform variables
        const requiredVars = ['aws_region', 's3_bucket_name', 'custom_domain_name'];
        requiredVars.forEach(varName => {
            if (!tfvarsContent.includes(varName)) {
                result.warnings.push(`terraform .tfvars missing recommended variable: ${varName}`);
            }
        });
        
    } catch (error) {
        result.errors.push(`Error reading terraform .tfvars file: ${error}`);
    }
}

/**
 * Validates color consistency across index.css, key-colors.css, and site.webmanifest
 * Ensures each site uses at most 2 unique colors across all 6 properties
 */
function validateColorConsistency(site: SiteConfig, result: ValidationResult): void {
    const siteDir = getSiteDirectory(site.id);
    if (!siteDir) {
        result.warnings.push('Color validation skipped - site directory not found');
        return;
    }
    
    const normalizeColor = (color: string) => color.toLowerCase();
    const foundProperties: { [key: string]: string } = {};
    
    // 1. Extract colors from index.css
    const indexCssPath = path.join(siteDir, 'index.css');
    if (fs.existsSync(indexCssPath)) {
        try {
            const cssContent = fs.readFileSync(indexCssPath, 'utf8');
            
            // Extract --primary color
            const primaryMatch = cssContent.match(/--primary:\s*(#[a-fA-F0-9]{6})/);
            if (primaryMatch) {
                foundProperties['--primary (index.css)'] = primaryMatch[1];
            }
            
            // Extract --secondary color
            const secondaryMatch = cssContent.match(/--secondary:\s*(#[a-fA-F0-9]{6})/);
            if (secondaryMatch) {
                foundProperties['--secondary (index.css)'] = secondaryMatch[1];
            }
        } catch (error) {
            result.warnings.push(`Error reading index.css for color validation: ${error}`);
        }
    }
    
    // 2. Extract colors from key-colors.css
    const keyColorsCssPath = path.join(siteDir, 'key-colors.css');
    if (fs.existsSync(keyColorsCssPath)) {
        try {
            const cssContent = fs.readFileSync(keyColorsCssPath, 'utf8');
            
            // Extract --browse-dot-show-theme-light color
            const lightMatch = cssContent.match(/--browse-dot-show-theme-light:\s*(#[a-fA-F0-9]{6})/);
            if (lightMatch) {
                foundProperties['--browse-dot-show-theme-light (key-colors.css)'] = lightMatch[1];
            }
            
            // Extract --browse-dot-show-theme-dark color
            const darkMatch = cssContent.match(/--browse-dot-show-theme-dark:\s*(#[a-fA-F0-9]{6})/);
            if (darkMatch) {
                foundProperties['--browse-dot-show-theme-dark (key-colors.css)'] = darkMatch[1];
            }
        } catch (error) {
            result.warnings.push(`Error reading key-colors.css for color validation: ${error}`);
        }
    }
    
    // 3. Extract colors from site.webmanifest
    const webmanifestPath = path.join(siteDir, 'assets', 'site.webmanifest');
    if (fs.existsSync(webmanifestPath)) {
        try {
            const manifestContent = fs.readFileSync(webmanifestPath, 'utf8');
            const manifest = JSON.parse(manifestContent);
            
            // Extract theme_color
            if (manifest.theme_color) {
                foundProperties['theme_color (site.webmanifest)'] = manifest.theme_color;
            }
            
            // Extract background_color
            if (manifest.background_color) {
                foundProperties['background_color (site.webmanifest)'] = manifest.background_color;
            }
        } catch (error) {
            result.warnings.push(`Error reading site.webmanifest for color validation: ${error}`);
        }
    }
    
    // Count unique colors (case-insensitive)
    const uniqueColors = new Set();
    for (const color of Object.values(foundProperties)) {
        uniqueColors.add(normalizeColor(color));
    }
    
    // Check if more than 3 unique colors are used
    if (uniqueColors.size > 3) {
        result.errors.push(`Site uses ${uniqueColors.size} unique colors, but only 3 are allowed. Found:`);
        
        // Group properties by color for better error reporting
        const colorGroups: { [color: string]: string[] } = {};
        for (const [property, color] of Object.entries(foundProperties)) {
            const normalizedColor = normalizeColor(color);
            if (!colorGroups[normalizedColor]) {
                colorGroups[normalizedColor] = [];
            }
            colorGroups[normalizedColor].push(`${property}: ${color}`);
        }
        
        // List all colors and which properties use them
        for (const [color, properties] of Object.entries(colorGroups)) {
            result.errors.push(`  Color ${color}:`);
            for (const property of properties) {
                result.errors.push(`    - ${property}`);
            }
        }
    }
}

/**
 * CLI entry point for site validation
 */
if (import.meta.url === `file://${process.argv[1]}`) {
    const { results, hasErrors, hasWarnings } = validateAllSites();
    
    console.log('\n📊 Validation Summary:');
    console.log(`   Sites: ${results.length}`);
    console.log(`   Errors: ${results.reduce((sum, r) => sum + r.errors.length, 0)}`);
    console.log(`   Warnings: ${results.reduce((sum, r) => sum + r.warnings.length, 0)}`);
    
    if (hasErrors) {
        console.log('\n❌ Validation failed with errors');
        process.exit(1);
    } else if (hasWarnings) {
        console.log('\n⚠️  Validation completed with warnings');
        process.exit(0);
    } else {
        console.log('\n✅ All validations passed');
        process.exit(0);
    }
}


