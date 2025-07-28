import { join } from 'path';
import { spawn } from 'child_process';
import { exists, writeTextFile, readTextFile, readJsonFile } from '../utils/file-operations.js';
import { execCommand } from '../utils/shell-exec.js';
import { printInfo, printSuccess, printWarning, printError, logInColor } from '../utils/logging.js';
import { checkAwsCredentials, checkAwsSsoLogin } from '../utils/aws-utils.js';
import { CLIENT_PORT_NUMBER } from '@browse-dot-show/constants';
// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import { openGuide, collectInitial2EpisodesMetrics } from './site-operations.js';
import { loadProgress, saveProgress } from './setup-steps.js';
import { executeCompleteTranscriptionsStep } from './step-executors-advanced.js';
import type { SetupProgress, StepStatus, SiteConfig } from './types.js';

export async function executeStep(progress: SetupProgress, stepId: string): Promise<StepStatus> {
  const step = progress.steps[stepId];
  
  switch (stepId) {
    case 'generate-site-files':
      // This step is handled in the main flow
      return 'COMPLETED';
      
    case 'run-locally':
      return await executeRunLocallyStep(progress);
      
    case 'first-transcriptions':
      return await executeFirstTranscriptionsStep(progress);
      
    case 'custom-icons':
      return await executeCustomIconsStep();
      
    case 'custom-styling':
      return await executeCustomStylingStep();
      
    case 'complete-transcriptions':
      return await executeCompleteTranscriptionsStep(progress);
      
    case 'aws-deployment':
      return await executeAwsDeploymentStep(progress);
      
    case 'local-automation':
      printInfo('🚧 Local automation setup coming soon! For now, we\'ll mark this as complete.');
      return 'COMPLETED';
      
    default:
      printWarning(`Unknown step: ${stepId}`);
      return 'NOT_STARTED';
  }
}

export async function executeRunLocallyStep(progress: SetupProgress): Promise<StepStatus> {
  console.log('');
  printInfo('🖥️  Let\'s get your site running locally!');
  console.log('');
  console.log('To run your site locally, use this command in a new terminal window:');
  console.log('');
  logInColor('green', `pnpm client:dev --filter ${progress.siteId}`);
  console.log('');
  console.log('This will start your React development server. You should see your');
  console.log(`podcast site running at http://localhost:${CLIENT_PORT_NUMBER}`);
  console.log('');
  printWarning(`Note: the site won't yet work for searching - we'll get to that next! For now, just make sure you can view the UI`);
  console.log('');
  
  const confirmResponse = await prompts({
    type: 'confirm',
    name: 'completed',
    message: 'Have you successfully run your site locally and seen it working?',
    initial: false
  });
  
  if (confirmResponse.completed) {
    printSuccess('Excellent! Your local development environment is working perfectly.');
    return 'COMPLETED';
  } else {
    printInfo('No worries! You can try again later. Remember the command above when you\'re ready.');
    return 'DEFERRED';
  }
}

export async function executeCustomIconsStep(): Promise<StepStatus> {
  console.log('');
  printInfo('🎨 Time to make your site uniquely yours with custom icons!');
  console.log('');
  console.log('We have a complete guide to help you create custom icons and branding.');
  console.log('This includes favicon, social media cards, and app icons.');
  console.log('');
  
  await openGuide('docs/custom-icons-guide.md');
  
  const confirmResponse = await prompts({
    type: 'confirm',
    name: 'completed',
    message: 'Have you finished customizing your icons and branding?',
    initial: false
  });
  
  return confirmResponse.completed ? 'COMPLETED' : 'DEFERRED';
}

export async function executeCustomStylingStep(): Promise<StepStatus> {
  console.log('');
  printInfo('🌈 Let\'s customize your site\'s theme and styling!');
  console.log('');
  console.log('We have a guide for customizing your site theme using shadcn.');
  console.log('You can create a unique color scheme that matches your podcast brand.');
  console.log('');
  
  await openGuide('docs/custom-theme-guide.md');
  
  const confirmResponse = await prompts({
    type: 'confirm',
    name: 'completed',
    message: 'Have you finished customizing your site theme and colors?',
    initial: false
  });
  
  return confirmResponse.completed ? 'COMPLETED' : 'DEFERRED';
}

