import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

/**
 * Configuration for local files storage path
 */
interface LocalFilesConfig {
  localFilesPath: string;
}

/**
 * Default configuration - points to the original aws-local-dev directory
 */
const DEFAULT_CONFIG: LocalFilesConfig = {
  localFilesPath: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../aws-local-dev')
};

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
      
      // Validate that the path exists or can be created
      if (!fs.existsSync(config.localFilesPath)) {
        console.warn(`Local files path does not exist: ${config.localFilesPath}`);
        console.warn('Falling back to default configuration');
        cachedConfig = DEFAULT_CONFIG;
      } else {
        cachedConfig = config;
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
  return getLocalFilesConfig().localFilesPath;
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
 * Clears the cached configuration (useful for testing or when config changes)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
