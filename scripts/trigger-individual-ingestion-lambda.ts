#!/usr/bin/env tsx

import * as path from 'path';
import { spawn } from 'child_process';
import { exists } from './utils/file-operations.js';
import { logError, printInfo, logProgress, logSuccess, logWarning } from './utils/logging.js';
import { validateAwsEnvironment, invokeLambda } from './utils/aws-utils.js';
import { loadEnvFile } from './utils/env-validation.js';
import { execCommand } from './utils/shell-exec.js';
import { discoverSites, loadSiteEnvVars, Site } from './utils/site-selector.js';
import prompts from 'prompts';

/**
 * Trigger ingestion lambda functions for specific sites
 * 
 * This script provides both command-line and interactive interfaces to trigger
 * ingestion lambda functions either locally or in production AWS.
 * 
 * Usage: tsx scripts/trigger-individual-ingestion-lambda.ts [OPTIONS]
 */

interface LambdaFunction {
  title: string;
  value: string;
  description: string;
  localScriptPath: string;
}

interface Config {
  interactive: boolean;
  help: boolean;
  sites?: string[];
  lambda?: string;
  env: 'local' | 'prod';
  maxEpisodes?: number;
}

/**
 * Get default configuration
 */
function getDefaultConfig(): Config {
  return {
    interactive: false,
    help: false,
    sites: undefined,
    lambda: undefined,
    env: 'local',
    maxEpisodes: undefined
  };
}

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(`
🚀 Lambda Trigger Tool - Run Ingestion Functions Locally or in Production

USAGE:
  tsx scripts/trigger-individual-ingestion-lambda.ts [OPTIONS]

OPTIONS:
  --help                    Show this help message
  --interactive             Run in interactive mode to configure options
  --sites=site1,site2      Comma-separated list of sites to process
  --lambda=LAMBDA_TYPE     Lambda function to trigger (rss-retrieval, process-audio, srt-indexing)
  --env=ENVIRONMENT        Environment: 'local' (default) or 'prod'
  --max-episodes=N         Limit RSS processing to N episodes (only valid with --lambda=rss-retrieval)

LAMBDA TYPES:
  rss-retrieval            RSS Feed Retrieval and Audio Download
  process-audio            Whisper Audio Processing (transcription)
  srt-indexing             SRT to Search Index Conversion

ENVIRONMENTS:
  local                    Run lambda function locally using tsx (default)
  prod                     Trigger lambda function in AWS production environment

EXAMPLES:
  # Interactive mode (guided configuration)
  tsx scripts/trigger-individual-ingestion-lambda.ts --interactive
  
  # Run RSS retrieval locally for hardfork site
  tsx scripts/trigger-individual-ingestion-lambda.ts --sites=hardfork --lambda=rss-retrieval --env=local
  
  # Run audio processing in production for multiple sites
  tsx scripts/trigger-individual-ingestion-lambda.ts --sites=hardfork,naddpod --lambda=process-audio --env=prod
  
  # Run SRT indexing locally for all sites
  tsx scripts/trigger-individual-ingestion-lambda.ts --lambda=srt-indexing --env=local

NOTES:
  - For local execution, the script runs the lambda function directly using tsx
  - For production execution, the script invokes the AWS Lambda function
  - All ingestion lambda functions are designed to run without arguments
  - Site-specific environment variables are loaded automatically
`);
}

/**
 * Parse command line arguments
 */
