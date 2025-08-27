#!/usr/bin/env tsx

import prompts from 'prompts';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Site information loaded from site configuration
 */
export interface Site {
  id: string;
  domain: string;
  title: string;
  description: string;
}

/**
 * Site selection options
 */
export interface SiteSelectionOptions {
  defaultSiteId?: string;
  skipPrompt?: boolean;
  operation?: string;
}

/**
 * Site validation result
 */
export interface SiteValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Environment variables object
 */
export interface EnvVars {
  [key: string]: string;
}

/**
 * Discovers available sites following the priority logic:
 * 1. Use sites from /sites/my-sites/ if any exist
 * 2. Otherwise use sites from /sites/origin-sites/
 */
export function discoverSites(): Site[] {
    const sitesDir = path.resolve(__dirname, '../../sites');
    const mySitesDir = path.join(sitesDir, 'my-sites');
    const originSitesDir = path.join(sitesDir, 'origin-sites');

    // Check if my-sites has any site directories
    const mySites = loadSitesFromDirectory(mySitesDir);
    
    if (mySites.length > 0) {
        console.log(`Found ${mySites.length} site(s) in my-sites/, ignoring origin-sites/`);
        return mySites;
    }

    // Fallback to origin-sites if my-sites is empty
    const originSites = loadSitesFromDirectory(originSitesDir);
    console.log(`No sites in my-sites/, using ${originSites.length} site(s) from origin-sites/`);
    return originSites;
}

/**
 * Loads sites from a specific directory
 */
function loadSitesFromDirectory(directory: string): Site[] {
    if (!fs.existsSync(directory)) {
        return [];
    }

    const sites: Site[] = [];
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'node_modules') {
            const siteDir = path.join(directory, entry.name);
            const configPath = path.join(siteDir, 'site.config.json');

            if (fs.existsSync(configPath)) {
                try {
                    const configContent = fs.readFileSync(configPath, 'utf8');
                    const siteConfig = JSON.parse(configContent);
                    
                    // Validate that site ID matches directory name
                    if (siteConfig.id !== entry.name) {
                        console.warn(`Warning: Site ID "${siteConfig.id}" doesn't match directory name "${entry.name}"`);
                    }

                    sites.push({
                        id: siteConfig.id,
                        domain: siteConfig.domain,
                        title: siteConfig.appHeader.primaryTitle,
                        description: siteConfig.socialAndMetadata.metaDescription
                    });
                } catch (error) {
                    console.error(`Error loading site config from ${configPath}:`, error);
                }
            }
        }
    }

    return sites;
}

/**
 * Validates that a site exists and has required files
 */
export function validateSite(siteId: string): SiteValidationResult {
    const sites = discoverSites();
    const site = sites.find(s => s.id === siteId);
    const errors: string[] = [];

    if (!site) {
        errors.push(`Site "${siteId}" not found`);
        return { valid: false, errors };
    }

    // Check for required files
    const siteDir = getSiteDirectory(siteId);
    if (!siteDir) {
        errors.push(`Site directory for "${siteId}" not found`);
        return { valid: false, errors };
    }

    const envAwsPath = path.join(siteDir, '.env.aws-sso');
    if (!fs.existsSync(envAwsPath)) {
        errors.push(`Missing .env.aws-sso file for site "${siteId}"`);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Gets the directory path for a specific site
 */
export function getSiteDirectory(siteId: string): string | null {
    const sitesDir = path.resolve(__dirname, '../../sites');
    const mySitesDir = path.join(sitesDir, 'my-sites', siteId);
    const originSitesDir = path.join(sitesDir, 'origin-sites', siteId);

    if (fs.existsSync(mySitesDir)) {
        return mySitesDir;
    }

    if (fs.existsSync(originSitesDir)) {
        return originSitesDir;
    }

    return null;
}

/**
 * Prompts user to select a site
 * @param options - Configuration options
 * @returns Selected site ID
 */
export async function selectSite(options: SiteSelectionOptions = {}): Promise<string> {
    const {
        defaultSiteId,
        skipPrompt = false,
        operation = 'operation'
    } = options;

    const sites = discoverSites();

    if (sites.length === 0) {
        console.error('No sites found! Please create a site in /sites/my-sites/');
        process.exit(1);
    }

    // If skip prompt is enabled and we have a default, use it
    if (skipPrompt && defaultSiteId) {
        const site = sites.find(s => s.id === defaultSiteId);
        if (site) {
            console.log(`Using default site: ${site.id} (${site.domain})`);
            return site.id;
        } else {
            console.warn(`Default site "${defaultSiteId}" not found, prompting for selection...`);
        }
    }

    // If only one site, use it
    if (sites.length === 1) {
        const site = sites[0];
        console.log(`Only one site available: ${site.id} (${site.domain})`);
        return site.id;
    }

    // Prepare choices for prompting
    const choices = sites.map(site => ({
        title: `${site.title} (${site.domain})`,
        description: site.description,
        value: site.id
    }));

    // Find initial selection index
    let initial = 0;
    if (defaultSiteId) {
        const defaultIndex = choices.findIndex(choice => choice.value === defaultSiteId);
        if (defaultIndex >= 0) {
            initial = defaultIndex;
        }
    }

    const response = await prompts({
        type: 'select',
        name: 'siteId',
        message: `Select site for ${operation}:`,
        choices,
        initial,
        hint: defaultSiteId ? `(default: ${defaultSiteId})` : undefined
    });

    if (!response.siteId) {
        console.log('Site selection cancelled.');
        process.exit(0);
    }

    return response.siteId;
}

/**
 * Loads environment variables for a specific site
 * @param siteId - Site ID
 * @param env - Environment (dev, prod, local)
 * @returns Environment variables object
 */
export function loadSiteEnvVars(siteId: string, env: string = 'dev'): EnvVars {
    const siteDir = getSiteDirectory(siteId);
    if (!siteDir) {
        throw new Error(`Site directory for "${siteId}" not found`);
    }

    const envVars: EnvVars = {};

    // Load site-specific .env.aws-sso
    const envAwsPath = path.join(siteDir, '.env.aws-sso');
    if (fs.existsSync(envAwsPath)) {
        const envContent = fs.readFileSync(envAwsPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const trimmedLine = line.trim();
            // Skip empty lines and comments
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                return;
            }
            
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
                let value = valueParts.join('='); // Handle values with '=' in them
                value = value.trim();
                // Remove surrounding quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) || 
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                envVars[key.trim()] = value;
            }
        });
    }

    // Load root env file
    const rootEnvPath = path.resolve(__dirname, '../../.env.' + env);
    
    if (fs.existsSync(rootEnvPath)) {
        const envContent = fs.readFileSync(rootEnvPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const trimmedLine = line.trim();
            // Skip empty lines and comments
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                return;
            }
            
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
                let value = valueParts.join('='); // Handle values with '=' in them
                value = value.trim();
                // Remove surrounding quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) || 
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                // Don't override site-specific values
                if (!envVars[key.trim()]) {
                    envVars[key.trim()] = value;
                }
            }
        });
    }

    return envVars;
} 