import * as path from 'path';
import { repoPath } from './paths.js';
import { getSiteDirectory } from './sites.js';

/**
 * The Terraform invocation for a site's stack (terraform/sites), shared by `bds site deploy`
 * and `bds ci terraform` so both use the same backend config, tfvars and variables.
 * Paths are relative to terraform/sites, where Terraform runs.
 */

export const SITES_TERRAFORM_DIR = repoPath('terraform/sites');

export function siteTerraformFiles(siteId: string): { backendConfig: string; tfvars: string } {
  const siteDir = getSiteDirectory(siteId);
  if (!siteDir) throw new Error(`Site directory for "${siteId}" not found`);
  const relative = (file: string) => path.relative(SITES_TERRAFORM_DIR, path.join(siteDir, 'terraform', file));
  return { backendConfig: relative('backend.tfbackend'), tfvars: relative('prod.tfvars') };
}

export function siteInitArgs(siteId: string): string[] {
  return ['init', '-backend-config', siteTerraformFiles(siteId).backendConfig, '-reconfigure'];
}

/**
 * `terraform plan` args. `awsProfile` overrides the profile in prod.tfvars; empty (CI) makes
 * the provider use the environment's credentials. The OpenAI key is passed in the
 * environment (`siteTerraformEnv`), not as an argument, so it never appears in logs.
 */
export function sitePlanArgs(siteId: string, options: { awsProfile?: string; out?: string; lock?: boolean } = {}): string[] {
  return [
    'plan',
    `-var-file=${siteTerraformFiles(siteId).tfvars}`,
    `-var=site_id=${siteId}`,
    `-var=aws_profile=${options.awsProfile ?? ''}`,
    ...(options.lock === false ? ['-lock=false'] : []),
    `-out=${options.out ?? 'tfplan'}`,
  ];
}

/** Environment for site Terraform commands: the OpenAI key as a Terraform variable. */
export function siteTerraformEnv(openaiApiKey: string | undefined): NodeJS.ProcessEnv {
  if (!openaiApiKey) throw new Error('OPENAI_API_KEY is required (the process-audio lambda\'s environment).');
  return { ...process.env, TF_VAR_openai_api_key: openaiApiKey };
}
