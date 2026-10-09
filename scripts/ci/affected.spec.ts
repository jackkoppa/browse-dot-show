import { describe, expect, it } from 'vitest';
import { computeAffected, groupByAccount, loadWorkspacePackages } from './affected.js';

const packages = loadWorkspacePackages();
const deployableSites = ['alpha', 'beta', 'gamma'];
const affected = (...changedFiles: string[]) => computeAffected({ changedFiles, packages, deployableSites });
const ALL = deployableSites;

describe('computeAffected', () => {
  it('deploys nothing for docs, scripts, tests, workflows and scratchpad', () => {
    expect(affected(
      'docs/local-development.md',
      'scratchpad/scripts-overhaul/HANDOFF.md',
      'scripts/ingestion/pipeline.ts',
      'packages/client/src/components/AppHeader.spec.tsx',
      '.github/workflows/deploy.yml',
      'package.json',
    )).toEqual({ terraformSites: [], clientSites: [], homepage: false, notes: [] });
  });

  it("deploys a site's client for its config or assets, and its Terraform for its tfvars", () => {
    expect(affected('sites/origin-sites/beta/site.config.json', 'sites/origin-sites/beta/assets/favicon.ico')).toMatchObject({ clientSites: ['beta'], terraformSites: [] });
    expect(affected('sites/origin-sites/beta/terraform/prod.tfvars')).toMatchObject({ clientSites: ['beta'], terraformSites: ['beta'] });
    expect(affected('sites/origin-sites/beta/README.md')).toMatchObject({ clientSites: [], terraformSites: [] });
  });

  it('notes sites that are not deployable yet', () => {
    const result = affected('sites/origin-sites/newsite/site.config.json');
    expect(result.clientSites).toEqual([]);
    expect(result.notes[0]).toContain('newsite');
  });

  it('deploys every client when the client or a package it depends on changes', () => {
    expect(affected('packages/client/src/App.tsx')).toMatchObject({ clientSites: ALL, terraformSites: [], homepage: false });
    expect(affected('packages/blocks/src/index.ts')).toMatchObject({ clientSites: ALL, homepage: true }); // blocks → client, homepage
    expect(affected('sites/index.ts')).toMatchObject({ clientSites: ALL, homepage: true });
  });

  it('deploys every Terraform stack when a lambda or a package a lambda depends on changes', () => {
    expect(affected('packages/search/search-lambda/search-indexed-transcripts.ts')).toMatchObject({ terraformSites: ALL, clientSites: [] });
    expect(affected('packages/ingestion/process-audio-lambda/utils/ffmpeg-utils.ts')).toMatchObject({ terraformSites: ALL });
    expect(affected('packages/spelling/apply-spelling-corrections.ts')).toMatchObject({ terraformSites: ALL, clientSites: [] }); // via process-audio
    expect(affected('packages/database/index.ts')).toMatchObject({ terraformSites: ALL }); // via s3 → lambdas
    expect(affected('terraform/sites/main.tf')).toMatchObject({ terraformSites: ALL, clientSites: [] });
  });

  it('deploys the homepage for its package or its Terraform', () => {
    expect(affected('packages/homepage/src/App.tsx')).toMatchObject({ homepage: true, clientSites: [], terraformSites: [] });
    expect(affected('terraform/homepage/main.tf')).toMatchObject({ homepage: true, terraformSites: [] });
  });

  it('only notes the manual Terraform stacks', () => {
    const result = affected('terraform/automation/main.tf', 'terraform/github-actions/main.tf', 'terraform/auth/main.tf');
    expect(result).toMatchObject({ terraformSites: [], clientSites: [], homepage: false });
    expect(result.notes).toHaveLength(3);
  });

  it('deploys everything when the lockfile changes', () => {
    expect(affected('pnpm-lock.yaml')).toEqual({ terraformSites: ALL, clientSites: ALL, homepage: true, notes: [] });
  });
});

describe('loadWorkspacePackages', () => {
  it('reads every workspace package with its workspace dependencies', () => {
    const client = packages.find(pkg => pkg.name === '@browse-dot-show/client');
    expect(client?.dir).toBe('packages/client');
    expect(client?.workspaceDeps).toContain('@browse-dot-show/ui');
    expect(packages.find(pkg => pkg.dir === 'packages/ingestion/process-audio-lambda')?.name).toBe('@browse-dot-show/process-audio-lambda');
  });
});

describe('groupByAccount', () => {
  it('groups matrix items per AWS account, in first-seen order', () => {
    const items = [
      { target: 'site:a', account_id: '1' },
      { target: 'site:b', account_id: '2' },
      { target: 'site:c', account_id: '1' },
      { target: 'homepage', account_id: '0' },
    ];
    expect(groupByAccount(items)).toEqual([
      { accountId: '1', items: [items[0], items[2]] },
      { accountId: '2', items: [items[1]] },
      { accountId: '0', items: [items[3]] },
    ]);
  });
});
