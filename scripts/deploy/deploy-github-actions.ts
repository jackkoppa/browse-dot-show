#!/usr/bin/env tsx

import { spawn } from 'child_process';
import * as fs from 'fs';
import prompts from 'prompts';
import { checkAwsCredentials } from '../lib/aws-utils.js';
import { logHeader, printError, printInfo, printSuccess, printWarning } from '../lib/logging.js';
import { repoPath } from '../lib/paths.js';
import { execCommand } from '../lib/shell-exec.js';

/**
 * Deploy terraform/github-actions: the GitHub OIDC provider plus the plan and deploy roles in
 * each of the three AWS accounts. Run locally, once (and after changes to the stack), with the
 * admin SSO profiles named in github-actions.tfvars. Always shows the plan and asks first.
 */

const TF_DIR = repoPath('terraform/github-actions');
const TFVARS = 'github-actions.tfvars';

interface AccountConfig {
  key: string;
  profile: string;
  createOidcProvider: boolean;
}

/** The `accounts` entries from github-actions.tfvars (one per line). */
function readAccounts(): AccountConfig[] {
  const tfvars = fs.readFileSync(`${TF_DIR}/${TFVARS}`, 'utf8');
  return [...tfvars.matchAll(/^\s*(\w+)\s*=\s*\{\s*profile\s*=\s*"([^"]+)",\s*create_oidc_provider\s*=\s*(true|false)\s*\}/gm)].map(
    ([, key, profile, create]) => ({ key, profile, createOidcProvider: create === 'true' })
  );
}

function runTerraform(args: string[]): Promise<number> {
  console.log(`\n$ terraform ${args.join(' ')}`);
  return new Promise(resolve => {
    const child = spawn('terraform', args, { cwd: TF_DIR, stdio: 'inherit' });
    child.on('error', () => resolve(1));
    child.on('close', code => resolve(code ?? 1));
  });
}

async function hasGithubOidcProvider(profile: string): Promise<boolean> {
  const result = await execCommand('aws', ['iam', 'list-open-id-connect-providers', '--profile', profile, '--output', 'json'], { silent: true });
  if (result.exitCode !== 0) throw new Error(`Could not list OIDC providers with ${profile}: ${result.stderr}`);
  return result.stdout.includes('token.actions.githubusercontent.com');
}

async function main(): Promise<void> {
  logHeader('Deploy GitHub Actions access (OIDC roles)');

  if (!process.stdin.isTTY) {
    printError('This deploy asks for confirmation; run it in a terminal.');
    process.exit(2);
  }

  const accounts = readAccounts();
  if (accounts.length !== 3) {
    printError(`Expected 3 accounts in ${TFVARS}, found ${accounts.length}.`);
    process.exit(1);
  }

  // Credentials, and whether each account already has GitHub's OIDC provider
  let mismatch = false;
  for (const account of accounts) {
    if (!(await checkAwsCredentials(account.profile))) {
      printError(`No active session for ${account.profile}. Run: aws sso login --profile ${account.profile}`);
      process.exit(1);
    }
    const exists = await hasGithubOidcProvider(account.profile);
    printInfo(`${account.key} (${account.profile}): GitHub OIDC provider ${exists ? 'exists' : 'not present'}`);
    if (exists === account.createOidcProvider) {
      mismatch = true;
      printWarning(`   Set create_oidc_provider = ${!exists} for ${account.key} in terraform/github-actions/${TFVARS}`);
    }
  }
  if (mismatch) process.exit(1);

  if ((await runTerraform(['init', '-backend-config=terraform.tfbackend', '-reconfigure'])) !== 0) process.exit(1);
  if ((await runTerraform(['plan', `-var-file=${TFVARS}`, '-out=tfplan'])) !== 0) process.exit(1);

  const { confirmed } = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message: 'Apply this plan? (creates IAM roles that GitHub Actions can assume)',
    initial: false,
  });
  if (!confirmed) {
    printInfo('Not applied.');
    fs.rmSync(`${TF_DIR}/tfplan`, { force: true });
    return;
  }

  const applyCode = await runTerraform(['apply', 'tfplan']);
  fs.rmSync(`${TF_DIR}/tfplan`, { force: true });
  if (applyCode !== 0) process.exit(1);
  await runTerraform(['output', 'role_arns']);

  printSuccess('\nDone. Next, configure the repository (once):');
  console.log(`
  # The homepage's account (the site accounts come from .site-account-mappings.json)
  gh variable set HOMEPAGE_AWS_ACCOUNT_ID --body 297202224084

  # The process-audio lambda's environment, passed to Terraform
  gh secret set OPENAI_API_KEY

  # Approval gate: every Terraform plan on a PR needs your approval before merging
  gh api -X PUT repos/jackkoppa/browse-dot-show/environments/terraform-approval \\
    -F "reviewers[][type]=User" -F "reviewers[][id]=$(gh api user -q .id)"
`);
}

main().catch(error => {
  printError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
