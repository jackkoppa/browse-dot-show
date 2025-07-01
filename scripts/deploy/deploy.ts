#!/usr/bin/env tsx

// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import { execCommandOrThrow, execCommand } from '../utils/shell-exec.js';
import { printInfo, printError, printSuccess, logHeader } from '../utils/logging.js';
import { checkAwsCredentials } from '../utils/aws-utils.js';

interface DeploymentOptions {
  test: boolean;
  lint: boolean;
  validate: boolean;
  client: boolean;
}

interface MultiSelectChoice {
  title: string;
  value: string;
  selected: boolean;
}

/**
 * Check if the error is related to SSL certificate validation
 */
function isSSLCertificateValidationError(errorMessage: string): boolean {
  return errorMessage.includes('InvalidViewerCertificate') && 
         (errorMessage.includes("doesn't exist") || 
          errorMessage.includes("isn't valid") || 
          errorMessage.includes("doesn't include a valid certificate chain"));
}

/**
 * Display helpful instructions for SSL certificate validation setup
 */
async function displaySSLCertificateSetupInstructions(siteId: string): Promise<void> {
  console.log('');
  printInfo('🔐 SSL Certificate Validation Required');
  console.log('┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ This is expected for first-time deployments with custom domains!                                           │');
  console.log('│                                                                                                             │');
  console.log('│ The SSL certificate was created but needs DNS validation to become active.                                 │');
  console.log('│ You need to update your domain registrar settings with validation records.                                │');
  console.log('│                                                                                                             │');
  console.log('│ Next Steps:                                                                                                 │');
  console.log('│ 1. Get the certificate validation records from AWS (next step below)                                      │');
  console.log('│ 2. Add the DNS validation CNAME record to your domain registrar                                           │');
  console.log('│ 3. Wait for validation to complete (usually 5-10 minutes)                                                 │');
  console.log('│ 4. Run the deployment again - it should succeed                                                            │');
  console.log('│                                                                                                             │');
  console.log('│ 📖 For detailed instructions, see: terraform/sites/CUSTOM_DOMAIN.md                                             │');
  console.log('└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘');
  console.log('');

  // Try to get certificate validation records
  try {
    printInfo('🔍 Getting SSL certificate validation records...');
    
    // Switch to terraform directory to run terraform commands
    const originalCwd = process.cwd();
    process.chdir('terraform/sites');
    
    try {
      // Get all certificates and parse in JavaScript to avoid shell parsing issues
      const allCertsResult = await execCommand('aws', [
        'acm', 'list-certificates',
        '--region', 'us-east-1',
        '--output', 'json'
      ]);

      if (allCertsResult.exitCode === 0 && allCertsResult.stdout.trim()) {
        const certsData = JSON.parse(allCertsResult.stdout);
        const relevantCerts = certsData.CertificateSummaryList?.filter((cert: any) => 
          cert.DomainName?.includes(siteId)
        ) || [];

        if (relevantCerts.length > 0) {
          console.log('\n📋 Certificate Status:');
          console.log('┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐');
          relevantCerts.forEach((cert: any) => {
            const content = `Domain: ${cert.DomainName} Status: ${cert.Status}`;
            console.log(`│ ${content.padEnd(103)} │`);
          });
          console.log('└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘');

          // Get validation records for the first relevant certificate
          const firstCertArn = relevantCerts[0].CertificateArn;
          
          const detailsResult = await execCommand('aws', [
            'acm', 'describe-certificate',
            '--region', 'us-east-1',
            '--certificate-arn', firstCertArn,
            '--output', 'json'
          ]);

          if (detailsResult.exitCode === 0 && detailsResult.stdout.trim()) {
            const certDetails = JSON.parse(detailsResult.stdout);
            const validationOptions = certDetails.Certificate?.DomainValidationOptions;
            
                         if (validationOptions && validationOptions.length > 0) {
               const resourceRecord = validationOptions[0].ResourceRecord;
               console.log('\n🔧 DNS Validation Record (add this to your domain registrar):');
               console.log('┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐');
               console.log(`│ Type: ${resourceRecord.Type || 'CNAME'}`.padEnd(104) + '│');
               console.log(`│ Name: ${resourceRecord.Name || ''}`.padEnd(104) + '│');
               console.log(`│ Value: ${resourceRecord.Value || ''}`.padEnd(104) + '│');
               console.log('└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘');
               console.log(`\n💡 Add this CNAME record to your domain registrar's DNS settings`);
             }
          }
        } else {
          printInfo('💡 No certificates found for this site. This might be expected if the certificate creation failed.');
        }
      }
    } catch (parseError) {
      printInfo('💡 To get validation records manually, run:');
      console.log(`   aws acm list-certificates --region us-east-1`);
      console.log(`   aws acm describe-certificate --region us-east-1 --certificate-arn <CERTIFICATE_ARN>`);
    } finally {
      process.chdir(originalCwd);
    }

  } catch (error) {
    printInfo('💡 Unable to automatically retrieve certificate details.');
    printInfo('You can get the DNS validation records from the AWS Console:');
    console.log('   1. Go to AWS Certificate Manager (ACM) in us-east-1 region');
    console.log('   2. Find your certificate');
    console.log('   3. Copy the DNS validation CNAME record');
    console.log('   4. Add it to your domain registrar\'s DNS settings');
  }

  console.log('');
  printSuccess('✅ Once DNS validation is complete, run the deployment again and it should succeed!');
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

async function askMultiSelect(message: string, choices: MultiSelectChoice[]): Promise<string[]> {
  const response = await prompts({
    type: 'multiselect',
    name: 'selectedOptions',
    message: message,
    choices: choices,
    hint: '- Space to select/deselect. Return to continue'
  });

  if (!response.selectedOptions) {
    printInfo('Deployment cancelled.');
    process.exit(0);
  }

  return response.selectedOptions;
}

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
  } catch {
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
  const choices = [
    { title: 'Run tests (pnpm all:test)', value: 'test', selected: true },
    { title: 'Run linting (pnpm all:lint)', value: 'lint', selected: true },
    { title: 'Run validation (pnpm validate:prod)', value: 'validate', selected: true },
    { title: 'Deploy client files to S3', value: 'client', selected: true }
  ];

  const selectedOptions = await askMultiSelect('Select pre-deployment steps to run:', choices);

  return {
    test: selectedOptions.includes('test'),
    lint: selectedOptions.includes('lint'),
    validate: selectedOptions.includes('validate'),
    client: selectedOptions.includes('client')
  };
}

