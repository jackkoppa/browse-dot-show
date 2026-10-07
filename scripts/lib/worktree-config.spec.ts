import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { isWorktreeConfigFile, linkWorktreeConfig } from './worktree-config.js';

describe('isWorktreeConfigFile', () => {
  it('matches env files, mappings, local config, tfvars and custom spelling corrections', () => {
    for (const file of [
      '.env.automation',
      '.env.lambda-prod-build',
      '.site-account-mappings.json',
      '.local-files-config.json',
      '.deployed-sites.json',
      'sites/origin-sites/naddpod/.env.aws-sso',
      'packages/homepage/.env.aws-sso',
      'terraform/automation/terraform.tfvars',
      'packages/spelling/_custom-spelling-corrections.json',
    ]) {
      expect(isWorktreeConfigFile(file), file).toBe(true);
    }
  });

  it('skips build output, ignored directories and Terraform caches', () => {
    for (const file of [
      'node_modules/',
      'packages/client/dist-naddpod/',
      'node_modules/foo/.env.example',
      'terraform/sites/.terraform/terraform.tfstate',
      'terraform/sites/tfplan',
      'terraform/sites/modules/lambda/lambda_function_search-api-naddpod.zip',
    ]) {
      expect(isWorktreeConfigFile(file), file).toBe(false);
    }
  });
});

describe('linkWorktreeConfig', () => {
  it('symlinks ignored config files into the target and leaves existing files alone', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-config-'));
    const source = path.join(tmp, 'main');
    const target = path.join(tmp, 'worktree');
    fs.mkdirSync(path.join(source, 'sites/a'), { recursive: true });
    fs.mkdirSync(path.join(target, 'sites'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: source });
    fs.writeFileSync(path.join(source, '.gitignore'), '.env*\n.site-account-mappings.json\nnode_modules/\n');
    fs.writeFileSync(path.join(source, '.env.automation'), 'KEY=1');
    fs.writeFileSync(path.join(source, '.site-account-mappings.json'), '{}');
    fs.writeFileSync(path.join(source, 'sites/a/.env.aws-sso'), 'AWS_PROFILE=a');
    fs.mkdirSync(path.join(source, 'node_modules/pkg'), { recursive: true });
    fs.writeFileSync(path.join(source, 'node_modules/pkg/.env'), '');
    fs.writeFileSync(path.join(target, '.site-account-mappings.json'), '{"local": true}');

    const result = await linkWorktreeConfig(source, target);

    expect(result.linked.sort()).toEqual(['.env.automation', 'sites/a/.env.aws-sso']);
    expect(result.skipped).toEqual(['.site-account-mappings.json']);
    expect(fs.readlinkSync(path.join(target, 'sites/a/.env.aws-sso'))).toBe(path.join(source, 'sites/a/.env.aws-sso'));
    expect(fs.readFileSync(path.join(target, '.site-account-mappings.json'), 'utf8')).toBe('{"local": true}');
    expect(fs.existsSync(path.join(target, 'node_modules'))).toBe(false);
  });
});
