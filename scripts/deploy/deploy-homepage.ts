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

async function applyTerraformWithProgress(): Promise<void> {
  const { spawn } = await import('child_process');
  
  return new Promise((resolve, reject) => {
    const child = spawn('terraform', ['apply', '-auto-approve', 'tfplan'], {
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let lastOutput = '';
    let progressInterval: NodeJS.Timeout;
    let progressCounter = 0;

    // Set up progress indicator
    const showProgress = () => {
      process.stdout.write(`\r🔄 Terraform applying... (${++progressCounter * 5}s) | Latest: ${lastOutput.substring(0, 40).trim()}...`);
    };

    progressInterval = setInterval(showProgress, 5000);

    // Capture stdout
    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      if (output) {
        lastOutput = output.split('\n').pop() || output;
        // Show real-time updates for important lines
        if (output.includes('Creating...') || output.includes('Modifying...') || output.includes('Destroying...')) {
          process.stdout.write(`\r🔄 ${lastOutput.substring(0, 80)}...                    \n`);
        }
      }
    });

    // Capture stderr
    let errorOutput = '';
    child.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });

    child.on('close', (code: number | null) => {
      clearInterval(progressInterval);
      process.stdout.write('\r                                                                                                \r');
      
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Terraform apply failed with exit code ${code}${errorOutput ? `\nError: ${errorOutput}` : ''}`));
      }
    });

    child.on('error', (error: Error) => {
      clearInterval(progressInterval);
      process.stdout.write('\r                                                                                                \r');
      reject(error);
    });
  });
}

async function runTerraformDeployment(): Promise<{ bucketName: string; distributionId: string }> {
  const TF_DIR = 'terraform/homepage';
  
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

    // Validate Terraform configuration
    printInfo('Validating Terraform configuration...');
    await execCommandOrThrow('terraform', ['validate']);

    // Plan the deployment
    printInfo('Planning deployment changes...');
    const planResult = await execCommand('terraform', [
      'plan',
      '-var-file=homepage-prod.tfvars',
      '-out=tfplan'
    ]);
    
    if (planResult.exitCode !== 0) {
      throw new Error(`Terraform plan failed: ${planResult.stderr}`);
    }

    // Save plan output to temp file for user review
    const { writeFile, mkdtemp } = await import('fs/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    
    const tempDir = await mkdtemp(join(tmpdir(), 'terraform-plan-'));
    const planOutputFile = join(tempDir, `terraform-plan-homepage-${Date.now()}.txt`);
    
    const fullPlanOutput = `
TERRAFORM PLAN OUTPUT FOR HOMEPAGE
Generated: ${new Date().toISOString()}

COMMAND EXECUTED:
terraform plan -var-file=homepage-prod.tfvars -out=tfplan

PLAN OUTPUT:
${planResult.stdout}

${planResult.stderr ? `WARNINGS/ERRORS:\n${planResult.stderr}` : ''}
`;
    
    await writeFile(planOutputFile, fullPlanOutput);
    
    console.log('');
    printSuccess('📋 Terraform plan completed successfully!');
    printInfo(`📄 Full plan details saved to: ${planOutputFile}`);
    printInfo('💡 You can review the file in another terminal or text editor');
    console.log('');
    
    // Show a summary of the plan output (first 20 lines)
    const lines = planResult.stdout.split('\n');
    const summaryLines = lines.slice(0, 20);
    
    printInfo('📋 Plan Summary (first 20 lines):');
    console.log('┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐');
    summaryLines.forEach((line: string) => {
      console.log(`│ ${line.padEnd(104).substring(0, 104)} │`);
    });
    if (lines.length > 20) {
      console.log(`│ ... (${lines.length - 20} more lines in full file)                                                     │`);
    }
    console.log('└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘');
    console.log('');

    // Ask for confirmation before applying
    const applyConfirmed = await askConfirmation('Do you want to apply this Terraform plan?');
    
    if (!applyConfirmed) {
      printInfo('Deployment cancelled.');
      throw new Error('Terraform deployment cancelled by user');
    }

    // Apply terraform with progress monitoring
    printInfo('Applying Terraform plan...');
    await applyTerraformWithProgress();

    printSuccess('✅ Terraform apply completed successfully!');

    // Display outputs
    printSuccess('======= Deployment Complete =======');
    const outputResult = await execCommandOrThrow('terraform', ['output']);
    if (outputResult.stdout.trim()) {
      console.log('\n📊 Terraform Outputs:');
      console.log('┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐');
      outputResult.stdout.trim().split('\n').forEach((line: string) => {
        console.log(`│ ${line.padEnd(104).substring(0, 104)} │`);
      });
      console.log('└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘');
    }

    // Get outputs for next steps
    printInfo('Getting Terraform outputs...');
    const bucketOutput = await execCommand('terraform', ['output', '-raw', 's3_bucket_name']);
    const distributionOutput = await execCommand('terraform', ['output', '-raw', 'cloudfront_distribution_id']);
    
    const bucketName = bucketOutput.stdout.trim();
    const distributionId = distributionOutput.stdout.trim();

    return { bucketName, distributionId };
  } catch (error: any) {
    printError('Terraform deployment failed:', error.message);
    
    // Try to get more detailed error information
    try {
      printInfo('Attempting to get Terraform state information for debugging...');
      const stateResult = await execCommand('terraform', ['show'], { silent: true });
      if (stateResult.stdout) {
        console.log('\n📊 Current Terraform State (last 20 lines):');
        const stateLines = stateResult.stdout.trim().split('\n');
        const lastLines = stateLines.slice(-20);
        lastLines.forEach(line => console.log(`  ${line}`));
      }
    } catch {
      // Ignore errors when trying to get state info
    }
    
    throw error;
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

  printInfo('Invalidating entire CloudFront cache...');
  await execCommandOrThrow('aws', [
    'cloudfront',
    'create-invalidation',
    '--distribution-id',
    distributionId,
    '--paths',
    '/\\*',
    '--no-cli-pager'
  ]);

  printSuccess('✅ Homepage files uploaded successfully!');
}

async function displayDeploymentInfo(): Promise<void> {
  printSuccess('🎉 Homepage deployment completed!');
  printInfo('');
  printInfo('Homepage is accessible at https://browse.show');
}

async function main(): Promise<void> {
  logHeader('🚀 Deploy Homepage to browse.show');

  // Load environment and validate AWS authentication
  await loadHomepageEnvironmentAndValidateAws();

  // Ask for deployment options
  const options = await askDeploymentOptions();

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
        process.chdir('terraform/homepage');
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