#!/usr/bin/env tsx

import * as path from 'path';
import { execCommandOrThrow } from './utils/shell-exec';
import { exists, isDirectory } from './utils/file-operations';
import { logError, printInfo, printError, logProgress, logSuccess } from './utils/logging';
import { getLambdaDirectory } from './utils/lambda-utils';

/**
 * Run a lambda for a specific site
 * 
 * Usage: tsx run-lambda-for-site.ts <lambda-package-name> <main-file> <site-id>
 * Example: tsx run-lambda-for-site.ts @browse-dot-show/rss-retrieval-lambda retrieve-rss-feeds-and-download-audio-files.ts listenfairplay
 */

interface LambdaRunConfig {
  lambdaPackageName: string;
  mainFile: string;
  siteId: string;
  siteDir: string;
  lambdaDir: string;
}

/**
 * Find the site directory (my-sites takes precedence over origin-sites)
 */
async function findSiteDirectory(siteId: string): Promise<string> {
  const mySitesPath = `sites/my-sites/${siteId}`;
  const originSitesPath = `sites/origin-sites/${siteId}`;

  if (await isDirectory(mySitesPath)) {
    return mySitesPath;
  }

  if (await isDirectory(originSitesPath)) {
    return originSitesPath;
  }

  throw new Error(`Site '${siteId}' not found in sites/my-sites/ or sites/origin-sites/`);
}



/**
 * Validate run configuration
 */
async function validateRunConfig(config: LambdaRunConfig): Promise<void> {
  // Check if site directory exists
  if (!(await isDirectory(config.siteDir))) {
    throw new Error(`Site directory not found: ${config.siteDir}`);
  }

  // Check if .env.aws-sso exists
  const envFile = path.join(config.siteDir, '.env.aws-sso');
  if (!(await exists(envFile))) {
    throw new Error(`Environment file not found: ${envFile}`);
  }

  // Check if lambda directory exists
  if (!(await isDirectory(config.lambdaDir))) {
    throw new Error(`Lambda directory not found: ${config.lambdaDir}`);
  }

  // Check if main file exists
  const mainFilePath = path.join(config.lambdaDir, config.mainFile);
  if (!(await exists(mainFilePath))) {
    throw new Error(`Main file not found: ${mainFilePath}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    printError('Lambda package name, main file, and site ID are required');
    console.error('Usage: tsx run-lambda-for-site.ts <lambda-package-name> <main-file> <site-id>');
    console.error('Example: tsx run-lambda-for-site.ts @browse-dot-show/rss-retrieval-lambda retrieve-rss-feeds-and-download-audio-files.ts listenfairplay');
    process.exit(1);
  }

  const lambdaPackageName = args[0];
  const mainFile = args[1];
  const siteId = args[2];

  try {
    // Find site directory
    const siteDir = await findSiteDirectory(siteId);
    
    // Determine lambda directory
    const lambdaDir = getLambdaDirectory(lambdaPackageName);

    const config: LambdaRunConfig = {
      lambdaPackageName,
      mainFile,
      siteId,
      siteDir,
      lambdaDir
    };

    logProgress(`🚀 Running lambda '${lambdaPackageName}' for site '${siteId}'`);
    printInfo(`📁 Using site directory: ${siteDir}`);
    printInfo(`🌐 Using environment file: ${siteDir}/.env.aws-sso`);
    printInfo(`📦 Lambda directory: ${lambdaDir}`);
    printInfo(`📄 Main file: ${mainFile}`);

    // Validate configuration
    await validateRunConfig(config);

    // Set environment variables
    process.env.CURRENT_SITE_ID = siteId;

    // Change to lambda directory
    const originalCwd = process.cwd();
    const fullLambdaPath = path.resolve(lambdaDir);
    process.chdir(fullLambdaPath);

    try {
      // Run the lambda with site's AWS environment
      await execCommandOrThrow('dotenvx', [
        'run',
        '-f', `../../../${siteDir}/.env.aws-sso`,
        '--',
        'tsx',
        mainFile
      ]);

      logSuccess(`✅ Lambda '${lambdaPackageName}' completed for site '${siteId}'`);

    } finally {
      // Always restore original working directory
      process.chdir(originalCwd);
    }

  } catch (error: any) {
    logError(`Failed to run lambda '${lambdaPackageName}' for site '${siteId}':`, error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  logError('Unexpected error:', error);
  process.exit(1);
}); 