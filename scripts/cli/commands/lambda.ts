import prompts from 'prompts';
import { csv, oneOf, parseFlags, positiveInt, UsageError } from '../../lib/args.js';
import { invokeLambda, validateAwsEnvironment } from '../../lib/aws-utils.js';
import { loadSiteEnv } from '../../lib/env.js';
import {
  INGESTION_LAMBDAS,
  INGESTION_LAMBDA_IDS,
  runLambdaLocally,
  type IngestionLambdaId,
} from '../../lib/lambda.js';
import { logError, logSuccess, logWarning, printInfo } from '../../lib/logging.js';
import { resolveSites } from '../../lib/sites.js';
import { printEquivalentCommand, type Command } from '../command.js';

type LambdaEnv = 'local' | 'prod';


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

export const lambdaRunCommand: Command = {
  path: ['lambda', 'run'],
  summary: 'Run one ingestion lambda (rss / transcribe / index) for chosen sites, locally or in AWS',
  usage: `
USAGE
  pnpm bds lambda run --lambda=<id> (--sites=a,b | --all-sites) [--env=local|prod]

OPTIONS
  --lambda=<id>          ${INGESTION_LAMBDA_IDS.join(' | ')}
  --sites=a,b            Sites to run for
  --all-sites            Run for every site
  --env=local|prod       Run locally with tsx against local files (default), or invoke the
                         deployed function in AWS with the site's SSO profile
  --max-episodes=N       Limit RSS retrieval to N episodes (rss-retrieval only)

EXAMPLES
  pnpm bds lambda run --lambda=srt-indexing --sites=haveaword
  pnpm bds lambda run --lambda=rss-retrieval --sites=haveaword --max-episodes=2
`,
  async run(argv, ctx) {

    const flags = parseFlags(argv, {
      lambda: { type: 'string' },
      sites: { type: 'string' },
      'all-sites': { type: 'boolean' },
      env: { type: 'string' },
      'max-episodes': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    });
    const interactive = ctx.interactive;
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
    printEquivalentCommand([
      'lambda run',
      `--lambda=${lambdaId}`,
      `--sites=${sites.map(s => s.id).join(',')}`,
      `--env=${env}`,
      ...(maxEpisodes ? [`--max-episodes=${maxEpisodes}`] : []),
    ]);

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
  },
};
