#!/usr/bin/env tsx

// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import { execCommandOrThrow, execCommand } from '../utils/shell-exec.js';
import { printInfo, printError, printSuccess, logHeader } from '../utils/logging.js';
import { validateHomepageAwsEnvironment } from '../utils/aws-utils.js';
import { loadHomepageEnvVars } from '../utils/env-validation.js';

interface DeploymentOptions {
  test: boolean;
  lint: boolean;
  build: boolean;
  terraform: boolean;
  upload: boolean;
}

async function askConfirmation(message: string): Promise<boolean> {
  const response = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message: message,
    initial: false
  });
  return response.confirmed;
}

async function askDeploymentOptions(): Promise<DeploymentOptions> {
  const choices = [
    { title: 'Run tests (pnpm all:test)', value: 'test', selected: true },
    { title: 'Run linting (pnpm all:lint)', value: 'lint', selected: true },
    { title: 'Build homepage package', value: 'build', selected: true },
    { title: 'Deploy Terraform infrastructure', value: 'terraform', selected: true },
    { title: 'Upload homepage files to S3', value: 'upload', selected: true }
  ];

  const response = await prompts({
    type: 'multiselect',
    name: 'selectedOptions',
    message: 'Select deployment steps to run:',
    choices: choices,
    hint: '- Space to select/deselect. Return to continue'
  });

  if (!response.selectedOptions) {
    printInfo('Deployment cancelled.');
    process.exit(0);
  }

  return {
    test: response.selectedOptions.includes('test'),
    lint: response.selectedOptions.includes('lint'),
    build: response.selectedOptions.includes('build'),
    terraform: response.selectedOptions.includes('terraform'),
    upload: response.selectedOptions.includes('upload')
  };
}

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

async function runPreDeploymentSteps(options: DeploymentOptions): Promise<void> {
  if (options.test) {
    printInfo('Running all tests...');
    await execCommandOrThrow('pnpm', ['all:test']);
  }

  if (options.lint) {
    printInfo('Running linting...');
    await execCommandOrThrow('pnpm', ['all:lint']);
  }

  if (options.build) {
    printInfo('Installing dependencies...');
    await execCommandOrThrow('pnpm', ['install']);
    
    printInfo('Building all packages...');
    await execCommandOrThrow('pnpm', ['all:build']);
    
    printInfo('Building homepage for production...');
    await execCommandOrThrow('pnpm', ['--filter', 'homepage', 'build']);
  }
}

async function runTerraformDeployment(): Promise<{ bucketName: string; distributionId: string }> {
  const TF_DIR = 'terraform-homepage';
  
  printInfo(`Navigating to Terraform directory: ${TF_DIR}`);
  
  // Change to terraform directory
  const originalCwd = process.cwd();
  process.chdir(TF_DIR);

  try {
    // Initialize Terraform with backend config
    printInfo('Initializing Terraform...');
    await execCommandOrThrow('terraform', [
      'init',
      '-backend-config=terraform.tfbackend'
    ]);

    // Plan the deployment
    printInfo('Planning Terraform deployment...');
    await execCommandOrThrow('terraform', [
      'plan',
      '-var-file=homepage-prod.tfvars',
      '-out=tfplan'
    ]);

    // Apply the deployment
    printInfo('Applying Terraform deployment...');
    await execCommandOrThrow('terraform', ['apply', '-auto-approve', 'tfplan']);

    // Get outputs
    printInfo('Getting Terraform outputs...');
    const bucketOutput = await execCommand('terraform', ['output', '-raw', 's3_bucket_name']);
    const distributionOutput = await execCommand('terraform', ['output', '-raw', 'cloudfront_distribution_id']);
    
    const bucketName = bucketOutput.stdout.trim();
    const distributionId = distributionOutput.stdout.trim();

    printSuccess('✅ Terraform deployment completed!');
    
    return { bucketName, distributionId };
  } finally {
    // Always return to original directory
    process.chdir(originalCwd);
  }
}

