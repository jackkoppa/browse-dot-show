import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { log } from '@browse-dot-show/logging';
import { handleAuthRequest } from './app.js';
import { createDependencies, parseSitesConfig, type Dependencies } from './dependencies.js';
import { createDynamoStorage } from './dynamo.js';

/**
 * Lambda entry point: behind an HTTP API (payload format 2.0; CORS is the API's configuration, so
 * OPTIONS requests never reach this handler), and on a schedule for `{ "action": "sync-supporting-cast" }`.
 *
 * Env: AUTH_SITES (JSON, see app.ts), SSM_PARAMETER_PREFIX (e.g. `/browse-dot-show/auth`),
 * AUTH_TABLE_NAME (DynamoDB, see dynamo.ts)
 */

interface HttpApiEvent {
  rawPath?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string; sourceIp?: string } };
}

interface ScheduledEvent {
  action: 'sync-supporting-cast';
}

interface LambdaContext {
  getRemainingTimeInMillis?(): number;
}

/** A sync stops fetching pages with less time than this left (it resumes on the next run) */
const SYNC_TIME_RESERVE_MS = 20_000;

let dependencies: Dependencies | null = null;

function getDependencies(): Dependencies {
  if (!dependencies) {
    const prefix = (process.env.SSM_PARAMETER_PREFIX ?? '/browse-dot-show/auth').replace(/\/$/, '');
    const ssm = new SSMClient({});
    if (!process.env.AUTH_TABLE_NAME) throw new Error('AUTH_TABLE_NAME is required');
    dependencies = createDependencies(
      parseSitesConfig(process.env.AUTH_SITES),
      async name => {
        const { Parameter } = await ssm.send(new GetParameterCommand({ Name: `${prefix}/${name}`, WithDecryption: true }));
        if (!Parameter?.Value) throw new Error(`SSM parameter ${prefix}/${name} is empty`);
        return Parameter.Value;
      },
      createDynamoStorage(process.env.AUTH_TABLE_NAME),
    );
  }
  return dependencies;
}

export async function handler(event: HttpApiEvent | ScheduledEvent, context: LambdaContext = {}) {
  if ('action' in event && event.action === 'sync-supporting-cast') {
    const results = await getDependencies().syncSupportingCast({
      shouldStop: () => (context.getRemainingTimeInMillis?.() ?? Infinity) < SYNC_TIME_RESERVE_MS,
    });
    log.info(`Supporting Cast sync: ${JSON.stringify(results)}`);
    return results;
  }
  return handleHttp(event as HttpApiEvent);
}

async function handleHttp(event: HttpApiEvent) {
  let body: unknown = {};
  if (event.body) {
    try {
      body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body);
    } catch {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'invalid-json' }) };
    }
  }

  let response;
  try {
    response = await handleAuthRequest(
      {
        method: event.requestContext?.http?.method ?? 'GET',
        path: event.rawPath ?? '/',
        headers: event.headers ?? {},
        body,
        sourceIp: event.requestContext?.http?.sourceIp,
      },
      getDependencies(),
    );
  } catch (error) {
    log.error('auth lambda misconfigured', error);
    response = { status: 500, body: { error: 'internal-error' } };
  }

  return {
    statusCode: response.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(response.body),
  };
}
