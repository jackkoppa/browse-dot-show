#!/usr/bin/env tsx

/**
 * Run one ingestion lambda (rss-retrieval / process-audio / srt-indexing) for chosen sites,
 * either locally or by invoking the deployed function in AWS.
 *
 * Usage: tsx scripts/trigger-individual-ingestion-lambda.ts --sites=a,b --lambda=<id> [--env=local|prod]
 */

import prompts from 'prompts';
import { csv, oneOf, parseFlags, positiveInt, UsageError } from './lib/args.js';
import { invokeLambda, validateAwsEnvironment } from './lib/aws-utils.js';
import { loadSiteEnv } from './lib/env.js';
import {
  INGESTION_LAMBDAS,
  INGESTION_LAMBDA_IDS,
  runLambdaLocally,
  type IngestionLambdaId,
} from './lib/lambda.js';
import { logError, logSuccess, logWarning, printInfo } from './lib/logging.js';
import { isInteractive, resolveSites } from './lib/sites.js';

type LambdaEnv = 'local' | 'prod';

const HELP = `
Run one ingestion lambda for chosen sites, locally or in AWS.

USAGE:
  tsx scripts/trigger-individual-ingestion-lambda.ts [OPTIONS]

OPTIONS:
  --lambda=<id>          ${INGESTION_LAMBDA_IDS.join(' | ')}
  --sites=a,b            Sites to run for
  --all-sites            Run for every site
  --env=local|prod       Run locally with tsx (default), or invoke the deployed function
  --max-episodes=N       Limit RSS retrieval to N episodes (rss-retrieval only)
  --interactive, -i      Prompt for anything not given (default when run in a terminal)
  --help, -h             Show this help

Without --lambda or sites, prompts if run in a terminal; otherwise exits with an error.
`;

interface RunResult {
  siteId: string;
  success: boolean;
  duration: number;
  error?: string;
}

async function promptForLambda(): Promise<IngestionLambdaId | undefined> {
  const { lambda } = await prompts({
    type: 'select',
    name: 'lambda',
    message: 'Which lambda?',
    choices: INGESTION_LAMBDA_IDS.map(id => ({
      title: `${INGESTION_LAMBDAS[id].title} (--lambda=${id})`,
      description: INGESTION_LAMBDAS[id].description,
      value: id,
    })),
  });
  return lambda;
}

async function promptForEnv(): Promise<LambdaEnv | undefined> {
  const { env } = await prompts({
    type: 'select',
    name: 'env',
    message: 'Where should it run?',
    choices: [
      { title: 'Locally (tsx, local files)', value: 'local' },
      { title: 'In AWS (invoke the deployed function)', value: 'prod' },
    ],
  });
  return env;
}

