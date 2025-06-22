#!/usr/bin/env tsx

import * as path from 'path';
import { execCommandOrThrow } from './utils/shell-exec';
import { exists, isDirectory } from './utils/file-operations';
import { logError, printInfo, printError, logProgress, logSuccess } from './utils/logging';
import { getLambdaDirectory } from './utils/lambda-utils';

/**
 * Build a lambda for a specific site
 * 
 * Usage: tsx build-lambda-for-site.ts <lambda-package-name> <site-id>
 * Example: tsx build-lambda-for-site.ts @browse-dot-show/rss-retrieval-lambda listenfairplay
 */

interface LambdaBuildConfig {
  lambdaPackageName: string;
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
 * Validate build configuration
 */
async function validateBuildConfig(config: LambdaBuildConfig): Promise<void> {
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

  // Check if rolldown.config.ts exists
  const rolldownConfig = path.join(config.lambdaDir, 'rolldown.config.ts');
  if (!(await exists(rolldownConfig))) {
    throw new Error(`Rolldown config not found: ${rolldownConfig}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    printError('Lambda package name and site ID are required');
    console.error('Usage: tsx build-lambda-for-site.ts <lambda-package-name> <site-id>');
    console.error('Example: tsx build-lambda-for-site.ts @browse-dot-show/rss-retrieval-lambda listenfairplay');
    process.exit(1);
  }

  const lambdaPackageName = args[0];
  const siteId = args[1];

  try {
    // Find site directory
    const siteDir = await findSiteDirectory(siteId);
    
    // Determine lambda directory
    const lambdaDir = getLambdaDirectory(lambdaPackageName);

    const config: LambdaBuildConfig = {
      lambdaPackageName,
      siteId,
      siteDir,
      lambdaDir
    };

    logProgress(`🏗️  Building lambda '${lambdaPackageName}' for site '${siteId}'`);
    printInfo(`📁 Using site directory: ${siteDir}`);
    printInfo(`🌐 Using environment file: ${siteDir}/.env.aws-sso`);
    printInfo(`📦 Lambda directory: ${lambdaDir}`);

    // Validate configuration
    await validateBuildConfig(config);

    // Set environment variables
    process.env.CURRENT_SITE_ID = siteId;

    // Change to lambda directory
    const originalCwd = process.cwd();
    const fullLambdaPath = path.resolve(lambdaDir);
    process.chdir(fullLambdaPath);

    try {
      // Build with rolldown
      await execCommandOrThrow('dotenvx', [
        'run',
        '-f', `../../../${siteDir}/.env.aws-sso`,
        '--',
        'rolldown',
        '-c', 'rolldown.config.ts'
      ]);

      // Prepare for AWS deployment
      await execCommandOrThrow('pnpm', ['__prepare-for-aws']);

      logSuccess(`✅ Lambda '${lambdaPackageName}' built successfully for site '${siteId}'`);

    } finally {
      // Always restore original working directory
      process.chdir(originalCwd);
    }

  } catch (error: any) {
    logError(`Failed to build lambda '${lambdaPackageName}' for site '${siteId}':`, error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  logError('Unexpected error:', error);
  process.exit(1);
}); 