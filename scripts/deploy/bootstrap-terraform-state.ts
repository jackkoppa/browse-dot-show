#!/usr/bin/env tsx

import { 
  validateAwsEnvironment, 
  s3BucketExists, 
  createS3Bucket, 
  awsCommand 
} from '../utils/aws-utils';
import { logError, printInfo, printError, logProgress, logSuccess } from '../utils/logging';

/**
 * Bootstrap script to create Terraform state S3 bucket for a site
 * This must be run before the main terraform deployment
 * 
 * Usage: tsx bootstrap-terraform-state.ts <site_id> [aws_profile]
 * Example: tsx bootstrap-terraform-state.ts hardfork Administrator-browse.show-base-089994311986
 */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printError('Usage: tsx bootstrap-terraform-state.ts <site_id> [aws_profile]');
    console.error('Example: tsx bootstrap-terraform-state.ts hardfork Administrator-browse.show-base-089994311986');
    process.exit(1);
  }

  const siteId = args[0];
  const awsProfile = args[1] || process.env.AWS_PROFILE;
  const awsRegion = process.env.AWS_REGION || 'us-east-1';
  const bucketName = `${siteId}-terraform-state`;

  try {
    logProgress(`🚀 Bootstrapping Terraform state bucket for site: ${siteId}`);
    printInfo(`Bucket name: ${bucketName}`);
    printInfo(`AWS Region: ${awsRegion}`);
    
    if (awsProfile) {
      printInfo(`AWS Profile: ${awsProfile}`);
    }

    // Validate AWS environment
    const validation = await validateAwsEnvironment(awsProfile);
    if (!validation.valid) {
      validation.errors.forEach(error => printError(error));
      process.exit(1);
    }

    // Check if bucket already exists
    printInfo(`Checking if bucket ${bucketName} already exists...`);
    
    if (await s3BucketExists(bucketName, awsProfile)) {
      logSuccess(`✅ Bucket ${bucketName} already exists`);
    } else {
      printInfo(`Creating S3 bucket: ${bucketName}`);

      // Create bucket
      await createS3Bucket(bucketName, awsRegion, awsProfile);

      // Enable versioning
      await awsCommand('s3api put-bucket-versioning', [
        '--bucket', bucketName,
        '--versioning-configuration', 'Status=Enabled'
      ], { profile: awsProfile });

      // Enable encryption
      const encryptionConfig = JSON.stringify({
        Rules: [{
          ApplyServerSideEncryptionByDefault: {
            SSEAlgorithm: 'AES256'
          }
        }]
      });

      await awsCommand('s3api put-bucket-encryption', [
        '--bucket', bucketName,
        '--server-side-encryption-configuration', `'${encryptionConfig}'`
      ], { profile: awsProfile });

      // Block public access
      const publicAccessConfig = JSON.stringify({
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true
      });

      await awsCommand('s3api put-public-access-block', [
        '--bucket', bucketName,
        '--public-access-block-configuration', `'${publicAccessConfig}'`
      ], { profile: awsProfile });

      logSuccess(`✅ Successfully created and configured bucket: ${bucketName}`);
    }

    logSuccess('🎉 Terraform state bucket bootstrap complete!');
    printInfo('You can now run terraform init with the backend configuration.');

  } catch (error: any) {
    logError('Bootstrap failed:', error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  logError('Unexpected error:', error);
  process.exit(1);
}); 