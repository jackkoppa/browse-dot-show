#!/usr/bin/env tsx

import { join } from 'path';
import { execCommandOrThrow } from '../utils/shell-exec.js';
import { exists } from '../utils/file-operations.js';
import { printInfo, printError, printSuccess, logHeader } from '../utils/logging.js';
import { checkAwsCredentials } from '../utils/aws-utils.js';
import { terraformOutput } from '../utils/terraform-utils.js';

interface UploadConfig {
  siteId: string;
  bucketName: string;
  cloudfrontDomain: string;
  cloudfrontId: string;
  searchApiUrl: string;
  awsProfile: string;
}

async function validateInputs(siteId: string): Promise<void> {
  if (!siteId) {
    printError('SITE_ID must be provided as second argument or environment variable');
    printError('Usage: tsx scripts/deploy/upload-client.ts prod SITE_ID');
    process.exit(1);
  }
}

async function loadEnvironment(): Promise<{ awsProfile: string }> {  
  // Validate AWS profile is available from environment
  const awsProfile = process.env.AWS_PROFILE;
  if (!awsProfile) {
    printError('AWS_PROFILE is not set. Please ensure your site .env.aws-sso file contains AWS_PROFILE=your-profile-name');
    process.exit(1);
  }

  return { awsProfile };
}

async function checkAwsSession(awsProfile: string): Promise<void> {
  // Check if AWS SSO session is active
  if (!(await checkAwsCredentials(awsProfile))) {
    printError(`AWS SSO session is not active or has expired for profile ${awsProfile}`);
    printError(`Please run: aws sso login --profile ${awsProfile}`);
    process.exit(1);
  }
}

async function getTerraformOutputs(): Promise<{
  bucketName: string;
  cloudfrontDomain: string;
  cloudfrontId: string;
  searchApiUrl: string;
}> {
  printInfo('Getting deployment details from Terraform...');
  
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

async function buildClient(config: UploadConfig): Promise<void> {
  printInfo(`Building client with search API URL: ${config.searchApiUrl}`);
  printInfo('Building client with manifest base URL: /');

  // Set environment variables for the build
  process.env.VITE_SEARCH_API_URL = config.searchApiUrl;
  process.env.VITE_S3_HOSTED_FILES_BASE_URL = '/';
  process.env.SITE_ID = config.siteId;
  
  // Set Node.js memory limit for large index files
  process.env.NODE_OPTIONS = '--max-old-space-size=6144';
  printInfo('Set NODE_OPTIONS=--max-old-space-size=6144 for client build');

  const buildStartTime = Date.now();
  printInfo(`Starting client build for site: ${config.siteId}`);
  
  await execCommandOrThrow('pnpm', ['client:build:specific-site', config.siteId]);
  
  const buildDuration = (Date.now() - buildStartTime) / 1000;
  printInfo(`Client build completed in ${buildDuration.toFixed(2)} seconds`);
}

async function validateBuildOutput(siteId: string): Promise<void> {
  const clientDistDir = join('packages/client', `dist-${siteId}`);
  
  // Check if source files exist
  const indexHtmlPath = join(clientDistDir, 'index.html');
  if (!(await exists(indexHtmlPath))) {
    printError(`${indexHtmlPath} not found`);
    printError(`Make sure you've run the client build for site: ${siteId}`);
    process.exit(1);
  }

  const assetsDir = join(clientDistDir, 'assets');
  if (!(await exists(assetsDir))) {
    printError(`${assetsDir} directory not found`);
    printError(`Make sure you've run the client build for site: ${siteId}`);
    process.exit(1);
  }
}

async function uploadToS3(config: UploadConfig): Promise<void> {
  const { siteId, bucketName, awsProfile } = config;
  const clientDistDir = join('packages/client', `dist-${siteId}`);

  printInfo(`Uploading client files to S3 bucket: ${bucketName}`);
  printInfo(`CloudFront domain: ${config.cloudfrontDomain}`);

  // Upload index.html to root
  printInfo(`Uploading index.html from ${clientDistDir}...`);
  await execCommandOrThrow('aws', [
    's3', 'cp',
    join(clientDistDir, 'index.html'),
    `s3://${bucketName}/index.html`,
    '--profile', awsProfile
  ]);

  // Upload favicon.ico to root (if it exists)
  const faviconPath = join(clientDistDir, 'favicon.ico');
  if (await exists(faviconPath)) {
    printInfo(`Uploading favicon.ico from ${clientDistDir}...`);
    await execCommandOrThrow('aws', [
      's3', 'cp',
      faviconPath,
      `s3://${bucketName}/favicon.ico`,
      '--profile', awsProfile
    ]);
  }

  // Upload assets directory (this will delete old assets but preserve other bucket contents)
  printInfo(`Uploading assets directory from ${clientDistDir}...`);
  await execCommandOrThrow('aws', [
    's3', 'sync',
    join(clientDistDir, 'assets/'),
    `s3://${bucketName}/assets/`,
    '--delete',
    '--profile', awsProfile
  ]);
}

async function invalidateCloudFront(config: UploadConfig): Promise<void> {
  const { cloudfrontId, awsProfile } = config;

  printInfo('Invalidating CloudFront cache for client files...');
  await execCommandOrThrow('aws', [
    'cloudfront', 'create-invalidation',
    '--distribution-id', cloudfrontId,
    '--paths', '/index.html', '/assets/*',
    '--profile', awsProfile,
    '--no-cli-pager'
  ]);
}

async function main(): Promise<void> {
  try {
    logHeader('Upload Client Files to S3');

    // Get SITE_ID from command line arguments or environment
    const siteId = process.argv[3] || process.env.SITE_ID || '';
    await validateInputs(siteId);

    printInfo(`Uploading client files for site: ${siteId}`);

    // Load environment configuration
    const { awsProfile } = await loadEnvironment();

    // Check AWS authentication
    await checkAwsSession(awsProfile);

    // Get deployment details from Terraform
    const terraformOutputs = await getTerraformOutputs();

    const config: UploadConfig = {
      siteId,
      awsProfile,
      ...terraformOutputs
    };

    // Build the client
    await buildClient(config);

    // Validate build output
    await validateBuildOutput(siteId);

    // Upload to S3
    await uploadToS3(config);

    // Invalidate CloudFront cache
    await invalidateCloudFront(config);

    printSuccess('Upload complete. Your site should be available at:');
    console.log(`https://${config.cloudfrontDomain}`);

  } catch (error) {
    printError(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nUpload cancelled...');
  process.exit(0);
});

main(); 