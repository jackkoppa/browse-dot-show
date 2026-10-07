#!/usr/bin/env tsx

import { printInfo, printError, printSuccess, logHeader } from '../lib/logging.js';
import { checkAwsCredentials } from '../lib/aws-utils.js';
import {
  buildClientForSite,
  validateBuildOutput,
  uploadClientToS3WithProfile,
  invalidateCloudFrontWithProfile,
} from '../lib/client-deployment.js';
import { getSiteAccountMapping, getSiteCloudFrontDomain, getSiteCloudFrontId, getSiteSearchApiUrl } from '../lib/site-accounts.js';

/**
 * Build one site's client, upload it to the site's bucket and invalidate CloudFront.
 *
 * The bucket, CloudFront distribution and search API URL come from `.site-account-mappings.json`
 * (not from `terraform output`, which reflects whichever site `terraform/sites` was last
 * initialized for). Credentials: the site's SSO profile (`AWS_PROFILE`, from `.env.aws-sso`),
 * or, when unset, the environment (e.g. GitHub Actions OIDC).
 */

function validateInputs(siteId: string): void {
  if (!siteId) {
    printError('SITE_ID must be provided as second argument or environment variable');
    printError('Usage: tsx scripts/deploy/upload-client.ts prod SITE_ID');
    process.exit(1);
  }
}

async function checkAwsSession(awsProfile: string | undefined): Promise<void> {
  if (await checkAwsCredentials(awsProfile)) return;
  if (awsProfile) {
    printError(`AWS SSO session is not active or has expired for profile ${awsProfile}`);
    printError(`Please run: aws sso login --profile ${awsProfile}`);
  } else {
    printError('No AWS credentials: set AWS_PROFILE (the site\'s .env.aws-sso) or provide credentials in the environment.');
  }
  process.exit(1);
}

async function main(): Promise<void> {
  try {
    logHeader('Upload Client Files to S3');

    const siteId = process.argv[3] || process.env.SITE_ID || '';
    validateInputs(siteId);

    printInfo(`Uploading client files for site: ${siteId}`);

    const awsProfile = process.env.AWS_PROFILE || undefined;
    printInfo(awsProfile ? `Using AWS profile: ${awsProfile}` : 'Using AWS credentials from the environment');
    await checkAwsSession(awsProfile);

    const { bucketName } = getSiteAccountMapping(siteId);
    const cloudfrontId = getSiteCloudFrontId(siteId);
    const cloudfrontDomain = getSiteCloudFrontDomain(siteId);
    const searchApiUrl = getSiteSearchApiUrl(siteId);
    printInfo(`Bucket: ${bucketName}, CloudFront: ${cloudfrontId}`);

    const buildResult = await buildClientForSite(siteId, searchApiUrl);
    if (!buildResult.success) {
      throw new Error(`Build failed: ${buildResult.error}`);
    }

    const validationResult = await validateBuildOutput(siteId);
    if (!validationResult.valid) {
      throw new Error(`Build validation failed: ${validationResult.errors.join(', ')}`);
    }

    const uploadResult = await uploadClientToS3WithProfile(siteId, bucketName, awsProfile);
    if (!uploadResult.success) {
      throw new Error(`Upload failed: ${uploadResult.error}`);
    }

    const invalidationResult = await invalidateCloudFrontWithProfile(cloudfrontId, awsProfile);
    if (!invalidationResult.success) {
      throw new Error(`CloudFront invalidation failed: ${invalidationResult.error}`);
    }

    printSuccess('Upload complete. Your site should be available at:');
    console.log(`https://${cloudfrontDomain}`);

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