/** Invoke the deployed lambda for a site, using the site's AWS SSO profile. */
async function invokeInProduction(lambdaId: IngestionLambdaId, siteId: string): Promise<RunResult> {
  const startTime = Date.now();
  const lambda = INGESTION_LAMBDAS[lambdaId];

  try {
    const siteEnv = loadSiteEnv(siteId);
    const profile = siteEnv.AWS_PROFILE;
    if (!profile) throw new Error(`AWS_PROFILE is not set in ${siteId}'s .env.aws-sso`);

    const validation = await validateAwsEnvironment(profile);
    if (!validation.valid) {
      throw new Error(`AWS SSO credentials are missing or expired for profile ${profile}. Run: aws sso login --profile ${profile}`);
    }

    const region = siteEnv.AWS_REGION || process.env.AWS_REGION || 'us-east-1';
    const functionName = lambda.awsFunctionName(siteId);
    printInfo(`Invoking ${functionName} in ${region} with profile ${profile}`);

    const response = await invokeLambda(functionName, {}, { profile, region });
    if (response && typeof response === 'object' && response.errorMessage) {
      logWarning(`The lambda ran, but returned an error: ${response.errorMessage}`);
    }

    const duration = Date.now() - startTime;
    logSuccess(`Invoked ${functionName} (${(duration / 1000).toFixed(1)}s)`);
    return { siteId, success: true, duration };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`Invocation failed for ${siteId}: ${message}`);
    return { siteId, success: false, duration: Date.now() - startTime, error: message };
  }
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2), {
    lambda: { type: 'string' },
    sites: { type: 'string' },
    'all-sites': { type: 'boolean' },
    env: { type: 'string' },
    'max-episodes': { type: 'string' },
    interactive: { type: 'boolean', short: 'i' },
    help: { type: 'boolean', short: 'h' },
  });

  if (flags.help) {
    console.log(HELP);
    return 0;
  }

  const interactive = Boolean(flags.interactive) || isInteractive();
  let lambdaId = oneOf('lambda', flags.lambda, INGESTION_LAMBDA_IDS);
  let env = oneOf('env', flags.env, ['local', 'prod'] as const);
  const maxEpisodes = positiveInt('max-episodes', flags['max-episodes']);

  if (!lambdaId) {
    if (!interactive) throw new UsageError(`--lambda is required (${INGESTION_LAMBDA_IDS.join(', ')})`);
    lambdaId = await promptForLambda();
    if (!lambdaId) return 130;
  }

  const sites = await resolveSites({
    sites: csv(flags.sites),
    allSites: flags['all-sites'],
    interactive,
    operation: INGESTION_LAMBDAS[lambdaId].title,
  });
  if (sites.length === 0) return 130;

  if (!env) {
    env = interactive && !flags.lambda ? await promptForEnv() : 'local';
    if (!env) return 130;
  }

  if (maxEpisodes && lambdaId !== 'rss-retrieval') {
    throw new UsageError('--max-episodes only applies to --lambda=rss-retrieval');
  }

  const lambda = INGESTION_LAMBDAS[lambdaId];
  console.log(`\n▶️  ${lambda.title} (${env}) for: ${sites.map(s => s.id).join(', ')}`);
  console.log(
    `   Equivalent command: tsx scripts/trigger-individual-ingestion-lambda.ts --lambda=${lambdaId} ` +
      `--sites=${sites.map(s => s.id).join(',')} --env=${env}${maxEpisodes ? ` --max-episodes=${maxEpisodes}` : ''}`
  );

  const results: RunResult[] = [];
  for (const site of sites) {
    console.log(`\n${'='.repeat(40)}\n${site.id} (${site.title})\n${'='.repeat(40)}`);

    if (env === 'prod') {
      results.push(await invokeInProduction(lambdaId, site.id));
      continue;
    }

    const result = await runLambdaLocally({
      lambda: lambdaId,
      siteId: site.id,
      args: maxEpisodes ? ['--max-episodes', String(maxEpisodes)] : [],
    });
    const seconds = (result.duration / 1000).toFixed(1);
    if (result.success) logSuccess(`${lambda.title} completed for ${site.id} (${seconds}s)`);
    else logError(`${lambda.title} failed for ${site.id}: ${result.error} (${seconds}s)`);
    results.push({ siteId: site.id, success: result.success, duration: result.duration, error: result.error });
  }

  console.log(`\n${'='.repeat(50)}\nSummary: ${lambda.title} (${env})\n${'='.repeat(50)}`);
  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    console.log(`  ${status} ${result.siteId}: ${(result.duration / 1000).toFixed(1)}s${result.error ? ` (${result.error})` : ''}`);
  }
  const failed = results.filter(r => !r.success).length;
  console.log(`\n${results.length - failed}/${results.length} succeeded`);
  return failed > 0 ? 1 : 0;
}

process.on('SIGINT', () => {
  console.log('\n⚠️  Cancelled');
  process.exit(130);
});

main()
  .then(code => process.exit(code))
  .catch(error => {
    if (error instanceof UsageError) {
      console.error(`❌ ${error.message}\n   Run with --help for usage.`);
      process.exit(2);
    }
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
