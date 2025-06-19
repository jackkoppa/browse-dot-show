#!/usr/bin/env tsx

import { join } from 'path';
import { execCommandOrThrow } from '../utils/shell-exec.js';
import { exists } from '../utils/file-operations.js';
import { loadEnvFile } from '../utils/env-validation.js';
import { printInfo, printError, printWarning, printSuccess, logHeader, promptUser } from '../utils/logging.js';
import { checkAwsCredentials } from '../utils/aws-utils.js';

interface DeploymentOptions {
  test: boolean;
  lint: boolean;
  client: boolean;
}

interface MultiSelectChoice {
  title: string;
  value: string;
  selected: boolean;
}



async function askConfirmation(message: string): Promise<boolean> {
  const response = await promptUser(`${message} (y/N): `);
  return /^[yY]$/.test(response);
}

async function askMultiSelect(message: string, choices: MultiSelectChoice[]): Promise<string[]> {
  console.log(`\n${message}`);
  console.log('Select options (enter numbers separated by commas, or press Enter for defaults):');
  
  choices.forEach((choice, index) => {
    const selected = choice.selected ? '✓' : ' ';
    console.log(`  ${index + 1}. [${selected}] ${choice.title}`);
  });

  const input = await promptUser('\nYour selection (e.g., 1,2,3): ');
  
  if (!input.trim()) {
    // Return default selected choices
    return choices.filter(choice => choice.selected).map(choice => choice.value);
  }

  const selectedIndices = input.split(',')
    .map(s => parseInt(s.trim()) - 1)
    .filter(i => i >= 0 && i < choices.length);

  return selectedIndices.map(i => choices[i].value);
}

