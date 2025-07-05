#!/usr/bin/env tsx

import * as path from 'path';
import { exists, readTextFile } from './utils/file-operations';
import { logError, printInfo, printError, logProgress, logSuccess, logWarning } from './utils/logging';
import { validateAwsEnvironment, invokeLambda } from './utils/aws-utils';
import { loadEnvFile } from './utils/env-validation';
import { execCommand } from './utils/shell-exec';
import prompts from 'prompts';

/**
 * Trigger ingestion lambda functions for specific sites
 * 
 * This script provides an interactive interface to first select an ingestion
 * lambda function, then select which site to trigger it for.
 */

interface LambdaFunction {
  title: string;
  value: string;
  description: string;
}

interface SiteInfo {
  id: string;
  path: string;
}

/**
 * Discover available ingestion lambda functions
 */
async function discoverIngestionFunctions(): Promise<LambdaFunction[]> {
  const functions: LambdaFunction[] = [
    {
      title: 'RSS Feed Retrieval and Audio Download',
      value: 'rss-retrieval-lambda',
      description: 'Retrieve RSS feeds and download audio files'
    },
    {
      title: 'Whisper Audio Processing',
      value: 'process-audio-lambda',
      description: 'Process new audio files via Whisper transcription'
    },
    {
      title: 'SRT to Search Index Conversion',
      value: 'srt-indexing-lambda',
      description: 'Convert SRT files to searchable index entries'
    }
  ];

  return functions;
}

/**
 * Discover available sites following the priority logic:
 * 1. Use sites from /sites/my-sites/ if any exist
 * 2. Otherwise use sites from /sites/origin-sites/
 */
async function discoverSites(): Promise<SiteInfo[]> {
  const sites: SiteInfo[] = [];
  
  // Check my-sites first
  const mySitesDir = 'sites/my-sites';
  if (await exists(mySitesDir)) {
    try {
      const result = await execCommand('ls', ['-1', mySitesDir], { silent: true });
      if (result.exitCode === 0) {
        const mySites = result.stdout.split('\n')
          .filter(name => name.trim() && !name.startsWith('.') && !name.endsWith('.md'))
          .map(name => ({
            id: name.trim(),
            path: path.join(mySitesDir, name.trim())
          }));
        
        if (mySites.length > 0) {
          printInfo(`Found ${mySites.length} site(s) in my-sites/, ignoring origin-sites/`);
          return mySites;
        }
      }
    } catch {
      // Continue to origin-sites if my-sites fails
    }
  }

  // Fallback to origin-sites
  const originSitesDir = 'sites/origin-sites';
  if (await exists(originSitesDir)) {
    try {
      const result = await execCommand('ls', ['-1', originSitesDir], { silent: true });
      if (result.exitCode === 0) {
        const originSites = result.stdout.split('\n')
          .filter(name => name.trim() && !name.startsWith('.') && !name.endsWith('.md'))
          .map(name => ({
            id: name.trim(),
            path: path.join(originSitesDir, name.trim())
          }));
        
        printInfo(`No sites in my-sites/, using ${originSites.length} site(s) from origin-sites/`);
        return originSites;
      }
    } catch {
      // Return empty if both fail
    }
  }

  return sites;
}

/**
 * Load site-specific environment variables
 */
async function loadSiteEnvFile(siteInfo: SiteInfo): Promise<Record<string, string>> {
  let envVars: Record<string, string> = {};

  // First load general .env.local for shared settings
  const localEnvFile = '.env.local';
  if (await exists(localEnvFile)) {
    printInfo('Loading shared environment variables from .env.local...');
    const localEnv = await loadEnvFile(localEnvFile);
    envVars = { ...envVars, ...localEnv };
  }

  // Then load site-specific .env.aws-sso file
  const siteAwsEnvFile = path.join(siteInfo.path, '.env.aws-sso');
  if (!(await exists(siteAwsEnvFile))) {
    throw new Error(`Site-specific .env.aws-sso file not found: ${siteAwsEnvFile}`);
  }

  printInfo(`Loading site-specific AWS configuration from: ${siteAwsEnvFile}`);
  const siteEnv = await loadEnvFile(siteAwsEnvFile);
  envVars = { ...envVars, ...siteEnv };

  // Apply to process.env
  Object.entries(envVars).forEach(([key, value]) => {
    process.env[key] = value;
  });

  return envVars;
}

/**
 * Get AWS region from environment or AWS config
 */