async function uploadHomepageFiles(bucketName: string, distributionId: string): Promise<void> {
  const DIST_DIR = 'packages/homepage/dist';
  
  printInfo(`Uploading homepage files from ${DIST_DIR} to S3 bucket: ${bucketName}`);
  
  // Sync files to S3
  await execCommandOrThrow('aws', [
    's3',
    'sync',
    DIST_DIR,
    `s3://${bucketName}/`,
    '--delete',
    '--cache-control',
    'max-age=31536000',  // 1 year for assets
    '--exclude',
    'index.html'
  ]);

  // Upload index.html with shorter cache
  await execCommandOrThrow('aws', [
    's3',
    'cp',
    `${DIST_DIR}/index.html`,
    `s3://${bucketName}/index.html`,
    '--cache-control',
    'max-age=3600'  // 1 hour for index.html
  ]);

  printInfo('Creating CloudFront invalidation...');
  await execCommandOrThrow('aws', [
    'cloudfront',
    'create-invalidation',
    '--distribution-id',
    distributionId,
    '--paths',
    '/*'
  ]);

  printSuccess('✅ Homepage files uploaded successfully!');
}

async function displayDeploymentInfo(): Promise<void> {
  printSuccess('🎉 Homepage deployment completed!');
  printInfo('');
  printInfo('Next steps:');
  printInfo('1. Configure DNS for browse.show to point to the CloudFront distribution');
  printInfo('2. Wait for SSL certificate validation (may take a few minutes)');
  printInfo('3. Verify the homepage is accessible at https://browse.show');
  printInfo('');
  printInfo('To get the CloudFront domain name:');
  printInfo('  cd terraform-homepage && terraform output cloudfront_distribution_domain_name');
  printInfo('');
  printInfo('To get SSL certificate validation records:');
  printInfo('  cd terraform-homepage && terraform output ssl_certificate_validation_options');
}

async function main(): Promise<void> {
  logHeader('🚀 Deploy Homepage to browse.show');

  // Load environment and validate AWS authentication
  const awsProfile = await loadHomepageEnvironmentAndValidateAws();

  // Ask for deployment options
  const options = await askDeploymentOptions();

  // Confirm deployment
  if (!(await askConfirmation('Are you sure you want to deploy the homepage to production?'))) {
    printInfo('Deployment cancelled.');
    return;
  }

  try {
    // Run pre-deployment steps
    await runPreDeploymentSteps(options);

    let bucketName = '';
    let distributionId = '';

    // Deploy Terraform infrastructure
    if (options.terraform) {
      const tfResults = await runTerraformDeployment();
      bucketName = tfResults.bucketName;
      distributionId = tfResults.distributionId;
    }

    // Upload files if we have bucket info
    if (options.upload) {
      if (!bucketName || !distributionId) {
        // Try to get from existing Terraform state
        const originalCwd = process.cwd();
        process.chdir('terraform-homepage');
        try {
          const bucketOutput = await execCommand('terraform', ['output', '-raw', 's3_bucket_name']);
          const distributionOutput = await execCommand('terraform', ['output', '-raw', 'cloudfront_distribution_id']);
          bucketName = bucketOutput.stdout.trim();
          distributionId = distributionOutput.stdout.trim();
        } finally {
          process.chdir(originalCwd);
        }
      }
      
      if (bucketName && distributionId) {
        await uploadHomepageFiles(bucketName, distributionId);
      } else {
        printError('Could not determine S3 bucket name or CloudFront distribution ID');
        printError('Please ensure Terraform has been deployed first');
        process.exit(1);
      }
    }

    await displayDeploymentInfo();

  } catch (error: any) {
    printError('Deployment failed:', error.message);
    process.exit(1);
  }
}

// Run the script
main().catch((error: Error) => {
  printError('Deployment failed:', error.message);
  process.exit(1);
}); 