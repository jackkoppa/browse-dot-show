// CURSOR-TODO: Add linting for sites, to confirm things like:
// - all site.config.json files contain all required fields from the SiteConfig interface, in ./types.ts
// - all sites have valide .env.aws files
//    - for all AWS_PROFILE .env.aws values, confirm that SSO is configured for that profile via AWS CLI
// - all sites have a valid index.css file

import fs from 'fs';
import path from 'path';
import { discoverSites, validateSite, getSiteDirectory } from './index.js';
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
    
    // 3. Validate .env.aws file
    validateEnvAwsFile(site, result);
    
    // 4. Validate index.css file
    validateSiteStyling(site, result);
    
    // 5. Validate terraform .tfvars file exists
    validateTerraformConfig(site, result);
    
    return result;
}

/**
 * Validates that site.config.json has all required fields
 */
function validateSiteConfigStructure(site: SiteConfig, result: ValidationResult): void {
    // Check required fields
    if (!site.id) {
        result.errors.push('Missing required field: id');
    }
    
    if (!site.domain) {
        result.errors.push('Missing required field: domain');
    }
    
    if (!site.shortTitle) {
        result.errors.push('Missing required field: shortTitle');
    }
    
    if (!site.fullTitle) {
        result.errors.push('Missing required field: fullTitle');
    }
    
    if (!site.description) {
        result.errors.push('Missing required field: description');
    }
    
    if (!site.includedPodcasts || site.includedPodcasts.length === 0) {
        result.errors.push('Missing or empty includedPodcasts array');
    } else {
        // Validate each podcast
        site.includedPodcasts.forEach((podcast, index) => {
            if (!podcast.id) {
                result.errors.push(`Podcast ${index}: Missing required field: id`);
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
 * Validates .env.aws file exists and has proper structure
 */
function validateEnvAwsFile(site: SiteConfig, result: ValidationResult): void {
    const siteDir = getSiteDirectory(site.id);
    if (!siteDir) {
        result.errors.push('.env.aws validation skipped - site directory not found');
        return;
    }
    
    const envAwsPath = path.join(siteDir, '.env.aws');
    if (!fs.existsSync(envAwsPath)) {
        result.errors.push('Missing .env.aws file');
        return;
    }
    
    try {
        const envContent = fs.readFileSync(envAwsPath, 'utf8');
        const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        
        const hasAwsProfile = lines.some(line => line.startsWith('AWS_PROFILE='));
        if (!hasAwsProfile) {
            result.errors.push('.env.aws file missing AWS_PROFILE setting');
        }
        
        // TODO: Validate that AWS_PROFILE is configured in AWS CLI
        // This would require running `aws configure list-profiles` and checking
        
    } catch (error) {
        result.errors.push(`Error reading .env.aws file: ${error}`);
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
 * Validates that corresponding terraform .tfvars file exists
 */
function validateTerraformConfig(site: SiteConfig, result: ValidationResult): void {
    // Find terraform directory - go up one level from sites directory to workspace root
    const workspaceRoot = path.resolve(process.cwd(), '..');
    const terraformDir = path.join(workspaceRoot, 'terraform', 'environments');
    const tfvarsPath = path.join(terraformDir, `${site.id}-prod.tfvars`);
    
    if (!fs.existsSync(tfvarsPath)) {
        result.errors.push(`Missing terraform configuration: ${site.id}-prod.tfvars not found in terraform/environments/ (looked in: ${tfvarsPath})`);
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