async function getAWSRegion(): Promise<string> {
  if (process.env.AWS_REGION) {
    return process.env.AWS_REGION;
  }

  try {
    const result = await execCommand('aws', ['configure', 'get', 'region'], { silent: true });
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {
    // Fall back to default
  }

  return 'us-east-1';
}

/**
 * Invoke Lambda function and handle output
 */
async function invokeLambdaWithOutput(
  functionName: string,
  profile: string,
  region: string
): Promise<void> {
  const outputFile = 'lambda_invoke_output.json';

  try {
    printInfo(`Attempting to invoke Lambda function: ${functionName} in region: ${region} using profile: ${profile}...`);

    // Use our AWS utils to invoke the lambda
    await invokeLambda(functionName, {}, { profile, region });

    logSuccess('✅ Lambda function invoked successfully.');
    printInfo(`Output (and any errors from the Lambda execution) saved to: ${outputFile}`);
    
    // Check if output file exists and display it
    if (await exists(outputFile)) {
      console.log('---------------------------------------------------------------------');
      console.log(`Quick view of the output (from ${outputFile}):`);
      
      try {
        const output = await readTextFile(outputFile);
        console.log(output);
        console.log('');
        console.log('---------------------------------------------------------------------');
        
        // Check for errors within the Lambda's response
        if (output.includes('errorMessage')) {
          logWarning('⚠️  NOTE: The Lambda function was invoked, but its execution might have resulted in an error.');
          printInfo(`   Please check the contents of '${outputFile}' for details like 'errorMessage' or 'errorType'.`);
        }
      } catch (err: any) {
        logWarning('Could not read output file:', err.message);
      }
    }

  } catch (error: any) {
    logError('❌ Lambda function invocation command failed.');
    printError(`   Check the AWS CLI error output above. If it mentions credentials, ensure your SSO session for profile '${profile}' is active.`);
    printError(`   Output from the failed command (if any) is in ${outputFile}.`);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    logProgress('🚀 Starting Lambda Trigger Tool...');

    // Step 1: Select ingestion lambda function
    const lambdaFunctions = await discoverIngestionFunctions();

    const lambdaResponse = await prompts({
      type: 'select',
      name: 'lambdaFunction',
      message: 'Select ingestion Lambda function to trigger:',
      choices: lambdaFunctions.map(func => ({
        title: func.title,
        description: func.description,
        value: func.value
      })),
      initial: 0
    });

    if (!lambdaResponse.lambdaFunction) {
      printInfo('Exiting...');
      process.exit(0);
    }

    const selectedFunction = lambdaResponse.lambdaFunction;
    printInfo(`Selected function: ${selectedFunction}`);

    // Step 2: Select site
    const availableSites = await discoverSites();
    
    if (availableSites.length === 0) {
      logError('❌ No sites found. Please create sites in sites/my-sites/ or sites/origin-sites/');
      process.exit(1);
    }

    const siteChoices = availableSites.map(site => ({
      title: site.id,
      value: site
    }));

    const siteResponse = await prompts({
      type: 'select',
      name: 'siteInfo',
      message: 'Select site to trigger Lambda function for:',
      choices: siteChoices,
      initial: 0
    });

    if (!siteResponse.siteInfo) {
      printInfo('Exiting...');
      process.exit(0);
    }

    const selectedSite: SiteInfo = siteResponse.siteInfo;
    printInfo(`Selected site: ${selectedSite.id}`);

    // Step 3: Load site-specific configuration
    await loadSiteEnvFile(selectedSite);

    // Step 4: Validate AWS environment
    if (!process.env.AWS_PROFILE) {
      logError('❌ AWS_PROFILE is not set in the site-specific .env.aws-sso file.');
      printError('  Please ensure the site .env.aws-sso file contains: AWS_PROFILE=your_profile_name');
      printError('  If you haven\'t configured an SSO profile, run \'aws configure sso\' to set it up.');
      process.exit(1);
    }

    printInfo(`Attempting to use AWS Profile: ${process.env.AWS_PROFILE}`);
    
    const validation = await validateAwsEnvironment(process.env.AWS_PROFILE);
    if (!validation.valid) {
      logError(`❌ AWS SSO credentials are not working or expired for profile: ${process.env.AWS_PROFILE}.`);
      printError(`  Please run 'aws sso login --profile ${process.env.AWS_PROFILE}' to authenticate.`);
      process.exit(1);
    }

    logSuccess(`✅ AWS SSO authentication verified with profile: ${process.env.AWS_PROFILE}`);

    // Step 5: Build the site-specific lambda function name
    const functionNameMapping = {
      'rss-retrieval-lambda': `rss-retrieval-${selectedSite.id}`,
      'process-audio-lambda': `whisper-transcription-${selectedSite.id}`,
      'srt-indexing-lambda': `srt-indexing-${selectedSite.id}`
    };

    const siteSpecificFunctionName = functionNameMapping[selectedFunction as keyof typeof functionNameMapping];
    
    if (!siteSpecificFunctionName) {
      logError(`❌ Unknown lambda function: ${selectedFunction}`);
      process.exit(1);
    }

    // Step 6: Get AWS region and invoke the Lambda function
    const awsRegion = await getAWSRegion();
    await invokeLambdaWithOutput(siteSpecificFunctionName, process.env.AWS_PROFILE!, awsRegion);

  } catch (error: any) {
    logError('Error:', error.message);
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  printInfo('\nExiting...');
  process.exit(0);
});

main().catch((error) => {
  logError('Unexpected error:', error);
  process.exit(1);
}); 