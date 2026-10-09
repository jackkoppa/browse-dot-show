import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { log } from '@browse-dot-show/logging';
import { handleAuthRequest, type AuthDependencies } from './app.js';
import { createDependencies, parseSitesConfig } from './dependencies.js';

/**
 * Lambda entry point, behind a function URL (payload format 2.0). CORS is the function URL's
 * configuration (Terraform), so OPTIONS requests never reach this handler.
 *
 * Env: AUTH_SITES (JSON, see app.ts), SSM_PARAMETER_PREFIX (e.g. `/browse-dot-show/auth`)
 */

interface FunctionUrlEvent {
  rawPath?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
}

let dependencies: AuthDependencies | null = null;

function getDependencies(): AuthDependencies {
  if (!dependencies) {
    const prefix = (process.env.SSM_PARAMETER_PREFIX ?? '/browse-dot-show/auth').replace(/\/$/, '');
    const ssm = new SSMClient({});
    dependencies = createDependencies(parseSitesConfig(process.env.AUTH_SITES), async name => {
      const { Parameter } = await ssm.send(new GetParameterCommand({ Name: `${prefix}/${name}`, WithDecryption: true }));
      if (!Parameter?.Value) throw new Error(`SSM parameter ${prefix}/${name} is empty`);
      return Parameter.Value;
    });
  }
  return dependencies;
}

export async function handler(event: FunctionUrlEvent) {
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
      { method: event.requestContext?.http?.method ?? 'GET', path: event.rawPath ?? '/', headers: event.headers ?? {}, body },
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