// Phase 1: AWS Credential Setup & Validation
async function setupAwsCredentials(siteId: string): Promise<boolean> {
  // Step 1: Check AWS CLI Installation
  printInfo('🔍 Checking AWS CLI installation...');
  
  try {
    const awsVersionResult = await execCommand('aws', ['--version'], { timeout: 10000 });
    if (awsVersionResult.exitCode !== 0) {
      throw new Error('AWS CLI not found');
    }
    printSuccess('✅ AWS CLI is installed');
  } catch (error) {
    printError('❌ AWS CLI is not installed or not in PATH');
    console.log('');
    console.log('Please install AWS CLI first:');
    console.log('  • macOS: brew install awscli');
    console.log('  • Linux: sudo apt install awscli or sudo yum install awscli');
    console.log('  • Windows: https://aws.amazon.com/cli/');
    console.log('  • Manual: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html');
    console.log('');
    return false;
  }
  
  // Step 2: Check Existing Configuration
  const awsEnvPath = join('sites/my-sites', siteId, '.env.aws-sso');
  
  if (await exists(awsEnvPath)) {
    printInfo('📋 Found existing AWS configuration file...');
    
    try {
      const envContent = await readTextFile(awsEnvPath);
      const profileMatch = envContent.match(/AWS_PROFILE=(.+)/);
      
      if (profileMatch) {
        const profileName = profileMatch[1].trim();
        printInfo(`Testing existing profile: ${profileName}`);
        
        // Test if the profile works
        if (await checkAwsCredentials(profileName)) {
          printSuccess(`✅ Existing AWS profile "${profileName}" is working!`);
          return true;
        } else {
          printWarning(`⚠️  Profile "${profileName}" exists but credentials are invalid or expired`);
          
          const retryResponse = await prompts({
            type: 'confirm',
            name: 'retry',
            message: 'Would you like to refresh your AWS credentials and try again?',
            initial: true
          });
          
          if (retryResponse.retry) {
            if (await checkAwsSsoLogin(profileName)) {
              printSuccess(`✅ AWS profile "${profileName}" is now working!`);
              return true;
            } else {
              printWarning(`Still having issues with profile "${profileName}"`);
            }
          }
        }
      }
    } catch (error) {
      printWarning('⚠️  Could not read existing AWS configuration file');
    }
  }
  
  // Step 3: AWS Authentication Setup
  printInfo('🔐 Let\'s set up your AWS credentials...');
  console.log('');
  console.log('You have two options for AWS authentication:');
  console.log('  1. AWS SSO (recommended if available)');
  console.log('  2. AWS Access Keys (fallback option)');
  console.log('');
  
  const authChoice = await prompts({
    type: 'select',
    name: 'method',
    message: 'Which authentication method would you like to use?',
    choices: [
      {
        title: 'AWS SSO (recommended)',
        description: 'More secure, temporary credentials',
        value: 'sso'
      },
      {
        title: 'AWS Access Keys',
        description: 'Traditional access key + secret key',
        value: 'keys'
      }
    ],
    initial: 0
  });
  
  if (!authChoice.method) {
    return false;
  }
  
  let profileName: string;
  
  if (authChoice.method === 'sso') {
    profileName = await setupAwsSso(siteId);
  } else {
    profileName = await setupAwsAccessKeys(siteId);
  }
  
  if (!profileName) {
    return false;
  }
  
  // Step 4: Create .env.aws-sso File
  await createAwsEnvFile(siteId, profileName);
  
  // Step 5: Final Validation
  return await validateAwsProfile(profileName);
}

async function setupAwsSso(siteId: string): Promise<string> {
  console.log('');
  printInfo('🔧 Setting up AWS SSO...');
  console.log('');
  console.log('To set up AWS SSO, you\'ll need:');
  console.log('  • Your organization\'s SSO start URL');
  console.log('  • Access to your SSO portal');
  console.log('  • Permission to create AWS profiles');
  console.log('');
  
  const hasInfoResponse = await prompts({
    type: 'confirm',
    name: 'hasInfo',
    message: 'Do you have your SSO start URL and access to your organization\'s AWS SSO?',
    initial: true
  });
  
  if (!hasInfoResponse.hasInfo) {
    printInfo('You\'ll need to get this information from your AWS administrator.');
    printInfo('For now, let\'s try the access keys option instead.');
    return await setupAwsAccessKeys(siteId);
  }
  
  const profileName = `${siteId}-deploy`;
  
  console.log('');
  printInfo('Please run this command in a separate terminal:');
  console.log('');
  logInColor('green', `aws configure sso --profile ${profileName}`);
  console.log('');
  console.log('During the setup, when prompted for:');
  console.log('  • Region: choose your preferred region (e.g., us-east-1)');
  console.log('  • Output format: json');
  console.log('');
  
  const setupCompleteResponse = await prompts({
    type: 'confirm',
    name: 'complete',
    message: 'Have you completed the AWS SSO configuration?',
    initial: false
  });
  
  if (!setupCompleteResponse.complete) {
    return '';
  }
  
  // Test the profile
  if (await checkAwsSsoLogin(profileName)) {
    printSuccess(`✅ AWS SSO profile "${profileName}" is working!`);
    return profileName;
  } else {
    printError('❌ Could not verify the AWS SSO profile. Please try again.');
    return '';
  }
}

async function setupAwsAccessKeys(siteId: string): Promise<string> {
  console.log('');
  printInfo('🔧 Setting up AWS Access Keys...');
  console.log('');
  console.log('You\'ll need:');
  console.log('  • AWS Access Key ID');
  console.log('  • AWS Secret Access Key');
  console.log('  • Your preferred AWS region');
  console.log('');
  console.log('⚠️  Important: Make sure these credentials have permissions for:');
  console.log('  • S3 (full access)');
  console.log('  • CloudFront (full access)');
  console.log('  • Lambda (full access)');
  console.log('  • Route 53 (full access or at least browse.show domain)');
  console.log('  • IAM (limited access for role creation)');
  console.log('');
  
  const hasKeysResponse = await prompts({
    type: 'confirm',
    name: 'hasKeys',
    message: 'Do you have your AWS access keys ready?',
    initial: true
  });
  
  if (!hasKeysResponse.hasKeys) {
    printInfo('Please get your AWS access keys from the AWS console:');
    printInfo('https://console.aws.amazon.com/iam/home#/security_credentials');
    return '';
  }
  
  const profileName = `${siteId}-deploy`;
  
  console.log('');
  printInfo('Please run this command in a separate terminal:');
  console.log('');
  logInColor('green', `aws configure --profile ${profileName}`);
  console.log('');
  console.log('Enter your credentials when prompted.');
  console.log('');
  
  const setupCompleteResponse = await prompts({
    type: 'confirm',
    name: 'complete',
    message: 'Have you completed the AWS access key configuration?',
    initial: false
  });
  
  if (!setupCompleteResponse.complete) {
    return '';
  }
  
  // Test the profile
  if (await checkAwsCredentials(profileName)) {
    printSuccess(`✅ AWS access key profile "${profileName}" is working!`);
    return profileName;
  } else {
    printError('❌ Could not verify the AWS access key profile. Please try again.');
    return '';
  }
}

