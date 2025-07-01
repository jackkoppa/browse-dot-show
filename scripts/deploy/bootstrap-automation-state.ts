#!/usr/bin/env tsx

import { execCommandOrThrow } from '../utils/shell-exec.js';
import { printInfo, printError, printSuccess, logHeader } from '../utils/logging.js';
import { validateAwsEnvironment } from '../utils/aws-utils.js';

const STATE_BUCKET_NAME = 'browse-dot-show-automation-terraform-state';
const AWS_REGION = 'us-east-1';
const AUTOMATION_PROFILE = 'browse.show-0_admin-permissions-297202224084';

async function validateAutomationAwsEnvironment(): Promise<void> {
  printInfo(`Using AWS profile: ${AUTOMATION_PROFILE}`);
  
  // Validate AWS credentials
  const validation = await validateAwsEnvironment(AUTOMATION_PROFILE);
  
  if (!validation.valid) {
    printError('AWS environment validation failed:');
    validation.errors.forEach(error => printError(`  - ${error}`));
    
    if (validation.requiresSsoLogin) {
      printError('\nTo fix this, please run:');
      printError(`  aws sso login --profile ${AUTOMATION_PROFILE}`);
    }
    
    process.exit(1);
  }
  
  printSuccess(`✅ AWS authentication successful for automation account`);
}

async function checkBucketExists(): Promise<boolean> {
  try {
    await execCommandOrThrow('aws', [
      's3api',
      'head-bucket',
      '--bucket',
      STATE_BUCKET_NAME,
      '--region',
      AWS_REGION,
      '--profile',
      AUTOMATION_PROFILE
    ]);
    return true;
  } catch {
    return false;
  }
}

async function createStateBucket(): Promise<void> {
  printInfo(`Creating Terraform state bucket: ${STATE_BUCKET_NAME}`);
  
  // Create the bucket
  await execCommandOrThrow('aws', [
    's3api',
    'create-bucket',
    '--bucket',
    STATE_BUCKET_NAME,
    '--region',
    AWS_REGION,
    '--profile',
    AUTOMATION_PROFILE
  ]);

  // Enable versioning
  printInfo('Enabling versioning on state bucket...');
  await execCommandOrThrow('aws', [
    's3api',
    'put-bucket-versioning',
    '--bucket',
    STATE_BUCKET_NAME,
    '--versioning-configuration',
    'Status=Enabled',
    '--profile',
    AUTOMATION_PROFILE
  ]);

  // Enable encryption
  printInfo('Enabling encryption on state bucket...');
  const encryptionConfig = {
    Rules: [{
      ApplyServerSideEncryptionByDefault: {
        SSEAlgorithm: "AES256"
      }
    }]
  };
  await execCommandOrThrow('aws', [
    's3api',
    'put-bucket-encryption',
    '--bucket',
    STATE_BUCKET_NAME,
    '--server-side-encryption-configuration',
    JSON.stringify(encryptionConfig),
    '--profile',
    AUTOMATION_PROFILE
  ]);

  // Block public access
  printInfo('Blocking public access on state bucket...');
  await execCommandOrThrow('aws', [
    's3api',
    'put-public-access-block',
    '--bucket',
    STATE_BUCKET_NAME,
    '--public-access-block-configuration',
    'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true',
    '--profile',
    AUTOMATION_PROFILE
  ]);

  printSuccess(`✅ Terraform state bucket ${STATE_BUCKET_NAME} created successfully!`);
}

async function main(): Promise<void> {
  logHeader('🚀 Bootstrap Automation Infrastructure Terraform State');
  
  printInfo('This script creates the S3 bucket for storing automation terraform state.');
  printInfo(`Target account: 297202224084 (browse.show-0_account--root)`);
  printInfo(`Profile: ${AUTOMATION_PROFILE}`);
  
  await validateAutomationAwsEnvironment();

  if (await checkBucketExists()) {
    printSuccess(`✅ Terraform state bucket ${STATE_BUCKET_NAME} already exists!`);
    return;
  }

  await createStateBucket();
  
  printSuccess('🎉 Automation infrastructure Terraform state bootstrap completed!');
  printInfo('You can now run Terraform commands in the terraform/automation directory.');
  printInfo('');
  printInfo('Next steps:');
  printInfo('  cd terraform/automation');
  printInfo(`  AWS_PROFILE=${AUTOMATION_PROFILE} terraform plan`);
  printInfo(`  AWS_PROFILE=${AUTOMATION_PROFILE} terraform apply`);
}

// Run the script
main().catch((error: Error) => {
  printError('Bootstrap failed:', error.message);
  process.exit(1);
}); 