#!/usr/bin/env tsx

// @ts-ignore - prompts types not resolving properly but runtime works
import prompts from 'prompts';
import { execCommandOrThrow, execCommand } from '../utils/shell-exec.js';
import { printInfo, printError, printSuccess, logHeader } from '../utils/logging.js';
import { validateAwsEnvironment } from '../utils/aws-utils.js';

const AUTOMATION_PROFILE = 'browse.show-0_admin-permissions-297202224084';

interface DeploymentOptions {
  plan: boolean;
  apply: boolean;
  createEnvFile: boolean;
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
    { title: 'Plan deployment (terraform plan)', value: 'plan', selected: true },
    { title: 'Apply deployment (terraform apply)', value: 'apply', selected: true },
    { title: 'Create .env.automation file after deployment', value: 'createEnvFile', selected: true }
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
    plan: response.selectedOptions.includes('plan'),
    apply: response.selectedOptions.includes('apply'),
    createEnvFile: response.selectedOptions.includes('createEnvFile')
  };
}

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

async function applyTerraformWithProgress(): Promise<void> {
  const { spawn } = await import('child_process');
  
  return new Promise((resolve, reject) => {
    const child = spawn('terraform', ['apply', '-auto-approve', 'tfplan'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, AWS_PROFILE: AUTOMATION_PROFILE }
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

async function runTerraformDeployment(options: DeploymentOptions): Promise<{ accessKeyId?: string; secretAccessKey?: string }> {
  const TF_DIR = 'terraform/automation';
  
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
    ], { env: { ...process.env, AWS_PROFILE: AUTOMATION_PROFILE } });

    // Validate Terraform configuration
    printInfo('Validating Terraform configuration...');
    await execCommandOrThrow('terraform', ['validate'], { 
      env: { ...process.env, AWS_PROFILE: AUTOMATION_PROFILE } 
    });

    let terraformApplied = false;
    let outputs: { accessKeyId?: string; secretAccessKey?: string } = {};

    if (options.plan) {
      // Plan the deployment
      printInfo('Planning deployment changes...');
      const planResult = await execCommand('terraform', [
        'plan',
        '-var-file=terraform.tfvars',
        '-out=tfplan'
      ], { env: { ...process.env, AWS_PROFILE: AUTOMATION_PROFILE } });
      
      if (planResult.exitCode !== 0) {
        throw new Error(`Terraform plan failed: ${planResult.stderr}`);
      }

      // Save plan output to temp file for user review
      const { writeFile, mkdtemp } = await import('fs/promises');
      const { join } = await import('path');
      const { tmpdir } = await import('os');
      
      const tempDir = await mkdtemp(join(tmpdir(), 'terraform-plan-'));
      const planOutputFile = join(tempDir, `terraform-plan-automation-${Date.now()}.txt`);
      
      const fullPlanOutput = `
TERRAFORM PLAN OUTPUT FOR AUTOMATION INFRASTRUCTURE
Generated: ${new Date().toISOString()}

COMMAND EXECUTED:
terraform plan -var-file=terraform.tfvars -out=tfplan

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
    }

    if (options.apply) {
      // Ask for confirmation before applying (unless plan was skipped)
      if (options.plan) {
        const applyConfirmed = await askConfirmation('Do you want to apply this Terraform plan?');
        if (!applyConfirmed) {
          printInfo('Deployment cancelled.');
          return outputs;
        }
      } else {
        // If plan was skipped, we need to generate the plan first
        printInfo('Generating Terraform plan for apply...');
        await execCommandOrThrow('terraform', [
          'plan',
          '-var-file=terraform.tfvars',
          '-out=tfplan'
        ], { env: { ...process.env, AWS_PROFILE: AUTOMATION_PROFILE } });
      }

      // Apply terraform with progress monitoring
      printInfo('Applying Terraform plan...');
      await applyTerraformWithProgress();
      terraformApplied = true;

      printSuccess('✅ Terraform apply completed successfully!');

      // Display outputs
      printSuccess('======= Deployment Complete =======');
      const outputResult = await execCommandOrThrow('terraform', ['output'], {
        env: { ...process.env, AWS_PROFILE: AUTOMATION_PROFILE }
      });
      if (outputResult.stdout.trim()) {
        console.log('\n📊 Terraform Outputs:');
        console.log('┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐');
        outputResult.stdout.trim().split('\n').forEach((line: string) => {
          console.log(`│ ${line.padEnd(104).substring(0, 104)} │`);
        });
        console.log('└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘');
      }

      // Get sensitive outputs for .env file creation
      try {
        const accessKeyResult = await execCommand('terraform', ['output', '-raw', 'automation_access_key_id'], {
          env: { ...process.env, AWS_PROFILE: AUTOMATION_PROFILE }
        });
        const secretKeyResult = await execCommand('terraform', ['output', '-raw', 'automation_secret_access_key'], {
          env: { ...process.env, AWS_PROFILE: AUTOMATION_PROFILE }
        });
        
        if (accessKeyResult.exitCode === 0 && secretKeyResult.exitCode === 0) {
          outputs.accessKeyId = accessKeyResult.stdout.trim();
          outputs.secretAccessKey = secretKeyResult.stdout.trim();
        }
      } catch (error) {
        printInfo('Note: Could not retrieve automation credentials (this is normal if they already exist)');
      }
    }

    return outputs;
  } catch (error: any) {
    printError('Terraform deployment failed:', error.message);
    throw error;
  } finally {
    // Always return to original directory
    process.chdir(originalCwd);
  }
}

async function createEnvAutomationFile(accessKeyId?: string, secretAccessKey?: string): Promise<void> {
  if (!accessKeyId || !secretAccessKey) {
    printInfo('⚠️  Skipping .env.automation file creation - credentials not available');
    printInfo('💡 You can get the credentials manually from terraform output and create the file');
    return;
  }

  const envContent = `# AWS credentials for automated ingestion runs
# These credentials should have permissions to assume roles in all site accounts

# The AWS profile to use for automation
SCHEDULED_RUN_MAIN_AWS_PROFILE=browse-dot-show-automation

# AWS credentials for the automation user
AWS_ACCESS_KEY_ID=${accessKeyId}
AWS_SECRET_ACCESS_KEY=${secretAccessKey}
AWS_REGION=us-east-1

# Site account mappings (for reference)
# hardfork_ACCOUNT_ID=927984855345
# listenfairplay_ACCOUNT_ID=927984855345
# naddpod_ACCOUNT_ID=152849157974
# claretandblue_ACCOUNT_ID=152849157974
# searchengine_ACCOUNT_ID=927984855345
# myfavoritemurder_ACCOUNT_ID=152849157974
`;

  const { writeFile } = await import('fs/promises');
  await writeFile('.env.automation', envContent);
  
  printSuccess('✅ Created .env.automation file with automation credentials');
  printInfo('🔒 This file contains sensitive credentials and is gitignored');
  printInfo('💡 You can now use these credentials for the scheduled automation scripts');
}

async function displayNextSteps(): Promise<void> {
  printSuccess('🎉 Automation infrastructure deployment completed!');
  printInfo('');
  printInfo('Next steps:');
  printInfo('  1. The automation IAM user has been created with cross-account assume role permissions');
  printInfo('  2. You can now add automation roles to individual site terraform configurations');
  printInfo('  3. Test the cross-account access by running the scheduled automation script');
  printInfo('');
  printInfo('To add automation roles to sites:');
  printInfo('  - Update terraform/sites/main.tf to include automation role resources');
  printInfo('  - Deploy the updated site terraform configurations');
  printInfo('');
  printInfo('Documentation: .cursor/NEW_LOCAL_RUN_SCHEDULING_INFRA.md');
}

async function main(): Promise<void> {
  logHeader('🚀 Deploy Automation Infrastructure');
  
  printInfo('This script deploys the central automation infrastructure:');
  printInfo('- IAM user for automation with long-lived credentials');
  printInfo('- Policies for assuming roles in site accounts');
  printInfo('- Outputs for configuring automation scripts');
  printInfo(`Target account: 297202224084 (browse.show-0_account--root)`);
  
  await validateAutomationAwsEnvironment();

  // Ask for deployment options
  const options = await askDeploymentOptions();

  try {
    // Run terraform deployment
    const outputs = await runTerraformDeployment(options);

    // Create .env.automation file if requested and credentials are available
    if (options.createEnvFile) {
      await createEnvAutomationFile(outputs.accessKeyId, outputs.secretAccessKey);
    }

    await displayNextSteps();

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