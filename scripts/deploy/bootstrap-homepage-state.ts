#!/usr/bin/env tsx

import { execCommandOrThrow } from '../utils/shell-exec.js';
import { printInfo, printError, printSuccess, logHeader } from '../utils/logging.js';
import { validateHomepageAwsEnvironment } from '../utils/aws-utils.js';
import { loadHomepageEnvVars } from '../utils/env-validation.js';

const STATE_BUCKET_NAME = 'homepage-terraform-state';
const AWS_REGION = 'us-east-1';

async function loadHomepageEnvironmentAndValidateAws(): Promise<string> {
  printInfo('Loading homepage environment...');
  
  try {
    // Load homepage-specific environment variables
    const env = await loadHomepageEnvVars();
    
    // Apply environment variables to process.env
    Object.assign(process.env, env);
    
    const awsProfile = env.AWS_PROFILE;
    if (!awsProfile) {
      printError('AWS_PROFILE not found in packages/homepage/.env.aws-sso');
      printError('Please ensure the file exists and contains: AWS_PROFILE=your-profile-name');
      process.exit(1);
    }
    
    printInfo(`Using AWS profile: ${awsProfile}`);
    
    // Validate AWS credentials
    const validation = await validateHomepageAwsEnvironment(awsProfile);
    
    if (!validation.valid) {
      printError('AWS environment validation failed:');
      validation.errors.forEach(error => printError(`  - ${error}`));
      
      if (validation.requiresSsoLogin) {
        printError('\nTo fix this, please run:');
        printError(`  aws sso login --profile ${awsProfile}`);
      }
      
      process.exit(1);
    }
    
    printSuccess(`✅ AWS authentication successful for profile: ${awsProfile}`);
    return awsProfile;
    
  } catch (error: any) {
    printError('Failed to load homepage environment:', error.message);
    printError('Please ensure packages/homepage/.env.aws-sso exists and contains AWS_PROFILE');
    process.exit(1);
  }
}

async function checkBucketExists(): Promise<boolean> {
  try {
    await execCommandOrThrow('aws', [
      's3api',
      'head-bucket',
      '--bucket',
      STATE_BUCKET_NAME,
      '--region',
      AWS_REGION
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
    AWS_REGION
  ]);

  // Enable versioning
  printInfo('Enabling versioning on state bucket...');
  await execCommandOrThrow('aws', [
    's3api',
    'put-bucket-versioning',
    '--bucket',
    STATE_BUCKET_NAME,
    '--versioning-configuration',
    'Status=Enabled'
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
    JSON.stringify(encryptionConfig)
  ]);

  // Block public access
  printInfo('Blocking public access on state bucket...');
  await execCommandOrThrow('aws', [
    's3api',
    'put-public-access-block',
    '--bucket',
    STATE_BUCKET_NAME,
    '--public-access-block-configuration',
    'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
  ]);

  printSuccess(`✅ Terraform state bucket ${STATE_BUCKET_NAME} created successfully!`);
}

async function main(): Promise<void> {
  logHeader('🚀 Bootstrap Homepage Terraform State');

  await loadHomepageEnvironmentAndValidateAws();

  if (await checkBucketExists()) {
    printSuccess(`✅ Terraform state bucket ${STATE_BUCKET_NAME} already exists!`);
    return;
  }

  await createStateBucket();
  
  printSuccess('🎉 Homepage Terraform state bootstrap completed!');
  printInfo('You can now run Terraform commands in the terraform/homepage directory.');
}

// Run the script
main().catch((error: Error) => {
  printError('Bootstrap failed:', error.message);
  process.exit(1);
}); 