function parseArguments(): Config {
  const args = process.argv.slice(2);
  const config: Config = getDefaultConfig();
  
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      config.help = true;
    } else if (arg === '--interactive' || arg === '-i') {
      config.interactive = true;
    } else if (arg.startsWith('--sites=')) {
      const sitesArg = arg.split('=')[1];
      if (sitesArg) {
        config.sites = sitesArg.split(',').map(s => s.trim()).filter(s => s.length > 0);
      }
    } else if (arg.startsWith('--lambda=')) {
      const lambdaArg = arg.split('=')[1];
      if (lambdaArg) {
        config.lambda = lambdaArg.trim();
      }
    } else if (arg.startsWith('--env=')) {
      const envArg = arg.split('=')[1];
      if (envArg && (envArg === 'local' || envArg === 'prod')) {
        config.env = envArg as 'local' | 'prod';
      } else {
        console.error(`❌ Invalid environment: ${envArg}. Must be 'local' or 'prod'`);
        process.exit(1);
      }
    } else if (arg.startsWith('--max-episodes=')) {
      const maxEpisodesArg = arg.split('=')[1];
      if (maxEpisodesArg) {
        const maxEpisodes = parseInt(maxEpisodesArg, 10);
        if (isNaN(maxEpisodes) || maxEpisodes <= 0) {
          console.error(`❌ Invalid max-episodes value: ${maxEpisodesArg}. Must be a positive integer.`);
          process.exit(1);
        }
        config.maxEpisodes = maxEpisodes;
      }
    }
  }
  
  return config;
}

/**
 * Get available ingestion lambda functions
 */
function getIngestionFunctions(): LambdaFunction[] {
  return [
    {
      title: 'RSS Feed Retrieval and Audio Download',
      value: 'rss-retrieval',
      description: 'Retrieve RSS feeds and download audio files',
      localScriptPath: 'packages/ingestion/rss-retrieval-lambda/retrieve-rss-feeds-and-download-audio-files.ts'
    },
    {
      title: 'Whisper Audio Processing',
      value: 'process-audio',
      description: 'Process new audio files via Whisper transcription',
      localScriptPath: 'packages/ingestion/process-audio-lambda/process-new-audio-files-via-whisper.ts'
    },
    {
      title: 'SRT to Search Index Conversion',
      value: 'srt-indexing',
      description: 'Convert SRT files to searchable index entries',
      localScriptPath: 'packages/ingestion/srt-indexing-lambda/convert-srts-indexed-search.ts'
    }
  ];
}

/**
 * Validate configuration
 */
function validateConfig(config: Config, allSites: Site[]): void {
  if (config.interactive) {
    // Interactive mode doesn't need validation
    return;
  }

  // Non-interactive mode requires all parameters
  if (!config.sites || config.sites.length === 0) {
    console.error('❌ --sites parameter is required in non-interactive mode');
    console.error('   Example: --sites=hardfork,naddpod');
    process.exit(1);
  }

  if (!config.lambda) {
    console.error('❌ --lambda parameter is required in non-interactive mode');
    console.error('   Valid options: rss-retrieval, process-audio, srt-indexing');
    process.exit(1);
  }

  // Validate lambda function
  const lambdaFunctions = getIngestionFunctions();
  const selectedLambda = lambdaFunctions.find(fn => fn.value === config.lambda);
  if (!selectedLambda) {
    console.error(`❌ Invalid lambda function: ${config.lambda}`);
    console.error(`   Valid options: ${lambdaFunctions.map(fn => fn.value).join(', ')}`);
    process.exit(1);
  }

  // Validate sites
  const invalidSites = config.sites.filter(siteId => !allSites.find(site => site.id === siteId));
  if (invalidSites.length > 0) {
    console.error(`❌ Invalid site(s): ${invalidSites.join(', ')}`);
    console.error(`   Available sites: ${allSites.map(site => site.id).join(', ')}`);
    process.exit(1);
  }

  // Validate max-episodes is only used with rss-retrieval
  if (config.maxEpisodes && config.lambda !== 'rss-retrieval') {
    console.error(`❌ --max-episodes flag is only valid with --lambda=rss-retrieval`);
    console.error(`   You specified --lambda=${config.lambda} which does not support episode limits`);
    process.exit(1);
  }
}

/**
 * Configure options interactively
 */