async function runPreDeploymentSteps(options: DeploymentOptions, env: string): Promise<void> {
  // Install dependencies first
  printInfo('Installing dependencies...');
  await execCommandOrThrow('pnpm', ['install']);

  // Run optional pre-deployment steps based on user selection
  if (options.test) {
    printInfo('Running all tests...');
    await execCommandOrThrow('pnpm', ['all:test']);
  }

  if (options.lint) {
    printInfo('Running linting...');
    await execCommandOrThrow('pnpm', ['all:lint']);
  }

  if (options.validate) {
    printInfo('Running validation...');
    await execCommandOrThrow('pnpm', ['validate:prod']);
  }

  printInfo(`Building all packages for ${env} environment...`);
  
  // Build shared packages
  await execCommandOrThrow('pnpm', ['all:build']);
  
  // Build /packages/processing lambdas, /packages/search lambdas, and /packages/client UI app
  await execCommandOrThrow('pnpm', [`all:build:${env}`]);
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

async function runTerraformDeployment(siteId: string): Promise<boolean> {
  const TF_DIR = 'terraform/sites';
  const BACKEND_CONFIG_FILE = `backend-configs/${siteId}.tfbackend`;

  printInfo(`Navigating to Terraform directory: ${TF_DIR}`);
  
  // Change to terraform directory
  const originalCwd = process.cwd();
  process.chdir(TF_DIR);

  try {
    // Bootstrap terraform state bucket if needed
    printInfo('Bootstrapping Terraform state bucket...');
    await execCommandOrThrow('tsx', ['../scripts/deploy/bootstrap-terraform-state.ts', siteId, process.env.AWS_PROFILE || '']);

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

    // Plan the deployment and capture output
    printInfo('Planning deployment changes...');
    const planResult = await execCommand('terraform', terraformArgs);
    
    if (planResult.exitCode !== 0) {
      throw new Error(`Terraform plan failed: ${planResult.stderr}`);
    }

    // Save plan output to temp file for user review
    const { writeFile, mkdtemp } = await import('fs/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    
    const tempDir = await mkdtemp(join(tmpdir(), 'terraform-plan-'));
    const planOutputFile = join(tempDir, `terraform-plan-${siteId}-${Date.now()}.txt`);
    
    const fullPlanOutput = `
TERRAFORM PLAN OUTPUT FOR SITE: ${siteId}
Generated: ${new Date().toISOString()}

COMMAND EXECUTED:
terraform ${terraformArgs.join(' ')}

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
    
    // Show a summary of the plan output (first 50 lines)
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
    
    if (applyConfirmed) {
      printInfo('Applying Terraform plan...');
      
      // Apply terraform with progress monitoring
      await applyTerraformWithProgress();
      
      printSuccess('✅ Terraform apply completed successfully!');
      printInfo('State is automatically managed by S3 backend.');

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
      } else {
        printInfo('No Terraform outputs to display.');
      }
      return true;
    } else {
      printInfo('Deployment cancelled.');
      return false;
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
    printSuccess('✅ Client files uploaded successfully to S3!');
  } else {
    console.log('');
    printInfo('=== Skipping client upload ===');
    printInfo(`Client upload was not selected. You can run it later with: tsx scripts/deploy/upload-client.ts ${env} ${siteId}`);
  }
}

async function main(): Promise<void> {
  // Get selected site from environment (set by site selection wrapper)
  const siteId = process.env.SELECTED_SITE_ID;
  
  try {
    logHeader('Deploy Infrastructure and Applications');

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
    const terraformSuccess = await runTerraformDeployment(siteId);

    // Only upload client files if Terraform deployment was successful
    if (terraformSuccess) {
      await uploadClientFiles(siteId, env, deploymentOptions.client);
    } else {
      printInfo('Skipping client upload due to cancelled Terraform deployment.');
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if this is an SSL certificate validation error (common for first-time deployments)
    if (isSSLCertificateValidationError(errorMessage)) {
      printError('Deployment failed due to SSL certificate validation');
      await displaySSLCertificateSetupInstructions(siteId || 'unknown');
    } else {
      printError(`Deployment failed: ${errorMessage}`);
    }
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nDeployment cancelled...');
  process.exit(0);
});

main(); 