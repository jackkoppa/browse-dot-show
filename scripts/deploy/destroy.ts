#!/usr/bin/env tsx

import { join } from 'path';
import { execCommandOrThrow } from '../utils/shell-exec.js';
import { exists } from '../utils/file-operations.js';
import { loadEnvFile } from '../utils/env-validation.js';
import { printInfo, printError, printWarning, printSuccess, logHeader } from '../utils/logging.js';
import { checkAwsCredentials } from '../utils/aws-utils.js';
// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';



async function validateEnvironment(): Promise<void> {
  // Note: AWS_PROFILE should already be loaded from site .env.aws-sso by the run-with-site-selection script
  
  // Validate required environment variables
  if (!process.env.OPENAI_API_KEY) {
    printError('Error: OpenAI API key is missing.');
    printError('Please set OPENAI_API_KEY environment variable.');
    process.exit(1);
  }

  // Set AWS region if not already set
  process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
}

async function checkPrerequisites(): Promise<void> {
  printInfo('Running prerequisite checks...');
  try {
    await execCommandOrThrow('tsx', ['scripts/deploy/check-prerequisites.ts']);
  } catch (error) {
    printError('Prerequisite check failed. Please address the issues above before destroying.');
    process.exit(1);
  }
}

async function checkAwsAuthentication(): Promise<void> {
  // Set AWS profile if specified and export it for sourced scripts
  if (process.env.AWS_PROFILE) {
    printInfo(`Using AWS SSO profile: ${process.env.AWS_PROFILE}`);
    
    // Check if SSO session is active
    if (!(await checkAwsCredentials(process.env.AWS_PROFILE))) {
      printError(`AWS SSO session is not active or has expired for profile ${process.env.AWS_PROFILE}`);
      printError(`Please run: aws sso login --profile ${process.env.AWS_PROFILE}`);
      process.exit(1);
    }
  }
}

async function confirmDestruction(env: string): Promise<void> {
  // Warn if trying to destroy production
  if (env === 'prod') {
    printWarning('WARNING: You are about to destroy the PRODUCTION environment!');
    const response = await prompts({
      type: 'text',
      name: 'confirmation',
      message: 'Type \'destroy-prod\' to confirm:',
      validate: (value: string) => value === 'destroy-prod' ? true : 'You must type exactly \'destroy-prod\' to confirm'
    });
    
    if (!response.confirmation || response.confirmation !== 'destroy-prod') {
      printInfo('Destruction cancelled.');
      process.exit(1);
    }
  }
}

async function runTerraformDestroy(siteId: string, env: string): Promise<void> {
  printInfo(`Destroying ${env} environment...`);
  
  // Change to terraform directory
  const originalCwd = process.cwd();
  process.chdir('terraform');

  try {
    // Initialize Terraform (if needed)
    printInfo('Initializing Terraform...');
    await execCommandOrThrow('terraform', ['init']);

    // Set profile flag if using AWS profile
    const terraformArgs = [
      'destroy',
      `-var-file=environments/${siteId}-prod.tfvars`,
      `-var=openai_api_key=${process.env.OPENAI_API_KEY}`,
      `-var=site_id=${siteId}`,
      '-auto-approve'
    ];

    if (process.env.AWS_PROFILE) {
      terraformArgs.splice(-1, 0, `-var=aws_profile=${process.env.AWS_PROFILE}`);
    }

    // Destroy the infrastructure
    await execCommandOrThrow('terraform', terraformArgs);

    printSuccess('======= Destruction Complete =======');
  } finally {
    // Return to original directory
    process.chdir(originalCwd);
  }
}

async function main(): Promise<void> {
  // Setup stdin for interactive mode
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  try {
    logHeader('Destroy Infrastructure');

    // Deploy only to production (Phase 7: simplified environment model)
    const env = 'prod';

    // Get selected site from environment (set by site selection wrapper)
    const siteId = process.env.SITE_ID;
    if (!siteId) {
      printError('Error: No site selected. SITE_ID environment variable must be set.');
      printError('Use: SITE_ID=your-site-id tsx scripts/deploy/destroy.ts');
      process.exit(1);
    }

    printInfo(`🌐 Destroying site: ${siteId}`);

    // Run prerequisite check
    await checkPrerequisites();

    // Load and validate environment
    await validateEnvironment();

    // Check AWS authentication
    await checkAwsAuthentication();

    // Confirm destruction
    await confirmDestruction(env);

    // Run Terraform destroy
    await runTerraformDestroy(siteId, env);

  } catch (error) {
    printError(`Destruction failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nDestruction cancelled...');
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
});

main(); 