async function validateEnvironment(): Promise<void> {
  // Check if .env.prod exists and load it
  if (!(await exists('.env.prod'))) {
    printError('Warning: .env.prod file not found. Make sure to create it with necessary credentials.');
    process.exit(1);
  }

  printInfo('Loading environment variables from .env.prod');
  const envVars = await loadEnvFile('.env.prod');

  // Set environment variables for the process
  Object.entries(envVars).forEach(([key, value]) => {
    process.env[key] = value;
  });

  // Validate required environment variables
  if (!process.env.OPENAI_API_KEY) {
    printError('Error: OpenAI API key is missing.');
    printError('Make sure .env.prod contains:');
    printError('  OPENAI_API_KEY=your_openai_api_key');
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
    printError('Prerequisite check failed. Please address the issues above before deploying.');
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

async function askDeploymentOptions(): Promise<DeploymentOptions> {
  const choices: MultiSelectChoice[] = [
    { title: 'Run tests (pnpm all:test)', value: 'test', selected: true },
    { title: 'Run linting (pnpm lint:prod)', value: 'lint', selected: true },
    { title: 'Deploy client files to S3', value: 'client', selected: true }
  ];

  const selectedOptions = await askMultiSelect('Select pre-deployment steps to run:', choices);

  return {
    test: selectedOptions.includes('test'),
    lint: selectedOptions.includes('lint'),
    client: selectedOptions.includes('client')
  };
}

async function runPreDeploymentSteps(options: DeploymentOptions, env: string): Promise<void> {
  // Run optional pre-deployment steps based on user selection
  if (options.test) {
    printInfo('Running all tests...');
    await execCommandOrThrow('pnpm', ['all:test']);
  }

  if (options.lint) {
    printInfo('Running linting...');
    await execCommandOrThrow('pnpm', ['lint:prod']);
  }

  printInfo(`Building all packages for ${env} environment...`);
  await execCommandOrThrow('pnpm', ['install']);
  
  // Build shared packages
  await execCommandOrThrow('pnpm', ['all:build']);
  
  // Build /packages/processing lambdas, /packages/search lambdas, and /packages/client UI app
  await execCommandOrThrow('pnpm', [`all:build:${env}`]);
}

async function runTerraformDeployment(siteId: string): Promise<void> {
  const TF_DIR = 'terraform';
  const BACKEND_CONFIG_FILE = `backend-configs/${siteId}.tfbackend`;

  printInfo(`Navigating to Terraform directory: ${TF_DIR}`);
  
  // Change to terraform directory
  const originalCwd = process.cwd();
  process.chdir(TF_DIR);

  try {
    // Bootstrap terraform state bucket if needed
    printInfo('Bootstrapping Terraform state bucket...');
    await execCommandOrThrow('../scripts/deploy/bootstrap-terraform-state.ts', [siteId, process.env.AWS_PROFILE || '']);

    // Initialize Terraform with site-specific backend config
    printInfo(`Initializing Terraform with backend config: ${BACKEND_CONFIG_FILE}`);
    await execCommandOrThrow('terraform', ['init', '-backend-config', BACKEND_CONFIG_FILE, '-reconfigure']);

    // Validate Terraform configuration
    printInfo('Validating Terraform configuration...');
    await execCommandOrThrow('terraform', ['validate']);

    // Set up Terraform plan arguments
    const terraformArgs = [
      'plan',
      `-var-file=environments/${siteId}-prod.tfvars`,
      `-var=openai_api_key=${process.env.OPENAI_API_KEY}`,
      `-var=site_id=${siteId}`,
      '-out=tfplan'
    ];

    if (process.env.AWS_PROFILE) {
      terraformArgs.splice(-1, 0, `-var=aws_profile=${process.env.AWS_PROFILE}`);
    }

    // Plan the deployment
    await execCommandOrThrow('terraform', terraformArgs);

    // Ask for confirmation before applying
    const applyConfirmed = await askConfirmation('Do you want to apply this Terraform plan?');
    
    if (applyConfirmed) {
      printInfo('Applying Terraform plan...');
      await execCommandOrThrow('terraform', ['apply', '-auto-approve', 'tfplan']);
      
      printInfo('Terraform apply completed.');
      printInfo('State is automatically managed by S3 backend.');

      // Display outputs
      printSuccess('======= Deployment Complete =======');
      await execCommandOrThrow('terraform', ['output']);
    } else {
      printInfo('Deployment cancelled.');
      return;
    }
  } finally {
    // Return to the project root
    process.chdir(originalCwd);
    printInfo(`Returned to ${process.cwd()}`);
  }
}

async function uploadClientFiles(siteId: string, env: string, clientSelected: boolean): Promise<void> {
  if (clientSelected) {
    console.log('');
    printInfo('=== Uploading client files to S3 ===');
    printInfo(`Uploading client files for site ${siteId}...`);
    await execCommandOrThrow('tsx', ['scripts/deploy/upload-client.ts', env, siteId]);
  } else {
    console.log('');
    printInfo('=== Skipping client upload ===');
    printInfo(`Client upload was not selected. You can run it later with: tsx scripts/deploy/upload-client.ts ${env} ${siteId}`);
  }
}

async function main(): Promise<void> {
  // Setup stdin for interactive mode
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  try {
    logHeader('Deploy Infrastructure and Applications');

    // Get selected site from environment (set by site selection wrapper)
    const siteId = process.env.SELECTED_SITE_ID;
    if (!siteId) {
      printError('Error: No site selected. This script should be run through the site selection wrapper.');
      printError('Use: pnpm all:deploy');
      process.exit(1);
    }

    printInfo(`🌐 Deploying site: ${siteId}`);

    // Deploy only to production (Phase 7: simplified environment model)
    const env = 'prod';
    printInfo(`Deploying to production for site ${siteId}...`);

    // Set environment variables for child processes
    process.env.ENV = env;
    process.env.SITE_ID = siteId;

    // Run prerequisite check
    await checkPrerequisites();

    // Ask user about optional pre-deployment steps
    const deploymentOptions = await askDeploymentOptions();

    // Load and validate environment
    await validateEnvironment();

    // Check AWS authentication
    await checkAwsAuthentication();

    // Run pre-deployment steps
    await runPreDeploymentSteps(deploymentOptions, env);

    // Run Terraform deployment
    await runTerraformDeployment(siteId);

    // Upload client files if selected
    await uploadClientFiles(siteId, env, deploymentOptions.client);

  } catch (error) {
    printError(`Deployment failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nDeployment cancelled...');
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
});

main(); 