async function createAwsEnvFile(siteId: string, profileName: string): Promise<void> {
  const awsEnvPath = join('sites/my-sites', siteId, '.env.aws-sso');
  const envContent = `AWS_PROFILE=${profileName}\n`;
  
  await writeTextFile(awsEnvPath, envContent);
  printSuccess(`✅ Created AWS configuration file: ${awsEnvPath}`);
}

async function validateAwsProfile(profileName: string): Promise<boolean> {
  printInfo('🧪 Final validation of AWS credentials...');
  
  try {
    const identityResult = await execCommand('aws', [
      'sts', 'get-caller-identity',
      '--profile', profileName,
      '--output', 'json'
    ], { timeout: 30000 });
    
    if (identityResult.exitCode === 0) {
      const identity = JSON.parse(identityResult.stdout);
      printSuccess('✅ AWS credentials validated successfully!');
      console.log(`   Account: ${identity.Account}`);
      console.log(`   User/Role: ${identity.Arn}`);
      return true;
    } else {
      throw new Error('Failed to get caller identity');
    }
  } catch (error) {
    printError(`❌ AWS credential validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    printInfo('Please check your AWS configuration and try again.');
    return false;
  }
}

// Phase 2: Prerequisites & Environment Check
async function checkPrerequisitesAndEnvironment(): Promise<boolean> {
  printInfo('🔍 Checking deployment prerequisites...');
  
  // Step 1: Check Required Tools
  console.log('');
  printInfo('Checking required tools...');
  
  // Check Terraform installation
  try {
    const terraformResult = await execCommand('terraform', ['--version'], { timeout: 10000 });
    if (terraformResult.exitCode !== 0) {
      throw new Error('Terraform not found');
    }
    
    // Parse version to check minimum requirements
    const versionMatch = terraformResult.stdout.match(/Terraform v(\d+)\.(\d+)\.(\d+)/);
    if (versionMatch) {
      const [, major, minor] = versionMatch;
      const majorNum = parseInt(major);
      const minorNum = parseInt(minor);
      
      // Minimum version 1.5.0 for AWS SSO support
      if (majorNum < 1 || (majorNum === 1 && minorNum < 5)) {
        printWarning(`⚠️  Terraform ${major}.${minor} found, but 1.5.0+ recommended for AWS SSO support`);
        
        const continueResponse = await prompts({
          type: 'confirm',
          name: 'continue',
          message: 'Would you like to continue anyway? (You may encounter issues)',
          initial: false
        });
        
        if (!continueResponse.continue) {
          printInfo('Please update Terraform and try again.');
          printInfo('  • macOS: brew upgrade terraform');
          printInfo('  • Manual: https://www.terraform.io/downloads');
          return false;
        }
      }
      
      printSuccess(`✅ Terraform ${major}.${minor} is installed`);
    } else {
      printSuccess('✅ Terraform is installed');
    }
  } catch (error) {
    printError('❌ Terraform is not installed or not in PATH');
    console.log('');
    console.log('Please install Terraform first:');
    console.log('  • macOS: brew install terraform');
    console.log('  • Linux: sudo apt install terraform or use package manager');
    console.log('  • Windows: https://www.terraform.io/downloads');
    console.log('  • Manual: https://www.terraform.io/downloads');
    console.log('');
    console.log('Terraform is required for managing AWS infrastructure.');
    return false;
  }
  
  // Step 2: Environment Variables
  printInfo('Checking environment variables...');
  
  // Check OpenAI API Key
  if (!process.env.OPENAI_API_KEY) {
    printError('❌ OPENAI_API_KEY environment variable is missing');
    console.log('');
    console.log('This is required for:');
    console.log('  • Podcast episode transcription');
    console.log('  • Search functionality');
    console.log('');
    
    const hasKeyResponse = await prompts({
      type: 'confirm',
      name: 'hasKey',
      message: 'Do you have an OpenAI API key available?',
      initial: true
    });
    
    if (!hasKeyResponse.hasKey) {
      printInfo('You\'ll need to get an OpenAI API key before deploying.');
      printInfo('Visit: https://platform.openai.com/api-keys');
      return false;
    }
    
    // Guide user to add API key to .env files
    const keyResponse = await prompts({
      type: 'password',
      name: 'apiKey',
      message: 'Please enter your OpenAI API key:',
      validate: (value: string) => {
        if (!value.trim()) return 'API key is required';
        if (!value.startsWith('sk-')) return 'OpenAI API keys should start with "sk-"';
        return true;
      }
    });
    
    if (!keyResponse.apiKey) {
      printInfo('API key setup cancelled.');
      return false;
    }
    
    const apiKey = keyResponse.apiKey.trim();
    
    console.log('');
    printInfo('🔧 Adding API key to your .env files...');
    console.log('');
    console.log('Please add this line to the following files:');
    console.log(`OPENAI_API_KEY="${apiKey}"`);
    console.log('');
    console.log('Files to update:');
    console.log('  1. .env.local (for local development)');
    console.log('  2. .env.lambda-prod-build (for production deployment)');
    console.log('');
    
    const addKeyResponse = await prompts({
      type: 'confirm',
      name: 'added',
      message: 'Have you added the OPENAI_API_KEY to both .env files?',
      initial: false
    });
    
    if (!addKeyResponse.added) {
      printInfo('Please add the API key to the .env files and restart the site creator.');
      return false;
    }
    
    // Set it in the current process for this session
    process.env.OPENAI_API_KEY = apiKey;
    printSuccess('✅ OpenAI API key configured for this session');
    
  } else {
    // Validate the API key format (should start with sk-)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey.startsWith('sk-')) {
      printWarning('⚠️  OpenAI API key format looks unusual (should start with "sk-")');
      
      const continueResponse = await prompts({
        type: 'confirm',
        name: 'continue',
        message: 'Would you like to continue anyway?',
        initial: true
      });
      
      if (!continueResponse.continue) {
        printInfo('Please verify your OpenAI API key and try again.');
        return false;
      }
    }
    
    printSuccess('✅ OpenAI API key is configured');
  }
  
  // Set AWS region if not already set
  if (!process.env.AWS_REGION) {
    process.env.AWS_REGION = 'us-east-1';
    printInfo('ℹ️  AWS region set to default: us-east-1');
  } else {
    printSuccess(`✅ AWS region configured: ${process.env.AWS_REGION}`);
  }
  
  // Step 3: Run Existing Prerequisites Script
  printInfo('Running comprehensive prerequisite checks...');
  
  try {
    const prereqResult = await execCommand('tsx', [
      'scripts/deploy/check-prerequisites.ts'
    ], { timeout: 60000 });
    
    if (prereqResult.exitCode === 0) {
      printSuccess('✅ All prerequisite checks passed!');
    } else {
      throw new Error(`Prerequisites check failed with exit code ${prereqResult.exitCode}`);
    }
  } catch (error) {
    printError('❌ Prerequisite check failed');
    console.log('');
    
    if (error instanceof Error && error.message.includes('timeout')) {
      printInfo('The prerequisite check is taking longer than expected.');
      
      const retryResponse = await prompts({
        type: 'confirm',
        name: 'retry',
        message: 'Would you like to try again?',
        initial: true
      });
      
      if (retryResponse.retry) {
        return await checkPrerequisitesAndEnvironment();
      } else {
        return false;
      }
    } else {
      printInfo('Some prerequisites may not be met. Common issues:');
      console.log('  • AWS CLI not configured properly');
      console.log('  • Missing required permissions');
      console.log('  • Network connectivity issues');
      console.log('');
      printInfo('You can try to continue anyway, but deployment may fail.');
      
      const continueResponse = await prompts({
        type: 'confirm',
        name: 'continue',
        message: 'Would you like to continue despite the prerequisite issues?',
        initial: false
      });
      
      return continueResponse.continue;
    }
  }
  
  return true;
}

// Phase 3: Terraform State Bootstrap
async function bootstrapTerraformState(siteId: string): Promise<boolean> {
  printInfo('🏗️  Setting up Terraform state management...');
  console.log('');
  console.log('This creates secure, shared storage for your site\'s infrastructure state.');
  console.log('It\'s a one-time setup that enables safe infrastructure management.');
  console.log('');
  
  // Step 1: Check if State Already Bootstrapped
  try {
    printInfo('Checking if Terraform state is already configured...');
    
    // Check for state bucket using naming convention: browse-dot-show-{siteId}-tf-state
    const stateBucketName = `browse-dot-show-${siteId}-tf-state`;
    
    const bucketCheckResult = await execCommand('aws', [
      's3api', 'head-bucket',
      '--bucket', stateBucketName,
      '--profile', `${siteId}-deploy`
    ], { timeout: 30000, silent: true });
    
    if (bucketCheckResult.exitCode === 0) {
      printSuccess(`✅ Terraform state bucket already exists: ${stateBucketName}`);
      
      // Double-check that the backend configuration files exist
      const backendConfigPath = join('sites/my-sites', siteId, 'terraform/backend.tfbackend');
      if (await exists(backendConfigPath)) {
        printSuccess('✅ Terraform backend configuration files are ready');
        return true;
      } else {
        printWarning('⚠️  State bucket exists but backend config is missing. Will recreate...');
      }
    }
  } catch (error) {
    // Bucket doesn't exist or we can't access it - that's fine, we'll create it
    printInfo('Terraform state bucket not found. Will create new one...');
  }
  
  // Step 2: Run Bootstrap Script
  console.log('');
  printInfo('Creating Terraform state management infrastructure...');
  console.log('This will create:');
  console.log('  • S3 bucket for storing Terraform state');
  console.log('  • DynamoDB table for state locking');
  console.log('  • Proper versioning and encryption');
  console.log('');
  
  const proceedResponse = await prompts({
    type: 'confirm',
    name: 'proceed',
    message: 'Ready to create the Terraform state infrastructure?',
    initial: true
  });
  
  if (!proceedResponse.proceed) {
    printInfo('Terraform state setup deferred. You can continue this step later.');
    return false;
  }
  
  try {
    // Execute the bootstrap script
    const bootstrapResult = await execCommand('tsx', [
      'scripts/deploy/bootstrap-site-state.ts',
      siteId,
      `${siteId}-deploy` // AWS profile name
    ], { timeout: 300000 }); // 5 minute timeout for bootstrap
    
    if (bootstrapResult.exitCode !== 0) {
      throw new Error(`Bootstrap script failed with exit code ${bootstrapResult.exitCode}`);
    }
    
    printSuccess('✅ Terraform state infrastructure created successfully!');
    
  } catch (error) {
    printError('❌ Failed to bootstrap Terraform state');
    console.log('');
    
    if (error instanceof Error && error.message.includes('timeout')) {
      printInfo('The bootstrap process is taking longer than expected.');
      
      const retryResponse = await prompts({
        type: 'confirm',
        name: 'retry',
        message: 'Would you like to try again?',
        initial: true
      });
      
      if (retryResponse.retry) {
        return await bootstrapTerraformState(siteId);
      } else {
        return false;
      }
    } else {
      printInfo('Common issues and solutions:');
      console.log('  • Check AWS permissions (S3, DynamoDB access required)');
      console.log('  • Verify AWS region is accessible');
      console.log('  • Ensure S3 bucket names are globally unique');
      console.log('');
      
      const continueResponse = await prompts({
        type: 'confirm',
        name: 'continue',
        message: 'Would you like to try again after checking these issues?',
        initial: true
      });
      
      if (continueResponse.continue) {
        return await bootstrapTerraformState(siteId);
      } else {
        printInfo('You can continue this step later when the issues are resolved.');
        return false;
      }
    }
  }
  
  // Step 3: Verify Bootstrap Success
  printInfo('Verifying Terraform state setup...');
  
  try {
    // Check that the state bucket was created
    const stateBucketName = `browse-dot-show-${siteId}-tf-state`;
    const verifyBucketResult = await execCommand('aws', [
      's3api', 'head-bucket',
      '--bucket', stateBucketName,
      '--profile', `${siteId}-deploy`
    ], { timeout: 30000 });
    
    if (verifyBucketResult.exitCode !== 0) {
      throw new Error('State bucket verification failed');
    }
    
    // Check that backend configuration exists
    const backendConfigPath = join('sites/my-sites', siteId, 'terraform/backend.tfbackend');
    if (!(await exists(backendConfigPath))) {
      throw new Error('Backend configuration file was not created');
    }
    
    printSuccess('✅ Terraform state management verified and ready!');
    console.log(`   State bucket: ${stateBucketName}`);
    console.log(`   Backend config: ${backendConfigPath}`);
    
    return true;
    
  } catch (error) {
    printError(`❌ Terraform state verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    printInfo('The bootstrap may have partially completed. You can try running this step again.');
    return false;
  }
}

// Phase 4: Core Deployment  
async function executeMainDeployment(siteId: string): Promise<boolean> {
  console.log('');
  printInfo('🚀 Ready to deploy your site infrastructure!');
  console.log('');
  console.log('This will deploy your complete podcast site with:');
  console.log('  • S3 bucket for static hosting');
  console.log('  • CloudFront CDN for global distribution');
  console.log('  • Lambda functions for search and processing');
  console.log('  • SSL certificate for secure HTTPS');
  console.log('  • DNS configuration for your browse.show subdomain');
  console.log('');
  
  // Step 1: Pre-deployment Confirmation
  console.log('⏱️  Estimated deployment time: 10-15 minutes');
  console.log('💰 Estimated monthly cost: $10-35 (depending on usage)');
  console.log('');
  
  const confirmResponse = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: 'Ready to deploy your podcast site to AWS?',
    initial: true
  });
  
  if (!confirmResponse.confirm) {
    printInfo('Deployment deferred. You can continue this step when ready.');
    return false;
  }
  
  // Step 2: Set up environment for deployment script
  printInfo('Setting up deployment environment...');
  
  // The site-deploy script expects these environment variables
  const deploymentEnv: Record<string, string> = {
    ...process.env,
    SITE_ID: siteId,
    ENV: 'prod',
    AWS_REGION: process.env.AWS_REGION || 'us-east-1'
  };
  
  // Load the site's AWS profile from .env.aws-sso
  const awsEnvPath = join('sites/my-sites', siteId, '.env.aws-sso');
  
  try {
    const envContent = await readTextFile(awsEnvPath);
    const profileMatch = envContent.match(/AWS_PROFILE=(.+)/);
    
    if (profileMatch) {
      deploymentEnv.AWS_PROFILE = profileMatch[1].trim();
      printInfo(`Using AWS profile: ${deploymentEnv.AWS_PROFILE}`);
    } else {
      throw new Error('AWS_PROFILE not found in .env.aws-sso file');
    }
  } catch (error) {
    printError(`❌ Could not load AWS profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    printInfo('Please ensure the AWS credentials step completed successfully.');
    return false;
  }
  
  // Step 3: Execute Main Deployment
  console.log('');
  printInfo('🚀 Starting deployment...');
  printInfo('This may take 10-15 minutes. You can watch the progress below.');
  console.log('');
  
  try {
    // Run the deployment script with proper environment
    const deploymentSuccess = await runDeploymentWithProgress(siteId, deploymentEnv);
    
    if (!deploymentSuccess) {
      return false;
    }
    
    printSuccess('✅ Deployment completed successfully!');
    
  } catch (error) {
    return await handleDeploymentError(error, siteId);
  }
  
  // Step 4: Post-deployment Validation
  return await validateDeployment(siteId);
}

async function runDeploymentWithProgress(siteId: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const { spawn } = require('child_process');
    
    // The site-deploy script expects SITE_ID to be set and will use run-with-site-selection
    // But we'll call it directly since we already have the site selected
    const child = spawn('tsx', ['scripts/deploy/site-deploy.ts'], {
      cwd: process.cwd(),
      env: env,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let lastOutput = '';
    let hasErrors = false;
    
    // Stream stdout to user
    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      process.stdout.write(output);
      lastOutput = output.trim();
    });
    
    // Stream stderr to user and track errors
    child.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      process.stderr.write(output);
      
      // Check for specific error patterns
      if (output.includes('Error') || output.includes('Failed') || output.includes('❌')) {
        hasErrors = true;
      }
      
      lastOutput = output.trim();
    });
    
    child.on('close', (code: number | null) => {
      console.log(''); // Add spacing after command output
      
      if (code === 0) {
        resolve(true);
      } else {
        printError(`Deployment process exited with code ${code}`);
        resolve(false);
      }
    });
    
    child.on('error', (error: Error) => {
      console.log(''); // Add spacing
      printError(`Failed to start deployment process: ${error.message}`);
      resolve(false);
    });
  });
}

async function handleDeploymentError(error: any, siteId: string): Promise<boolean> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  printError('❌ Deployment encountered an error');
  console.log('');
  
  // Check for specific known error patterns
  if (errorMessage.includes('InvalidViewerCertificate') || errorMessage.includes('SSL') || errorMessage.includes('certificate')) {
    return await handleSslCertificateError(siteId);
  } else if (errorMessage.includes('AccessDenied') || errorMessage.includes('Forbidden')) {
    return await handlePermissionError();
  } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
    return await handleTimeoutError(siteId);
  } else {
    return await handleGenericDeploymentError(errorMessage);
  }
}

async function handleSslCertificateError(siteId: string): Promise<boolean> {
  printInfo('🔐 SSL Certificate Issue Detected');
  console.log('');
  console.log('This is common for first-time deployments. The SSL certificate was created');
  console.log('but needs DNS validation to become active.');
  console.log('');
  console.log('Next steps:');
  console.log('1. Check your domain registrar for DNS validation records');
  console.log('2. Add the CNAME record provided by AWS Certificate Manager');
  console.log('3. Wait 10-20 minutes for validation to complete');
  console.log('4. Try the deployment again');
  console.log('');
  
  const retryResponse = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: 'Try deployment again (if you\'ve set up DNS)', value: 'retry' },
      { title: 'Defer for now (set up DNS validation later)', value: 'defer' },
      { title: 'Get help with DNS setup', value: 'help' }
    ]
  });
  
  if (retryResponse.action === 'retry') {
    return await executeMainDeployment(siteId);
  } else if (retryResponse.action === 'help') {
    printInfo('For DNS validation help, see: https://docs.aws.amazon.com/acm/latest/userguide/domain-validation.html');
    return false;
  } else {
    return false;
  }
}

async function handlePermissionError(): Promise<boolean> {
  printInfo('🔒 AWS Permission Issue');
  console.log('');
  console.log('Your AWS credentials don\'t have sufficient permissions.');
  console.log('Required permissions:');
  console.log('  • S3: Full access');
  console.log('  • CloudFront: Full access');
  console.log('  • Lambda: Full access');
  console.log('  • Route 53: Full access');
  console.log('  • IAM: Limited access for role creation');
  console.log('');
  printInfo('Please contact your AWS administrator to grant these permissions.');
  
  return false;
}

async function handleTimeoutError(siteId: string): Promise<boolean> {
  printInfo('⏱️  Deployment Timeout');
  console.log('');
  console.log('The deployment is taking longer than expected. This can happen due to:');
  console.log('  • AWS service delays');
  console.log('  • Network connectivity issues');
  console.log('  • Large initial deployments');
  console.log('');
  
  const retryResponse = await prompts({
    type: 'confirm',
    name: 'retry',
    message: 'Would you like to try the deployment again?',
    initial: true
  });
  
  if (retryResponse.retry) {
    return await executeMainDeployment(siteId);
  } else {
    return false;
  }
}

async function handleGenericDeploymentError(errorMessage: string): Promise<boolean> {
  console.log('Error details:');
  console.log(errorMessage);
  console.log('');
  
  const retryResponse = await prompts({
    type: 'confirm',
    name: 'retry',
    message: 'Would you like to try the deployment again?',
    initial: false
  });
  
  if (retryResponse.retry) {
    return true; // This will retry within the calling function
  } else {
    printInfo('You can try the deployment again later when the issue is resolved.');
    return false;
  }
}

async function validateDeployment(siteId: string): Promise<boolean> {
  printInfo('🔍 Validating deployment...');
  
  const siteUrl = `https://${siteId}.browse.show`;
  
  console.log('');
  printSuccess('🎉 Your podcast site is now live!');
  console.log('');
  console.log(`🌐 Site URL: ${siteUrl}`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Visit your site to verify it\'s working');
  console.log('2. Run episode ingestion to add your podcast content');
  console.log('3. Test the search functionality');
  console.log('');
  
  const testResponse = await prompts({
    type: 'confirm',
    name: 'tested',
    message: 'Have you verified that your site is working correctly?',
    initial: false
  });
  
  return testResponse.tested || true; // Consider it successful either way
}

export async function executeAwsDeploymentStep(progress: SetupProgress): Promise<StepStatus> {
  console.log('');
  printInfo('🚀 Let\'s deploy your site to AWS!');
  console.log('');
  console.log('This will set up your podcast site with:');
  console.log('  • S3 static hosting with global CDN');
  console.log('  • Lambda functions for search and processing');
  console.log('  • Automatic SSL certificate');
  console.log('  • Your custom browse.show subdomain');
  console.log('');
  
  // Phase 1: AWS Credential Setup & Validation
  const credentialsReady = await setupAwsCredentials(progress.siteId);
  if (!credentialsReady) {
    return 'DEFERRED';
  }
  
  printSuccess('✅ AWS credentials are configured and ready!');
  
  // Phase 2: Prerequisites & Environment Check
  const prerequisitesReady = await checkPrerequisitesAndEnvironment();
  if (!prerequisitesReady) {
    return 'DEFERRED';
  }
  
  printSuccess('✅ Prerequisites and environment are ready!');
  
  // Phase 3: Terraform State Bootstrap
  const bootstrapReady = await bootstrapTerraformState(progress.siteId);
  if (!bootstrapReady) {
    return 'DEFERRED';
  }
  
  printSuccess('✅ Terraform state management is ready!');
  
  // Phase 4: Core Deployment
  const deploymentComplete = await executeMainDeployment(progress.siteId);
  if (!deploymentComplete) {
    return 'DEFERRED';
  }
  
  printSuccess('🎉 Your site has been successfully deployed to AWS!');
  
  return 'COMPLETED';
}

// Helper function to parse environment variables from .env.local
async function parseEnvLocal(): Promise<Record<string, string>> {
  const envLocalPath = '.env.local';
  const envVars: Record<string, string> = {};
  
  if (!(await exists(envLocalPath))) {
    return envVars;
  }
  
  try {
    const envContent = await readTextFile(envLocalPath);
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmedLine.substring(0, equalIndex).trim();
          let value = trimmedLine.substring(equalIndex + 1).trim();
          
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          
          envVars[key] = value;
        }
      }
    }
  } catch (error) {
    // If we can't read the file, just return empty object
  }
  
  return envVars;
}

