import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SiteConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to find the workspace root by looking for package.json
function findWorkspaceRoot(): string {
    let currentDir = __dirname;
    
    while (currentDir !== path.dirname(currentDir)) {
        const packageJsonPath = path.join(currentDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                // Check if this looks like the root package.json
                if (packageJson.name === 'browse-dot-show' && packageJson.private === true) {
                    return currentDir;
                }
            } catch (error) {
                // Continue searching if we can't read the package.json
            }
        }
        currentDir = path.dirname(currentDir);
    }
    
    // Fallback: assume sites directory is a sibling of this directory
    return path.dirname(__dirname);
}

/**
 * Discovers and loads all available sites.
 * Prioritizes /sites/my-sites/ over /sites/origin-sites/
 * If my-sites has any sites, origin-sites are ignored completely.
 */
export function discoverSites(): SiteConfig[] {
    // Find workspace root and navigate to sites directory
    const workspaceRoot = findWorkspaceRoot();
    const sitesDir = path.join(workspaceRoot, 'sites');
    const mySitesDir = path.join(sitesDir, 'my-sites');
    const originSitesDir = path.join(sitesDir, 'origin-sites');

    // Check if my-sites has any site directories
    const mySites = loadSitesFromDirectory(mySitesDir);
    
    if (mySites.length > 0) {
        return mySites;
    }

    // Fallback to origin-sites if my-sites is empty
    const originSites = loadSitesFromDirectory(originSitesDir);
    return originSites;
}

/**
 * Loads sites from a specific directory
 */
export function loadSitesFromDirectory(directory: string): SiteConfig[] {
    if (!fs.existsSync(directory)) {
        return [];
    }

    const sites: SiteConfig[] = [];
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'node_modules') {
            const siteDir = path.join(directory, entry.name);
            const configPath = path.join(siteDir, 'site.config.json');

            if (fs.existsSync(configPath)) {
                try {
                    const configContent = fs.readFileSync(configPath, 'utf8');
                    const siteConfig: SiteConfig = JSON.parse(configContent);
                    
                    // Validate that site ID matches directory name
                    if (siteConfig.id !== entry.name) {
                        console.warn(`Warning: Site ID "${siteConfig.id}" doesn't match directory name "${entry.name}"`);
                    }

                    sites.push(siteConfig);
                } catch (error) {
                    console.error(`Error loading site config from ${configPath}:`, error);
                }
            }
        }
    }

    return sites;
}

/**
 * Gets a specific site by ID
 */
export function getSiteById(siteId: string): SiteConfig | null {
    const sites = discoverSites();
    return sites.find(site => site.id === siteId) || null;
}

/**
 * Gets all available site IDs
 */
export function getAvailableSiteIds(): string[] {
    return discoverSites().map(site => site.id);
}

/**
 * Validates that a site exists and has required files
 */
export function validateSite(siteId: string): { valid: boolean; errors: string[] } {
    const site = getSiteById(siteId);
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

    const envAwsPath = path.join(siteDir, '.env.aws');
    if (!fs.existsSync(envAwsPath)) {
        errors.push(`Missing .env.aws file for site "${siteId}"`);
    }

    // Validate site config structure
    if (!site.domain) {
        errors.push(`Site "${siteId}" missing domain`);
    }

    if (!site.includedPodcasts || site.includedPodcasts.length === 0) {
        errors.push(`Site "${siteId}" has no included podcasts`);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Gets the directory path for a specific site
 */
export function getSiteDirectory(siteId: string): string | null {
    // Find workspace root and navigate to sites directory
    const workspaceRoot = findWorkspaceRoot();
    const sitesDir = path.join(workspaceRoot, 'sites');
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
 * Gets the .env.aws file path for a site
 */
export function getSiteEnvPath(siteId: string): string | null {
    const siteDir = getSiteDirectory(siteId);
    if (!siteDir) return null;
    
    const envPath = path.join(siteDir, '.env.aws');
    return fs.existsSync(envPath) ? envPath : null;
}

// Export the main discovery function as default
export default discoverSites;