#!/usr/bin/env tsx

import * as path from 'path';
import { fileURLToPath } from 'url';
import { readTextFile, exists } from './file-operations.js';
import { logError, logWarning, logInfo } from './logging.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EnvValidationRule {
  name: string;
  required: boolean;
  description?: string;
  validate?: (value: string) => boolean | string;
  default?: string;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  values: Record<string, string>;
}

/**
 * Load environment variables from a .env file
 */
export async function loadEnvFile(filePath: string): Promise<Record<string, string>> {
  if (!(await exists(filePath))) {
    throw new Error(`Environment file not found: ${filePath}`);
  }

  const content = await readTextFile(filePath);
  const envVars: Record<string, string> = {};

  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE format
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      
      // Remove surrounding quotes if present
      let cleanValue = value;
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        cleanValue = value.slice(1, -1);
      }
      
      envVars[key] = cleanValue;
    } else {
      logWarning(`Invalid environment variable format on line ${i + 1}: ${line}`);
    }
  }

  return envVars;
}

/**
 * Validate environment variables against a set of rules
 */
export function validateEnvironment(
  env: Record<string, string | undefined> = process.env,
  rules: EnvValidationRule[]
): EnvValidationResult {
  const result: EnvValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    values: {}
  };

  for (const rule of rules) {
    const value = env[rule.name];
    
    if (!value && rule.required) {
      result.errors.push(`Required environment variable missing: ${rule.name}`);
      result.valid = false;
      continue;
    }

    if (!value && rule.default) {
      result.values[rule.name] = rule.default;
      result.warnings.push(`Using default value for ${rule.name}: ${rule.default}`);
      continue;
    }

    if (!value) {
      continue; // Optional variable not set, skip validation
    }

    // Run custom validation if provided
    if (rule.validate) {
      const validationResult = rule.validate(value);
      if (validationResult !== true) {
        const errorMessage = typeof validationResult === 'string' 
          ? validationResult 
          : `Invalid value for ${rule.name}: ${value}`;
        result.errors.push(errorMessage);
        result.valid = false;
        continue;
      }
    }

    result.values[rule.name] = value;
  }

  return result;
}

/**
 * Require specific environment variables to be set
 */
export function requireEnvVars(varNames: string[]): Record<string, string> {
  const missing: string[] = [];
  const values: Record<string, string> = {};

  for (const varName of varNames) {
    const value = process.env[varName];
    if (!value) {
      missing.push(varName);
    } else {
      values[varName] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return values;
}

/**
 * Load environment variables from multiple possible locations
 */
export async function loadEnvFromMultipleSources(
  filePaths: string[],
  required: boolean = false
): Promise<Record<string, string>> {
  let envVars: Record<string, string> = {};
  let loadedCount = 0;

  for (const filePath of filePaths) {
    if (await exists(filePath)) {
      try {
        const fileEnvVars = await loadEnvFile(filePath);
        envVars = { ...envVars, ...fileEnvVars };
        logInfo(`Loaded environment variables from: ${filePath}`);
        loadedCount++;
      } catch (error) {
        logError(`Failed to load environment file ${filePath}:`, error);
        if (required) {
          throw error;
        }
      }
    }
  }

  if (required && loadedCount === 0) {
    throw new Error(`No environment files found. Searched: ${filePaths.join(', ')}`);
  }

  return envVars;
}

/**
 * Common validation functions
 */
export const validators = {
  isUrl: (value: string): boolean | string => {
    try {
      new URL(value);
      return true;
    } catch {
      return `Invalid URL: ${value}`;
    }
  },

  isPort: (value: string): boolean | string => {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return `Invalid port number: ${value}`;
    }
    return true;
  },

  isPath: (value: string): boolean | string => {
    if (!path.isAbsolute(value) && !value.startsWith('./') && !value.startsWith('../')) {
      return `Path must be absolute or relative: ${value}`;
    }
    return true;
  },

  isEmail: (value: string): boolean | string => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return `Invalid email address: ${value}`;
    }
    return true;
  },

  isNotEmpty: (value: string): boolean | string => {
    if (!value || value.trim() === '') {
      return 'Value cannot be empty';
    }
    return true;
  },

  isOneOf: (allowedValues: string[]) => (value: string): boolean | string => {
    if (!allowedValues.includes(value)) {
      return `Value must be one of: ${allowedValues.join(', ')}`;
    }
    return true;
  }
};

/**
 * Common environment variable rules for this project
 */
export const commonRules: EnvValidationRule[] = [
  {
    name: 'NODE_ENV',
    required: false,
    default: 'development',
    validate: validators.isOneOf(['development', 'production', 'test'])
  },
  {
    name: 'AWS_PROFILE',
    required: false,
    description: 'AWS profile name for CLI operations'
  },
  {
    name: 'AWS_REGION',
    required: false,
    default: 'us-east-1',
    description: 'AWS region for deployments'
  }
];

/**
 * Load and validate site-specific environment variables
 */
export async function loadSiteEnvVars(
  siteId: string,
  envType: string = 'local'
): Promise<Record<string, string>> {
  const basePath = path.resolve(__dirname, '../../sites');
  
  // Try my-sites first, then origin-sites
  const possiblePaths = [
    path.join(basePath, 'my-sites', siteId, `.env.${envType}`),
    path.join(basePath, 'origin-sites', siteId, `.env.${envType}`)
  ];

  const envVars = await loadEnvFromMultipleSources(possiblePaths, false);
  
  // Merge with process.env, giving priority to site-specific vars
  // Filter out undefined values from process.env
  const filteredProcessEnv = Object.entries(process.env)
    .filter(([, value]) => value !== undefined)
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value as string }), {});
  
  return { ...filteredProcessEnv, ...envVars };
}

/**
 * Load homepage environment variables from packages/homepage/.env.aws-sso
 */
export async function loadHomepageEnvVars(): Promise<Record<string, string>> {
  const homepageEnvPath = path.resolve(__dirname, '../../packages/homepage/.env.aws-sso');
  
  const envVars = await loadEnvFromMultipleSources([homepageEnvPath], true);
  
  // Merge with process.env, giving priority to homepage-specific vars
  // Filter out undefined values from process.env
  const filteredProcessEnv = Object.entries(process.env)
    .filter(([, value]) => value !== undefined)
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value as string }), {});
  
  return { ...filteredProcessEnv, ...envVars };
} 