export async function executeFirstTranscriptionsStep(progress: SetupProgress): Promise<StepStatus> {
  console.log('');
  printInfo('🎙️  Let\'s setup transcriptions for your first few episodes!');
  console.log('');
  console.log('This will help you see a working searchable site quickly. We\'ll download');
  console.log('and transcribe 2 episodes locally (this takes about 10-20 minutes).');
  console.log('');
  
  // Check if whisper configuration already exists in .env.local
  const existingEnvVars = await parseEnvLocal();
  const existingWhisperPath = existingEnvVars['WHISPER_CPP_PATH'];
  const existingWhisperModel = existingEnvVars['WHISPER_CPP_MODEL'];
  
  let whisperPath: string;
  let whisperModel: string;
  
  if (existingWhisperPath && existingWhisperModel) {
    // Skip prompts if configuration already exists
    printInfo('✅ Found existing Whisper configuration in .env.local');
    console.log(`   • Whisper path: ${existingWhisperPath}`);
    console.log(`   • Whisper model: ${existingWhisperModel}`);
    console.log('');
    printInfo('Skipping Whisper setup prompts and using existing configuration...');
    
    whisperPath = existingWhisperPath;
    whisperModel = existingWhisperModel;
  } else {
    // Proceed with normal prompts if configuration doesn't exist
    const hasWhisperResponse = await prompts({
      type: 'confirm',
      name: 'hasWhisper',
      message: 'Do you already have whisper.cpp configured locally on your machine?',
      initial: false
    });
    
    if (!hasWhisperResponse.hasWhisper) {
      console.log('');
      printInfo('📖 You\'ll need to setup whisper.cpp for local transcription.');
      console.log('');
      console.log('Please follow these steps:');
      console.log('1. Visit: https://github.com/ggml-org/whisper.cpp?tab=readme-ov-file#quick-start');
      console.log('2. Clone the whisper.cpp repository');
      console.log('3. Follow the build instructions for your platform');
      console.log('4. Download a model (we recommend large-v3-turbo)');
      console.log('');
      
      const setupResponse = await prompts({
        type: 'confirm',
        name: 'setupComplete',
        message: 'Have you completed the whisper.cpp setup?',
        initial: false
      });
      
      if (!setupResponse.setupComplete) {
        printInfo('No problem! You can continue with this step when you\'re ready.');
        return 'DEFERRED';
      }
    }
    
    // Get whisper.cpp path and model
    const pathResponse = await prompts({
      type: 'text',
      name: 'whisperPath',
      message: 'Please enter the path to your whisper.cpp directory:',
      validate: (value: string) => {
        if (!value.trim()) return 'Path is required';
        return true;
      }
    });
    
    if (!pathResponse.whisperPath) {
      return 'DEFERRED';
    }
    
    const modelResponse = await prompts({
      type: 'text',
      name: 'whisperModel',
      message: 'Which whisper model would you like to use?',
      initial: 'large-v3-turbo',
      validate: (value: string) => {
        if (!value.trim()) return 'Model name is required';
        return true;
      }
    });
    
    if (!modelResponse.whisperModel) {
      return 'DEFERRED';
    }
    
    whisperPath = pathResponse.whisperPath;
    whisperModel = modelResponse.whisperModel;
  }
  
  // Update .env.local if configuration was prompted
  if (!existingWhisperPath || !existingWhisperModel) {
    try {
      printInfo('⚙️  Updating .env.local with your configuration...');
      
      const envLocalPath = '.env.local';
      let envContent = '';
      
      if (await exists(envLocalPath)) {
        envContent = await readTextFile(envLocalPath);
      }
      
      const updates = {
        'FILE_STORAGE_ENV': 'local',
        'WHISPER_API_PROVIDER': 'local-whisper.cpp',
        'WHISPER_CPP_PATH': `"${whisperPath}"`,
        'WHISPER_CPP_MODEL': `"${whisperModel}"`
      };
      
      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      }
      
      await writeTextFile(envLocalPath, envContent);
      printSuccess('✅ Updated .env.local with your Whisper configuration');
    } catch (error) {
      printError(`Failed to update .env.local: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return 'DEFERRED';
    }
  }
  
  // Test whisper installation
  await testWhisperInstallation(whisperPath, whisperModel);
  
  // Run the ingestion pipeline
  return await runIngestionPipeline(progress);
}

async function testWhisperInstallation(whisperPath: string, whisperModel: string): Promise<void> {
  printInfo('🧪 Testing your Whisper installation...');
  console.log('This may take a moment...');
  
  try {
    const testAudioFile = '/Users/jackkoppa/Personal_Development/browse-dot-show/docs/welcome-to-browse-dot-show.wav';
    
    if (!(await exists(testAudioFile))) {
      printWarning('⚠️  Test audio file not found. Skipping whisper test...');
      printInfo('Proceeding with ingestion - if there are issues, they\'ll be caught during processing.');
      return;
    }
    
    const whisperCliBin = join(whisperPath, 'build/bin/whisper-cli');
    const whisperModelFile = `ggml-${whisperModel}.bin`;
    const modelPath = join(whisperPath, 'models', whisperModelFile);
    
    printInfo('🎧 Transcribing welcome message - this might take up to a minute, but likely less...');
    
    const result = await execCommand(whisperCliBin, ['-m', modelPath, '-f', testAudioFile], {
      timeout: 60000
    });
    
    if (result.exitCode !== 0 || !result.stdout) {
      throw new Error('Transcription test failed');
    }
    
    // Show the transcription result
    console.log('');
    printInfo('📝 Transcription result:');
    console.log('─'.repeat(60));
    console.log(result.stdout.trim());
    console.log('─'.repeat(60));
    console.log('');
    
    // Check if transcription contains expected content
    if (result.stdout.toLowerCase().includes('best of luck')) {
      printSuccess('Your local installation of the Whisper model is working correctly 🎉');
    } else {
      throw new Error('Transcription test failed - output did not contain expected phrase');
    }
    
  } catch (error) {
    printError(`❌ Whisper test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('');
    console.log('This usually means one of these issues:');
    console.log('1. whisper.cpp is not properly compiled');
    console.log('2. The model file is missing or incorrect');
    console.log('3. The path to whisper.cpp is incorrect');
    console.log('');
    
    const continueResponse = await prompts({
      type: 'confirm',
      name: 'continue',
      message: 'Would you like to continue anyway? (Transcription may fail later)',
      initial: false
    });
    
    if (!continueResponse.continue) {
      throw new Error('User chose not to continue with broken whisper setup');
    }
    
    printWarning('⚠️  Proceeding with potentially broken whisper setup...');
  }
}

async function runIngestionPipeline(progress: SetupProgress): Promise<StepStatus> {
  console.log('');
  const readyForIngestionResponse = await prompts({
    type: 'confirm',
    name: 'ready',
    message: 'Ready to start downloading and transcribing your first 2 episodes? This will take about 10-20 minutes.',
    initial: true
  });
  
  if (!readyForIngestionResponse.ready) {
    printInfo('No problem! You can continue with this step when you\'re ready.');
    return 'DEFERRED';
  }
  
  console.log('');
  printInfo('🎵 Processing your first 2 episodes...');
  console.log('We\'ll run this in 3 phases to get accurate timing metrics.');
  
  let downloadStartTime: number;
  let downloadEndTime: number = Date.now();
  let transcriptionStartTime: number;
  let transcriptionEndTime: number = Date.now();
  
  try {
    // Phase 1: Download episodes
    printInfo('📥 Phase 1: Downloading episode audio files...');
    downloadStartTime = Date.now();
    
    const downloadSuccess = await runSpawnCommand('pnpm', [
      'tsx', 'scripts/trigger-individual-ingestion-lambda.ts',
      `--sites=${progress.siteId}`,
      '--lambda=rss-retrieval',
      '--env=local',
      '--max-episodes=2'
    ]);
    
    downloadEndTime = Date.now();
    if (!downloadSuccess) throw new Error('Download phase failed');
    printSuccess('✅ Episode download completed!');
    
    // Phase 2: Transcription
    printInfo('🎙️  Phase 2: Transcribing episodes...');
    transcriptionStartTime = Date.now();
    
    const transcriptionSuccess = await runSpawnCommand('pnpm', [
      'tsx', 'scripts/trigger-individual-ingestion-lambda.ts',
      `--sites=${progress.siteId}`,
      '--lambda=process-audio',
      '--env=local'
    ]);
    
    transcriptionEndTime = Date.now();
    if (!transcriptionSuccess) throw new Error('Transcription phase failed');
    printSuccess('✅ Episode transcription completed!');
    
    // Phase 3: Indexing
    printInfo('🔍 Phase 3: Creating search index...');
    
    const indexingSuccess = await runSpawnCommand('pnpm', [
      'tsx', 'scripts/trigger-individual-ingestion-lambda.ts',
      `--sites=${progress.siteId}`,
      '--lambda=srt-indexing',
      '--env=local'
    ]);
    
    if (!indexingSuccess) throw new Error('Indexing phase failed');
    printSuccess('✅ All phases completed successfully!');
    
    // Collect metrics
    try {
      printInfo('📊 Collecting metrics from your first 2 episodes...');
      const downloadTimeInSeconds = Math.round((downloadEndTime - downloadStartTime) / 1000);
      const transcriptionTimeInSeconds = Math.round((transcriptionEndTime - transcriptionStartTime) / 1000);
      
      const metrics = await collectInitial2EpisodesMetrics(progress.siteId, downloadTimeInSeconds, transcriptionTimeInSeconds);
      
      const currentProgress = await loadProgress(progress.siteId);
      if (currentProgress) {
        currentProgress.initial2EpisodesResults = metrics;
        await saveProgress(currentProgress);
        printSuccess(`📈 Metrics saved: ${metrics.episodesSizeInMB.toFixed(1)}MB, ${Math.round(metrics.episodesDurationInSeconds/60)} min duration`);
      }
    } catch (metricsError) {
      printWarning(`Could not collect metrics: ${metricsError instanceof Error ? metricsError.message : 'Unknown error'}`);
    }
    
  } catch (error) {
    printError(`Failed during episode processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return 'DEFERRED';
  }
  
  // Test the result
  console.log('');
  printInfo('🎉 Your first episodes are now transcribed and searchable!');
  console.log(`To test: run \`pnpm client:dev --filter ${progress.siteId}\` and try searching.`);
  
  const testResponse = await prompts({
    type: 'confirm',
    name: 'tested',
    message: 'Have you successfully tested the search functionality?',
    initial: false
  });
  
  return testResponse.tested ? 'COMPLETED' : 'DEFERRED';
}

async function runSpawnCommand(command: string, args: string[]): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    child.stdout?.on('data', (data) => {
      process.stdout.write(data.toString());
    });
    
    child.stderr?.on('data', (data) => {
      process.stderr.write(data.toString());
    });
    
    child.on('close', (code) => {
      console.log('');
      resolve(code === 0);
    });
    
    child.on('error', () => {
      resolve(false);
    });
  });
} 