async function configureInteractively(config: Config, allSites: Site[]): Promise<Config> {
  console.log('\n🤖 Interactive Lambda Trigger Configuration');
  console.log('='.repeat(50));

  // Lambda function selection
  const lambdaFunctions = getIngestionFunctions();
  const lambdaResponse = await prompts({
    type: 'select',
    name: 'lambda',
    message: 'Select ingestion lambda function to trigger:',
    choices: lambdaFunctions.map(func => ({
      title: `${func.title} (--lambda=${func.value})`,
      description: func.description,
      value: func.value
    })),
    initial: 0
  });

  if (!lambdaResponse.lambda) {
    console.log('Operation cancelled.');
    process.exit(0);
  }

  config.lambda = lambdaResponse.lambda;

  // Site selection
  const siteResponse = await prompts({
    type: 'select',
    name: 'siteSelection',
    message: 'Which sites would you like to process?',
    choices: [
      { title: 'All sites', value: 'all' },
      { title: 'Select specific sites', value: 'select' }
    ],
    initial: 0
  });

  if (!siteResponse.siteSelection) {
    console.log('Operation cancelled.');
    process.exit(0);
  }

  if (siteResponse.siteSelection === 'all') {
    config.sites = allSites.map(site => site.id);
  } else {
    const specificSitesResponse = await prompts({
      type: 'multiselect',
      name: 'sites',
      message: 'Select sites to process:',
      choices: allSites.map(site => ({
        title: `${site.title} (${site.id})`,
        value: site.id,
        selected: false
      })),
      min: 1
    });

    if (!specificSitesResponse.sites || specificSitesResponse.sites.length === 0) {
      console.log('Operation cancelled.');
      process.exit(0);
    }

    config.sites = specificSitesResponse.sites;
  }

  // Environment selection
  const envResponse = await prompts({
    type: 'select',
    name: 'env',
    message: 'Select execution environment:',
    choices: [
      { title: 'Local (run function locally with tsx)', value: 'local' },
      { title: 'Production (trigger AWS Lambda)', value: 'prod' }
    ],
    initial: config.env === 'local' ? 0 : 1
  });

  if (!envResponse.env) {
    console.log('Operation cancelled.');
    process.exit(0);
  }

  config.env = envResponse.env;

  return config;
}

/**
 * Run lambda function locally
 */
