#!/usr/bin/env tsx

import { join } from 'path';
import { spawn } from 'child_process';
import { execCommand, execCommandOrThrow } from './shell-exec.js';
import { exists } from './file-operations.js';
import { logInfo, logSuccess, logError, logProgress, } from './logging.js';
import { terraformOutput } from './terraform-utils.js';

/**
 * Terraform outputs interface
 */
export interface TerraformOutputs {
  bucketName: string;
  cloudfrontDomain: string;
  cloudfrontId: string;
  searchApiUrl: string;
}

/**
 * Client build result interface
 */
export interface ClientBuildResult {
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * S3 upload result interface
 */
export interface S3UploadResult {
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * CloudFront invalidation result interface
 */
export interface CloudFrontInvalidationResult {
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Build client for a specific site
 */
export async function buildClientForSite(
  siteId: string, 
  searchApiUrl: string,
  options: { silent?: boolean } = {}
): Promise<ClientBuildResult> {
  const startTime = Date.now();
  const { silent = false } = options;
  
  if (!silent) {
    logProgress(`Building client for ${siteId}...`);
  }
  
  return new Promise((resolve) => {
    // Set environment variables for the build
    const buildEnv = {
      ...process.env,
      SITE_ID: siteId,
      VITE_SEARCH_API_URL: searchApiUrl,
      VITE_S3_HOSTED_FILES_BASE_URL: '/',
      NODE_OPTIONS: '--max-old-space-size=6144'
    };

    const child = spawn('pnpm', ['client:build:specific-site', siteId], {
      stdio: silent ? 'pipe' : 'inherit',
      shell: true,
      env: buildEnv
    });

    let stdout = '';
    let stderr = '';

    if (silent) {
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    child.on('close', (code: number | null) => {
      const duration = Date.now() - startTime;
      const success = code === 0;
      
      if (success) {
        if (!silent) {
          logSuccess(`Client build completed for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
        }
      } else {
        if (!silent) {
          logError(`Client build failed for ${siteId} with exit code ${code} (${(duration / 1000).toFixed(1)}s)`);
        }
      }
      
      resolve({
        success,
        duration,
        error: success ? undefined : `Build failed with exit code: ${code}`
      });
    });

    child.on('error', (error: Error) => {
      const duration = Date.now() - startTime;
      if (!silent) {
        logError(`Error building client for ${siteId}: ${error.message} (${(duration / 1000).toFixed(1)}s)`);
      }
      
      resolve({
        success: false,
        duration,
        error: error.message
      });
    });
  });
}

/**
 * Validate build output for a site
 */
export async function validateBuildOutput(siteId: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const clientDistDir = join('packages/client', `dist-${siteId}`);
  
  // Check if source files exist
  const indexHtmlPath = join(clientDistDir, 'index.html');
  if (!(await exists(indexHtmlPath))) {
    errors.push(`${indexHtmlPath} not found`);
  }

  const assetsDir = join(clientDistDir, 'assets');
  if (!(await exists(assetsDir))) {
    errors.push(`${assetsDir} directory not found`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Upload client files to S3 using AWS profile
 */
export async function uploadClientToS3WithProfile(
  siteId: string,
  bucketName: string,
  awsProfile: string,
  options: { silent?: boolean } = {}
): Promise<S3UploadResult> {
  const startTime = Date.now();
  const { silent = false } = options;
  
  if (!silent) {
    logProgress(`Uploading client files to S3 for ${siteId}...`);
  }
  
  try {
    const clientDistDir = join('packages/client', `dist-${siteId}`);

    // Upload index.html to root
    await execCommandOrThrow('aws', [
      's3', 'cp',
      join(clientDistDir, 'index.html'),
      `s3://${bucketName}/index.html`,
      '--profile', awsProfile
    ], { silent });

    // Upload favicon.ico to root (if it exists)
    const faviconPath = join(clientDistDir, 'favicon.ico');
    if (await exists(faviconPath)) {
      await execCommandOrThrow('aws', [
        's3', 'cp',
        faviconPath,
        `s3://${bucketName}/favicon.ico`,
        '--profile', awsProfile
      ], { silent });
    }

    // Upload assets directory
    await execCommandOrThrow('aws', [
      's3', 'sync',
      join(clientDistDir, 'assets/'),
      `s3://${bucketName}/assets/`,
      '--delete',
      '--profile', awsProfile
    ], { silent });

    const duration = Date.now() - startTime;
    if (!silent) {
      logSuccess(`Client files uploaded to S3 for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
    }
    return { success: true, duration };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (!silent) {
      logError(`Failed to upload client files for ${siteId}: ${error.message}`);
    }
    return { success: false, duration, error: error.message };
  }
}

/**
 * Upload client files to S3 using temporary credentials
 */
export async function uploadClientToS3WithCredentials(
  siteId: string,
  bucketName: string,
  credentials: {
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    AWS_SESSION_TOKEN: string;
    AWS_REGION: string;
  },
  options: { silent?: boolean } = {}
): Promise<S3UploadResult> {
  const startTime = Date.now();
  const { silent = false } = options;
  
  if (!silent) {
    logProgress(`Uploading client files to S3 for ${siteId}...`);
  }
  
  try {
    const clientDistDir = join('packages/client', `dist-${siteId}`);
    
    // Upload index.html to root
    const uploadIndexResult = await execCommand('aws', [
      's3', 'cp',
      join(clientDistDir, 'index.html'),
      `s3://${bucketName}/index.html`
    ], {
      silent: true,
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: credentials.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: credentials.AWS_SECRET_ACCESS_KEY,
        AWS_SESSION_TOKEN: credentials.AWS_SESSION_TOKEN,
        AWS_REGION: credentials.AWS_REGION
      }
    });

    if (uploadIndexResult.exitCode !== 0) {
      throw new Error(`Failed to upload index.html: ${uploadIndexResult.stderr}`);
    }

    // Upload assets directory
    const uploadAssetsResult = await execCommand('aws', [
      's3', 'sync',
      join(clientDistDir, 'assets/'),
      `s3://${bucketName}/assets/`,
      '--delete'
    ], {
      silent: true,
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: credentials.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: credentials.AWS_SECRET_ACCESS_KEY,
        AWS_SESSION_TOKEN: credentials.AWS_SESSION_TOKEN,
        AWS_REGION: credentials.AWS_REGION
      }
    });

    if (uploadAssetsResult.exitCode !== 0) {
      throw new Error(`Failed to upload assets: ${uploadAssetsResult.stderr}`);
    }

    const duration = Date.now() - startTime;
    if (!silent) {
      logSuccess(`Client files uploaded to S3 for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
    }
    return { success: true, duration };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (!silent) {
      logError(`Failed to upload client files for ${siteId}: ${error.message}`);
    }
    return { success: false, duration, error: error.message };
  }
}

/**
 * Invalidate CloudFront cache using AWS profile
 */
export async function invalidateCloudFrontWithProfile(
  cloudfrontId: string,
  awsProfile: string,
  options: { silent?: boolean } = {}
): Promise<CloudFrontInvalidationResult> {
  const startTime = Date.now();
  const { silent = false } = options;
  
  if (!silent) {
    logProgress('Invalidating CloudFront cache...');
  }
  
  try {
    await execCommandOrThrow('aws', [
      'cloudfront', 'create-invalidation',
      '--distribution-id', cloudfrontId,
      '--paths', '/index.html', '/assets/*',
      '--profile', awsProfile,
      '--no-cli-pager'
    ], { silent });

    const duration = Date.now() - startTime;
    if (!silent) {
      logSuccess(`CloudFront cache invalidated (${(duration / 1000).toFixed(1)}s)`);
    }
    return { success: true, duration };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (!silent) {
      logError(`Failed to invalidate CloudFront cache: ${error.message}`);
    }
    return { success: false, duration, error: error.message };
  }
}

/**
 * Invalidate CloudFront cache using temporary credentials
 */
export async function invalidateCloudFrontWithCredentials(
  cloudfrontId: string,
  credentials: {
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    AWS_SESSION_TOKEN: string;
    AWS_REGION: string;
  },
  options: { silent?: boolean, invalidateEpisodeManifest?: boolean } = {}
): Promise<CloudFrontInvalidationResult> {
  const startTime = Date.now();
  const { silent = false, invalidateEpisodeManifest = false } = options;
  
  if (!silent) {
    logProgress('Invalidating CloudFront cache...');
  }
  
  try {
    const paths = ['/index.html', '/assets/*'];
    if (invalidateEpisodeManifest) {
      paths.push('/episode-manifest/*');
    }

    const invalidationResult = await execCommand('aws', [
      'cloudfront', 'create-invalidation',
      '--distribution-id', cloudfrontId,
      '--paths', ...paths,
      '--no-cli-pager'
    ], {
      silent: true,
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: credentials.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: credentials.AWS_SECRET_ACCESS_KEY,
        AWS_SESSION_TOKEN: credentials.AWS_SESSION_TOKEN,
        AWS_REGION: credentials.AWS_REGION
      }
    });

    if (invalidationResult.exitCode !== 0) {
      throw new Error(`Failed to create CloudFront invalidation: ${invalidationResult.stderr}`);
    }

    const duration = Date.now() - startTime;
    if (!silent) {
      logSuccess(`CloudFront cache invalidated (${(duration / 1000).toFixed(1)}s)`);
    }
    return { success: true, duration };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (!silent) {
      logError(`Failed to invalidate CloudFront cache: ${error.message}`);
    }
    return { success: false, duration, error: error.message };
  }
}

/**
 * Get terraform outputs using AWS profile
 */
export async function getTerraformOutputsWithProfile(
  options: { silent?: boolean } = {}
): Promise<TerraformOutputs> {
  const { silent = false } = options;
  
  if (!silent) {
    logInfo('Getting deployment details from Terraform...');
  }
  
  // Change to terraform directory
  const originalCwd = process.cwd();
  process.chdir(join(originalCwd, 'terraform/sites'));

  try {
    const bucketName = await terraformOutput('s3_bucket_name');
    const cloudfrontDomain = await terraformOutput('cloudfront_distribution_domain_name');
    const cloudfrontId = await terraformOutput('cloudfront_distribution_id');
    const searchApiUrl = await terraformOutput('search_api_invoke_url');

    return {
      bucketName: bucketName.value || bucketName,
      cloudfrontDomain: cloudfrontDomain.value || cloudfrontDomain,
      cloudfrontId: cloudfrontId.value || cloudfrontId,
      searchApiUrl: searchApiUrl.value || searchApiUrl
    };
  } finally {
    // Return to original directory
    process.chdir(originalCwd);
  }
}

/**
 * Get terraform outputs using temporary credentials
 */
export async function getTerraformOutputsWithCredentials(
  credentials: {
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    AWS_SESSION_TOKEN: string;
    AWS_REGION: string;
  },
  options: { silent?: boolean } = {}
): Promise<TerraformOutputs> {
  const { silent = false } = options;
  
  if (!silent) {
    logInfo('Getting deployment details from Terraform...');
  }
  
  // Change to terraform directory
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  process.chdir('terraform/sites');
  
  try {
    // Set up environment with temporary credentials for terraform
    process.env.AWS_ACCESS_KEY_ID = credentials.AWS_ACCESS_KEY_ID;
    process.env.AWS_SECRET_ACCESS_KEY = credentials.AWS_SECRET_ACCESS_KEY;
    process.env.AWS_SESSION_TOKEN = credentials.AWS_SESSION_TOKEN;
    process.env.AWS_REGION = credentials.AWS_REGION;

    // Get terraform outputs using the terraform command
    const bucketNameOutput = await terraformOutput('s3_bucket_name', { 
      workingDir: process.cwd()
    });
    
    const cloudfrontDomainOutput = await terraformOutput('cloudfront_distribution_domain_name', { 
      workingDir: process.cwd()
    });
    
    const cloudfrontIdOutput = await terraformOutput('cloudfront_distribution_id', { 
      workingDir: process.cwd()
    });
    
    const searchApiUrlOutput = await terraformOutput('search_api_invoke_url', { 
      workingDir: process.cwd()
    });

    return {
      bucketName: bucketNameOutput.value || bucketNameOutput,
      cloudfrontDomain: cloudfrontDomainOutput.value || cloudfrontDomainOutput,
      cloudfrontId: cloudfrontIdOutput.value || cloudfrontIdOutput,
      searchApiUrl: searchApiUrlOutput.value || searchApiUrlOutput
    };

  } finally {
    // Restore original environment variables
    process.env.AWS_ACCESS_KEY_ID = originalEnv.AWS_ACCESS_KEY_ID;
    process.env.AWS_SECRET_ACCESS_KEY = originalEnv.AWS_SECRET_ACCESS_KEY;
    process.env.AWS_SESSION_TOKEN = originalEnv.AWS_SESSION_TOKEN;
    process.env.AWS_REGION = originalEnv.AWS_REGION;
    
    // Return to original directory
    process.chdir(originalCwd);
  }
} 