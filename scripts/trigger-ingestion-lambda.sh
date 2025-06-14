#!/usr/bin/env node

const prompts = require('prompts');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Import site loading utilities
let getSiteById, getAvailableSiteIds;
try {
    const siteUtils = require('../sites/dist/index.js');
    getSiteById = siteUtils.getSiteById;
    getAvailableSiteIds = siteUtils.getAvailableSiteIds;
} catch (error) {
    console.error('❌ Failed to load site utilities. Make sure to build sites package first:');
    console.error('   cd sites && pnpm build');
    process.exit(1);
}

// Load environment variables from site-specific .env.aws file
function loadSiteEnvFile(siteId) {
    // First load general .env.local for shared settings
    const localEnvFile = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(localEnvFile)) {
        console.log('Loading shared environment variables from .env.local...');
        const envContent = fs.readFileSync(localEnvFile, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        });
    }

    // Then load site-specific .env.aws file
    const siteConfig = getSiteById(siteId);
    if (!siteConfig || !siteConfig.path) {
        throw new Error(`Site configuration not found for: ${siteId}`);
    }

    const siteAwsEnvFile = path.join(siteConfig.path, '.env.aws');
    if (fs.existsSync(siteAwsEnvFile)) {
        console.log(`Loading site-specific AWS configuration from: ${siteAwsEnvFile}`);
        const envContent = fs.readFileSync(siteAwsEnvFile, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        });
    } else {
        throw new Error(`Site-specific .env.aws file not found: ${siteAwsEnvFile}`);
    }
}

// Get AWS region from environment or AWS config
async function getAWSRegion() {
    return process.env.AWS_REGION || await new Promise((resolve) => {
        const awsCmd = spawn('aws', ['configure', 'get', 'region']);
        let output = '';
        awsCmd.stdout.on('data', (data) => {
            output += data.toString();
        });
        awsCmd.on('close', () => {
            resolve(output.trim() || 'us-east-1');
        });
    });
}

// Check if AWS CLI is available
function checkAWSCLI() {
    return new Promise((resolve) => {
        const which = spawn('which', ['aws']);
        which.on('close', (code) => {
            resolve(code === 0);
        });
    });
}

// Check AWS SSO authentication
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

// Invoke Lambda function
async function invokeLambda(functionName, profile, region) {
    const outputFile = 'lambda_invoke_output.json';
    
    return new Promise((resolve, reject) => {
        const lambdaCmd = spawn('aws', [
            'lambda', 'invoke',
            '--function-name', functionName,
            '--cli-binary-format', 'raw-in-base64-out',
            '--payload', '{}',
            '--profile', profile,
            '--region', region,
            outputFile
        ]);

        lambdaCmd.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Lambda function invoked successfully.');
                console.log(`Output (and any errors from the Lambda execution) saved to: ${outputFile}`);
                console.log('---------------------------------------------------------------------');
                console.log(`Quick view of the output (from ${outputFile}):`);
                
                try {
                    const output = fs.readFileSync(outputFile, 'utf8');
                    console.log(output);
                    console.log('');
                    console.log('---------------------------------------------------------------------');
                    
                    // Check for errors within the Lambda's response
                    if (output.includes('errorMessage')) {
                        console.log('⚠️  NOTE: The Lambda function was invoked, but its execution might have resulted in an error.');
                        console.log(`   Please check the contents of '${outputFile}' for details like 'errorMessage' or 'errorType'.`);
                    }
                } catch (err) {
                    console.log('Could not read output file:', err.message);
                }
                
                resolve();
            } else {
                console.log('❌ Lambda function invocation command failed.');
                console.log(`   Check the AWS CLI error output above. If it mentions credentials, ensure your SSO session for profile '${profile}' is active.`);
                console.log(`   Output from the failed command (if any) is in ${outputFile}.`);
                reject(new Error('Lambda invocation failed'));
            }
        });

        lambdaCmd.stderr.on('data', (data) => {
            console.error(data.toString());
        });
    });
}

async function main() {
    try {
        // Site selection first
        const availableSites = getAvailableSiteIds();
        
        if (availableSites.length === 0) {
            console.error('❌ No sites found. Please create sites in sites/my-sites/ or sites/origin-sites/');
            process.exit(1);
        }

        const siteChoices = availableSites.map(siteId => ({
            title: siteId,
            value: siteId
        }));

        // Check for default site
        const defaultSiteId = process.env.DEFAULT_SITE_ID;
        const defaultIndex = defaultSiteId ? availableSites.indexOf(defaultSiteId) : 0;

        const siteResponse = await prompts({
            type: 'select',
            name: 'siteId',
            message: 'Select site to trigger Lambda functions for:',
            choices: siteChoices,
            initial: Math.max(0, defaultIndex)
        });

        if (!siteResponse.siteId) {
            console.log('Exiting...');
            process.exit(0);
        }

        const selectedSiteId = siteResponse.siteId;
        console.log(`Selected site: ${selectedSiteId}`);

        // Load site-specific configuration
        loadSiteEnvFile(selectedSiteId);

        // Configuration
        const awsRegion = await getAWSRegion();
        
        // Define available Lambda functions with site-specific names
        const lambdaFunctions = [
            {
                title: 'RSS Feed Retrieval and Audio Download',
                value: `retrieve-rss-feeds-and-download-audio-files-${selectedSiteId}`
            },
            {
                title: 'Whisper Audio Processing',
                value: `process-new-audio-files-via-whisper-${selectedSiteId}`
            },
            {
                title: 'SRT to Search Index Conversion',
                value: `convert-srt-files-into-indexed-search-entries-${selectedSiteId}`
            }
        ];

        // Check if AWS CLI is installed
        if (!(await checkAWSCLI())) {
            console.log('❌ AWS CLI could not be found. Please install and configure it.');
            process.exit(1);
        }

        // Check AWS SSO authentication
        if (!process.env.AWS_PROFILE) {
            console.log('❌ AWS_PROFILE is not set in the site-specific .env.aws file.');
            console.log('  Please ensure the site .env.aws file contains: AWS_PROFILE=your_profile_name');
            console.log('  If you haven\'t configured an SSO profile, run \'aws configure sso\'.');
            process.exit(1);
        }

        console.log(`Attempting to use AWS Profile: ${process.env.AWS_PROFILE}`);
        
        if (!(await checkAWSAuth(process.env.AWS_PROFILE))) {
            console.log(`❌ AWS SSO credentials are not working or expired for profile: ${process.env.AWS_PROFILE}.`);
            console.log(`  Please run 'aws sso login --profile ${process.env.AWS_PROFILE}' to authenticate.`);
            process.exit(1);
        }

        console.log(`✅ AWS SSO authentication verified with profile: ${process.env.AWS_PROFILE}`);

        // Use prompts to get user selection
        const response = await prompts({
            type: 'select',
            name: 'lambdaFunction',
            message: `Select Lambda function to trigger for site '${selectedSiteId}':`,
            choices: lambdaFunctions,
            initial: 0
        });

        // Handle if user cancels the prompt
        if (!response.lambdaFunction) {
            console.log('Exiting...');
            process.exit(0);
        }

        const selectedFunction = response.lambdaFunction;
        console.log(`Attempting to invoke Lambda function: ${selectedFunction} in region: ${awsRegion} using profile: ${process.env.AWS_PROFILE}...`);

        // Invoke the Lambda function
        await invokeLambda(selectedFunction, process.env.AWS_PROFILE, awsRegion);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\nExiting...');
    process.exit(0);
});

main(); 