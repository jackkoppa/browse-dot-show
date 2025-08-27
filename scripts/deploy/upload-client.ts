#!/usr/bin/env tsx

import { printInfo, printError, printSuccess, logHeader } from '../utils/logging.js';
import { checkAwsCredentials } from '../utils/aws-utils.js';
import { 
  buildClientForSite, 
  validateBuildOutput, 
  uploadClientToS3WithProfile, 
  invalidateCloudFrontWithProfile, 
  getTerraformOutputsWithProfile
} from '../utils/client-deployment.js';


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
    const terraformOutputs = await getTerraformOutputsWithProfile();

    

    // Build the client
    const buildResult = await buildClientForSite(siteId, terraformOutputs.searchApiUrl);
    if (!buildResult.success) {
      throw new Error(`Build failed: ${buildResult.error}`);
    }

    // Validate build output
    const validationResult = await validateBuildOutput(siteId);
    if (!validationResult.valid) {
      throw new Error(`Build validation failed: ${validationResult.errors.join(', ')}`);
    }

    // Upload to S3
    const uploadResult = await uploadClientToS3WithProfile(siteId, terraformOutputs.bucketName, awsProfile);
    if (!uploadResult.success) {
      throw new Error(`Upload failed: ${uploadResult.error}`);
    }

    // Invalidate CloudFront cache
    const invalidationResult = await invalidateCloudFrontWithProfile(terraformOutputs.cloudfrontId, awsProfile);
    if (!invalidationResult.success) {
      throw new Error(`CloudFront invalidation failed: ${invalidationResult.error}`);
    }

    printSuccess('Upload complete. Your site should be available at:');
    console.log(`https://${terraformOutputs.cloudfrontDomain}`);

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