#!/usr/bin/env node

const prompts = require('prompts');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.dev if it exists
function loadEnvFile() {
    const envFile = path.join(process.cwd(), '.env.dev');
    if (fs.existsSync(envFile)) {
        console.log('Loading environment variables from .env.dev');
        const envContent = fs.readFileSync(envFile, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        });
    } else {
        console.log('Warning: .env.dev file not found. Make sure to create it with necessary credentials.');
    }
}

// Run a shell command and return a promise
function runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            ...options
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });

        child.on('error', (error) => {
            reject(error);
        });
    });
}

// Check if AWS SSO session is active
async function checkAWSAuth(profile) {
    return new Promise((resolve) => {
        const stsCmd = spawn('aws', ['sts', 'get-caller-identity', '--profile', profile], {
            stdio: 'pipe'
        });
        stsCmd.on('close', (code) => {
            resolve(code === 0);
        });
    });
}

// Ask for user confirmation
async function askConfirmation(message) {
    const response = await prompts({
        type: 'confirm',
        name: 'confirmed',
        message: message,
        initial: false
    });
    return response.confirmed;
}

async function main() {
    try {
        // Get selected site from environment (set by site selection wrapper)
        const SITE_ID = process.env.SELECTED_SITE_ID;
        if (!SITE_ID) {
            console.error('Error: No site selected. This script should be run through the site selection wrapper.');
            console.error('Use: pnpm all:deploy');
            process.exit(1);
        }

        console.log(`🌐 Deploying site: ${SITE_ID}`);

        // Environment selection prompt
        const envResponse = await prompts({
            type: 'select',
            name: 'environment',
            message: 'Select deployment environment:',
            choices: [
                { title: 'Development', value: 'dev' },
                { title: 'Production', value: 'prod' }
            ],
            initial: 0
        });

        if (!envResponse.environment) {
            console.log('Deployment cancelled.');
            process.exit(0);
        }

        const ENV = envResponse.environment;
        console.log(`Deploying to ${ENV} environment for site ${SITE_ID}...`);

        // Set environment variables for child processes
        process.env.ENV = ENV;
        process.env.SITE_ID = SITE_ID;

        // Site-specific Terraform configuration
        const TF_DIR = "terraform";
        const TF_STATE_FILENAME = `terraform-${SITE_ID}.tfstate`;
        const TF_STATE_BUCKET = `${SITE_ID}-terraform-state-${ENV}`;

        // Variables to be exported for use by manage-tfstate.sh
        process.env.TF_STATE_FILENAME = TF_STATE_FILENAME;
        process.env.S3_TFSTATE_URI = `s3://${TF_STATE_BUCKET}/${TF_STATE_FILENAME}`;

        // Run prerequisite check
        console.log('Running prerequisite checks...');
        await runCommand('./scripts/deploy/check-prerequisites.sh');

        // Ask user about optional pre-deployment steps
        const optionsResponse = await prompts({
            type: 'multiselect',
            name: 'selectedOptions',
            message: 'Select pre-deployment steps to run:',
            choices: [
                { title: 'Run tests (pnpm all:test)', value: 'test', selected: true },
                { title: 'Run linting (pnpm lint:dev-s3)', value: 'lint', selected: true },
                { title: 'Deploy client files to S3', value: 'client', selected: true }
            ],
            hint: '- Space to select/deselect. Return to continue'
        });

        if (!optionsResponse.selectedOptions) {
            console.log('Deployment cancelled.');
            process.exit(0);
        }

        const selectedOptions = optionsResponse.selectedOptions;
        console.log('Selected options:', selectedOptions);

        // Load environment variables
        loadEnvFile();

        // Validate required environment variables
        if (!process.env.OPENAI_API_KEY) {
            console.log('Error: OpenAI API key is missing.');
            console.log('Make sure .env.dev contains:');
            console.log('  OPENAI_API_KEY=your_openai_api_key');
            process.exit(1);
        }

        // Set AWS region if not already set
        process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

        // Set AWS profile if specified and export it for sourced scripts
        if (process.env.AWS_PROFILE) {
            console.log(`Using AWS SSO profile: ${process.env.AWS_PROFILE}`);
            
            // Check if SSO session is active
            if (!(await checkAWSAuth(process.env.AWS_PROFILE))) {
                console.log(`AWS SSO session is not active or has expired for profile ${process.env.AWS_PROFILE}`);
                console.log(`Please run: aws sso login --profile ${process.env.AWS_PROFILE}`);
                process.exit(1);
            }
        }

        // Run optional pre-deployment steps based on user selection
        if (selectedOptions.includes('test')) {
            console.log('Running all tests...');
            await runCommand('pnpm', ['all:test']);
        }

        if (selectedOptions.includes('lint')) {
            console.log('Running linting...');
            await runCommand('pnpm', ['lint:dev-s3']);
        }

        console.log(`Building all packages for ${ENV} environment...`);
        await runCommand('pnpm', ['install']);
        
        // Build shared packages
        await runCommand('pnpm', ['all:build']);
        
        // Build /packages/processing lambdas, /packages/search lambdas, and /packages/client UI app
        await runCommand('pnpm', [`all:build:${ENV}`]);

        // --- Terraform Deployment ---
        console.log(`Navigating to Terraform directory: ${TF_DIR}`);
        process.chdir(TF_DIR);

        // --- Terraform State Sync ---
        console.log('Comparing Terraform states...');
        // Set all required environment variables and source the script in the correct context
        const manageTfStateCmd = `
            export TF_STATE_FILENAME="${TF_STATE_FILENAME}"
            export S3_TFSTATE_URI="${process.env.S3_TFSTATE_URI}"
            export AWS_PROFILE="${process.env.AWS_PROFILE || ''}"
            export AWS_REGION="${process.env.AWS_REGION}"
            source ../scripts/deploy/manage-tfstate.sh
            compare_tf_states
        `;
        await runCommand('bash', ['-c', manageTfStateCmd]);

        // Initialize Terraform (if needed)
        console.log('Initializing Terraform...');
        await runCommand('terraform', ['init']);

        // Validate Terraform configuration
        console.log('Validating Terraform configuration...');
        await runCommand('terraform', ['validate']);

        // Set profile flag for Terraform commands if using AWS profile
        const terraformArgs = [
            'plan',
            `-var-file=environments/${ENV}.tfvars`,
            `-var=openai_api_key=${process.env.OPENAI_API_KEY}`,
            `-var=site_id=${SITE_ID}`,
            '-out=tfplan'
        ];

        if (process.env.AWS_PROFILE) {
            terraformArgs.splice(-1, 0, `-var=aws_profile=${process.env.AWS_PROFILE}`);
        }

        // Plan the deployment
        await runCommand('terraform', terraformArgs);

        // Ask for confirmation before applying
        const applyConfirmed = await askConfirmation('Do you want to apply this Terraform plan?');
        
        if (applyConfirmed) {
            console.log('Applying Terraform plan...');
            await runCommand('terraform', ['apply', '-auto-approve', 'tfplan']);
            
            console.log('Terraform apply completed.');
            
            // Upload state backup
            const uploadStateCmd = `
                export TF_STATE_FILENAME="${TF_STATE_FILENAME}"
                export S3_TFSTATE_URI="${process.env.S3_TFSTATE_URI}"
                export AWS_PROFILE="${process.env.AWS_PROFILE || ''}"
                export AWS_REGION="${process.env.AWS_REGION}"
                source ../scripts/deploy/manage-tfstate.sh
                upload_tf_state_backup
            `;
            await runCommand('bash', ['-c', uploadStateCmd]);

            // Display outputs
            console.log('======= Deployment Complete =======');
            await runCommand('terraform', ['output']);

            // Return to the project root before running upload script
            process.chdir('..');
            console.log(`Returned to ${process.cwd()}`);
            
            // Upload client files if selected at the beginning
            if (selectedOptions.includes('client')) {
                console.log('');
                console.log('=== Uploading client files to S3 ===');
                console.log(`Uploading client files for site ${SITE_ID}...`);
                await runCommand('./scripts/deploy/upload-client.sh', [ENV, SITE_ID]);
            } else {
                console.log('');
                console.log('=== Skipping client upload ===');
                console.log(`Client upload was not selected. You can run it later with: ./scripts/deploy/upload-client.sh ${ENV} ${SITE_ID}`);
            }
        } else {
            console.log('Deployment cancelled.');
            process.chdir('..');
            console.log(`Returned to ${process.cwd()}`);
        }

    } catch (error) {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\nDeployment cancelled...');
    process.exit(0);
});

main();