import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

/**
 * Configuration for local files storage path and worktree directory
 */
interface LocalFilesConfig {
  localFilesPath?: string;
  worktreeDirectory?: string;
}

/**
 * Default configuration - points to the original aws-local-dev directory
 */
const DEFAULT_CONFIG: LocalFilesConfig = {
  localFilesPath: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../aws-local-dev')
};

/**
 * Gets the worktree directory from config, prompting if not set
 */
export async function getWorktreeDirectory(): Promise<string> {
  const config = getLocalFilesConfig();
  
  if (config.worktreeDirectory) {
    return config.worktreeDirectory;
  }
  
  // If not set, we'll need to prompt - but this should be done in the script, not here
  // Return empty string to indicate it needs to be set
  return '';
}

/**
 * Cache for the loaded configuration to avoid repeated file reads
 */
let cachedConfig: LocalFilesConfig | null = null;

/**
 * Gets the local files configuration, with fallback to default
 */
function getLocalFilesConfig(): LocalFilesConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local-files-config.json');
  
  try {
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config: LocalFilesConfig = JSON.parse(configContent);
      
      // Merge with defaults, only validating localFilesPath if it's set
      const mergedConfig: LocalFilesConfig = {
        ...DEFAULT_CONFIG,
        ...config
      };
      
      // Validate that localFilesPath exists if it's set
      if (mergedConfig.localFilesPath && !fs.existsSync(mergedConfig.localFilesPath)) {
        console.warn(`Local files path does not exist: ${mergedConfig.localFilesPath}`);
        console.warn('Falling back to default configuration');
        cachedConfig = DEFAULT_CONFIG;
      } else {
        cachedConfig = mergedConfig;
      }
    } else {
      console.info('No .local-files-config.json found, using default aws-local-dev directory');
      cachedConfig = DEFAULT_CONFIG;
    }
  } catch (error) {
    console.error('Error reading local files configuration:', error);
    console.warn('Falling back to default configuration');
    cachedConfig = DEFAULT_CONFIG;
  }

  return cachedConfig;
}

/**
 * Gets the base path for local files storage
 */
export function getLocalFilesBasePath(): string {
  const config = getLocalFilesConfig();
  return config.localFilesPath || DEFAULT_CONFIG.localFilesPath!;
}

/**
 * Gets the S3-equivalent path within the local files directory
 */
export function getLocalS3Path(): string {
  return path.join(getLocalFilesBasePath(), 's3');
}

/**
 * Gets a site-specific path within the local S3 directory
 */
export function getLocalS3SitePath(siteId: string, ...pathSegments: string[]): string {
  return path.join(getLocalS3Path(), 'sites', siteId, ...pathSegments);
}

/**
 * Gets a legacy (non-site-specific) path within the local S3 directory
 */
export function getLocalS3LegacyPath(...pathSegments: string[]): string {
  return path.join(getLocalS3Path(), ...pathSegments);
}

/**
 * Saves the worktree directory to the config file
 */
export function saveWorktreeDirectory(worktreeDirectory: string): void {
  const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local-files-config.json');
  
  let config: LocalFilesConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(configContent);
    } catch (error) {
      console.warn('Error reading existing config, creating new one');
    }
  }
  
  config.worktreeDirectory = worktreeDirectory;
  
  // Preserve localFilesPath if it exists
  if (!config.localFilesPath && DEFAULT_CONFIG.localFilesPath) {
    config.localFilesPath = DEFAULT_CONFIG.localFilesPath;
  }
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  clearConfigCache();
}

/**
 * Clears the cached configuration (useful for testing or when config changes)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