async function runLambdaLocally(
  lambdaFunction: LambdaFunction,
  siteId: string,
  maxEpisodes?: number
): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();
  
  logProgress(`Running ${lambdaFunction.title} locally for site: ${siteId}`);
  
  return new Promise((resolve) => {
    try {
      // Load site-specific environment variables
      const siteEnvVars = loadSiteEnvVars(siteId, 'local');
      
      // Merge with current environment, preserving multi-terminal vars
      const envVars = {
        ...process.env,
        ...siteEnvVars,
        SITE_ID: siteId,
        FILE_STORAGE_ENV: 'local',
        // Preserve multi-terminal runner environment variables
        ...(process.env.PROCESS_ID && { PROCESS_ID: process.env.PROCESS_ID }),
        ...(process.env.LOG_FILE && { LOG_FILE: process.env.LOG_FILE }),
        ...(process.env.TERMINAL_TOTAL_MINUTES && { TERMINAL_TOTAL_MINUTES: process.env.TERMINAL_TOTAL_MINUTES })
      };

      // Build args array, potentially including max-episodes for RSS retrieval
      const args = [lambdaFunction.localScriptPath];
      if (maxEpisodes && lambdaFunction.value === 'rss-retrieval') {
        args.push('--max-episodes', maxEpisodes.toString());
      }

      const child = spawn('tsx', args, {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: envVars,
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });

      child.on('close', (code: number | null) => {
        const duration = Date.now() - startTime;
        const success = code === 0;
        
        if (success) {
          logSuccess(`✅ ${lambdaFunction.title} completed successfully for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
        } else {
          logError(`❌ ${lambdaFunction.title} failed for ${siteId} with exit code ${code} (${(duration / 1000).toFixed(1)}s)`);
        }
        
        resolve({
          success,
          duration,
          error: success ? undefined : `Exit code: ${code}`
        });
      });

      child.on('error', (error: Error) => {
        const duration = Date.now() - startTime;
        logError(`❌ ${lambdaFunction.title} failed for ${siteId} with error: ${error.message}`);
        
        resolve({
          success: false,
          duration,
          error: error.message
        });
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      logError(`❌ Error setting up ${lambdaFunction.title} for ${siteId}: ${error.message}`);
      
      resolve({
        success: false,
        duration,
        error: error.message
      });
    }
  });
}

/**
 * Load site-specific environment variables for production
 */
async function loadSiteEnvFileForProduction(siteId: string): Promise<Record<string, string>> {
  const allSites = discoverSites();
  const site = allSites.find(s => s.id === siteId);
  
  if (!site) {
    throw new Error(`Site not found: ${siteId}`);
  }

  const siteDir = path.resolve('sites', 'my-sites', siteId);
  const originSiteDir = path.resolve('sites', 'origin-sites', siteId);
  
  let actualSiteDir: string;
  if (await exists(siteDir)) {
    actualSiteDir = siteDir;
  } else if (await exists(originSiteDir)) {
    actualSiteDir = originSiteDir;
  } else {
    throw new Error(`Site directory not found for: ${siteId}`);
  }

  let envVars: Record<string, string> = {};

  // First load general .env.local for shared settings
  const localEnvFile = '.env.local';
  if (await exists(localEnvFile)) {
    printInfo('Loading shared environment variables from .env.local...');
    const localEnv = await loadEnvFile(localEnvFile);
    envVars = { ...envVars, ...localEnv };
  }

  // Then load site-specific .env.aws-sso file
  const siteAwsEnvFile = path.join(actualSiteDir, '.env.aws-sso');
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
 * Invoke Lambda function in production and handle output
 */
async function invokeLambdaInProduction(
  lambdaFunction: LambdaFunction,
  siteId: string
): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    // Load site-specific environment variables
    await loadSiteEnvFileForProduction(siteId);

    // Validate AWS environment
    if (!process.env.AWS_PROFILE) {
      throw new Error('AWS_PROFILE is not set in the site-specific .env.aws-sso file');
    }

    printInfo(`Attempting to use AWS Profile: ${process.env.AWS_PROFILE}`);
    
    const validation = await validateAwsEnvironment(process.env.AWS_PROFILE);
    if (!validation.valid) {
      throw new Error(`AWS SSO credentials are not working or expired for profile: ${process.env.AWS_PROFILE}`);
    }

    logSuccess(`✅ AWS SSO authentication verified with profile: ${process.env.AWS_PROFILE}`);

    // Build the site-specific lambda function name
    const functionNameMapping = {
      'rss-retrieval': `rss-retrieval-${siteId}`,
      'process-audio': `whisper-transcription-${siteId}`,
      'srt-indexing': `srt-indexing-${siteId}`
    };

    const siteSpecificFunctionName = functionNameMapping[lambdaFunction.value as keyof typeof functionNameMapping];
    
    if (!siteSpecificFunctionName) {
      throw new Error(`Unknown lambda function: ${lambdaFunction.value}`);
    }

    // Get AWS region and invoke the Lambda function
    const awsRegion = await getAWSRegion();

    printInfo(`Invoking Lambda function: ${siteSpecificFunctionName} in region: ${awsRegion} using profile: ${process.env.AWS_PROFILE}`);

    // Use our AWS utils to invoke the lambda
    const lambdaResult = await invokeLambda(siteSpecificFunctionName, {}, { 
      profile: process.env.AWS_PROFILE, 
      region: awsRegion
    });

    const duration = Date.now() - startTime;
    logSuccess(`✅ Lambda function ${siteSpecificFunctionName} invoked successfully for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
    
    // Check for errors in the Lambda response
    if (lambdaResult && typeof lambdaResult === 'object') {
      if (lambdaResult.errorMessage) {
        logWarning('⚠️  NOTE: The Lambda function was invoked, but its execution resulted in an error.');
        printInfo(`   Error: ${lambdaResult.errorMessage}`);
        if (lambdaResult.errorType) {
          printInfo(`   Error Type: ${lambdaResult.errorType}`);
        }
      }
    }

    return { success: true, duration };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(`❌ Lambda function invocation failed for ${siteId}: ${error.message}`);
    return { success: false, duration, error: error.message };
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('🚀 Lambda Trigger Tool - Run Ingestion Functions');
  console.log('='.repeat(50));

  // Parse command line arguments
  let config = parseArguments();

  // Handle help flag
  if (config.help) {
    displayHelp();
    process.exit(0);
  }

  // Discover all available sites
  const allSites = discoverSites();

  if (allSites.length === 0) {
    console.error('❌ No sites found! Please create a site in /sites/my-sites/ or /sites/origin-sites/');
    process.exit(1);
  }

  // Handle interactive configuration
  if (config.interactive) {
    config = await configureInteractively(config, allSites);
  } else {
    // Validate non-interactive configuration
    validateConfig(config, allSites);
  }

  // Get selected lambda function
  const lambdaFunctions = getIngestionFunctions();
  const selectedLambda = lambdaFunctions.find(fn => fn.value === config.lambda);
  if (!selectedLambda) {
    console.error(`❌ Lambda function not found: ${config.lambda}`);
    process.exit(1);
  }

  // Filter sites
  const selectedSites = config.sites!.map(siteId => {
    const site = allSites.find(s => s.id === siteId);
    if (!site) {
      console.error(`❌ Site not found: ${siteId}`);
      process.exit(1);
    }
    return site;
  });

  // Display execution summary
  console.log('\n📍 Execution Summary:');
  console.log(`   Lambda Function: ${selectedLambda.title}`);
  console.log(`   Environment: ${config.env}`);
  console.log(`   Sites: ${selectedSites.map(s => s.id).join(', ')}`);
  console.log(`   Execution Mode: ${config.env === 'local' ? 'Local (tsx)' : 'Production (AWS Lambda)'}`);

  // Display equivalent CLI command
  const sitesArg = selectedSites.map(s => s.id).join(',');
  const cliPrefix = 'NODE_OPTIONS=--max-old-space-size=9728 pnpm';
  const cliCommand = `${cliPrefix} tsx scripts/trigger-individual-ingestion-lambda.ts --sites=${sitesArg} --lambda=${config.lambda} --env=${config.env}`;
  console.log('\n💡 Equivalent CLI command:');
  console.log(`   ${cliCommand}`);

  // Execute for each site
  const results: Array<{ siteId: string; success: boolean; duration: number; error?: string }> = [];

  for (const site of selectedSites) {
    console.log(`\n${'='.repeat(40)}`);
    console.log(`Processing site: ${site.id} (${site.title})`);
    console.log(`${'='.repeat(40)}`);

    let result: { success: boolean; duration: number; error?: string };

    if (config.env === 'local') {
      result = await runLambdaLocally(selectedLambda, site.id, config.maxEpisodes);
    } else {
      result = await invokeLambdaInProduction(selectedLambda, site.id);
    }

    results.push({
      siteId: site.id,
      ...result
    });
  }

  // Display final summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Final Summary');
  console.log('='.repeat(50));

  const successCount = results.filter(r => r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n📈 Results:`);
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const duration = (result.duration / 1000).toFixed(1);
    console.log(`   ${status} ${result.siteId}: ${duration}s${result.error ? ` (${result.error})` : ''}`);
  });

  console.log(`\n📊 Overall Statistics:`);
  console.log(`   Success Rate: ${successCount}/${results.length} (${((successCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`   Function: ${selectedLambda.title}`);
  console.log(`   Environment: ${config.env}`);

  // Exit with appropriate code
  const hasErrors = results.some(r => !r.success);
  if (hasErrors) {
    console.log('\n⚠️  Some operations failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All operations completed successfully!');
    process.exit(0);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Operation cancelled by user');
  process.exit(130);
});

main().catch((error) => {
  console.error('\n❌ Unexpected error:', error.message);
  process.exit(1);
}); 