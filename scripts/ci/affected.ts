import * as fs from 'fs';
import * as path from 'path';
import { REPO_ROOT } from '../lib/paths.js';

/**
 * What a set of changed files means for deploys (`bds ci affected`, used by GitHub Actions).
 *
 * - a site's own folder (`sites/<group>/<id>/`): that site's client; its `terraform/`
 *   subfolder: that site's Terraform too
 * - a workspace package: everything that depends on it (`client` → every site's client; a
 *   lambda package → every site's Terraform, which deploys the lambdas; `homepage` → homepage)
 * - `terraform/sites/` → every site's Terraform; `terraform/homepage/` → homepage
 * - the lockfile, workspace file or base tsconfig → everything
 * - anything else (docs, scripts, tests, workflows, other Terraform stacks): nothing
 */

export interface WorkspacePackage {
  name: string;
  /** Repo-relative directory, no trailing slash. */
  dir: string;
  /** Names of workspace packages it depends on. */
  workspaceDeps: string[];
}

export interface AffectedInput {
  changedFiles: string[];
  packages: WorkspacePackage[];
  /** Sites that can be deployed (in `.site-account-mappings.json`), in a stable order. */
  deployableSites: string[];
}

export interface Affected {
  /** Sites whose Terraform (infrastructure + lambdas) should be planned/applied. */
  terraformSites: string[];
  /** Sites whose client should be built and uploaded. */
  clientSites: string[];
  homepage: boolean;
  /** Changes that need a manual deploy, or files outside deployable sites. */
  notes: string[];
}

const CLIENT_PACKAGE = '@browse-dot-show/client';
const HOMEPAGE_PACKAGE = '@browse-dot-show/homepage';
const LAMBDA_PACKAGES = [
  '@browse-dot-show/rss-retrieval-lambda',
  '@browse-dot-show/process-audio-lambda',
  '@browse-dot-show/srt-indexing-lambda',
  '@browse-dot-show/search-lambda',
];
const SITES_PACKAGE_DIR = 'sites';
const SITE_FOLDER = /^sites\/(origin-sites|my-sites)\/([^/]+)\/(.*)$/;
const DEPLOY_EVERYTHING_FILES = ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json', '.nvmrc'];
const MANUAL_STACKS = ['terraform/automation/', 'terraform/github-actions/'];

/** Files that never affect a build: docs and tests. */
function isIrrelevant(file: string): boolean {
  return /\.(md|spec\.tsx?|test\.tsx?)$/.test(file) || file.includes('/__fixtures__/');
}

export function computeAffected({ changedFiles, packages, deployableSites }: AffectedInput): Affected {
  const terraform = new Set<string>();
  const clients = new Set<string>();
  const changedPackages = new Set<string>();
  const notes: string[] = [];
  let homepage = false;
  let everything = false;

  // Longest directory first, so packages/ingestion/x wins over a shorter prefix
  const packagesByDir = [...packages].sort((a, b) => b.dir.length - a.dir.length);

  for (const file of changedFiles) {
    if (isIrrelevant(file)) continue;

    if (DEPLOY_EVERYTHING_FILES.includes(file)) {
      everything = true;
      continue;
    }

    const siteMatch = file.match(SITE_FOLDER);
    if (siteMatch) {
      const [, , siteId, rest] = siteMatch;
      if (!deployableSites.includes(siteId)) {
        notes.push(`${siteId} isn't in .site-account-mappings.json; deploy it locally first (${file})`);
        continue;
      }
      clients.add(siteId);
      if (rest.startsWith('terraform/')) terraform.add(siteId);
      continue;
    }

    if (file.startsWith('terraform/sites/')) {
      deployableSites.forEach(site => terraform.add(site));
      continue;
    }
    if (file.startsWith('terraform/homepage/')) {
      homepage = true;
      continue;
    }
    const manualStack = MANUAL_STACKS.find(stack => file.startsWith(stack));
    if (manualStack) {
      notes.push(`${manualStack} changed; it isn't deployed automatically (run \`bds infra ...\` locally)`);
      continue;
    }

    // `sites/` is also a package (sites/*.ts); site folders were handled above
    const owner = packagesByDir.find(pkg => file.startsWith(`${pkg.dir}/`) && (pkg.dir !== SITES_PACKAGE_DIR || !SITE_FOLDER.test(file)));
    if (owner) changedPackages.add(owner.name);
  }

  const affectedPackages = withDependents(changedPackages, packages);
  if (everything || affectedPackages.has(CLIENT_PACKAGE)) deployableSites.forEach(site => clients.add(site));
  if (everything || LAMBDA_PACKAGES.some(name => affectedPackages.has(name))) deployableSites.forEach(site => terraform.add(site));
  if (everything || affectedPackages.has(HOMEPAGE_PACKAGE)) homepage = true;

  const ordered = (set: Set<string>) => deployableSites.filter(site => set.has(site));
  return { terraformSites: ordered(terraform), clientSites: ordered(clients), homepage, notes: [...new Set(notes)] };
}

/** `names` plus every package that depends on them, transitively. */
export function withDependents(names: Set<string>, packages: WorkspacePackage[]): Set<string> {
  const result = new Set(names);
  let grew = true;
  while (grew) {
    grew = false;
    for (const pkg of packages) {
      if (!result.has(pkg.name) && pkg.workspaceDeps.some(dep => result.has(dep))) {
        result.add(pkg.name);
        grew = true;
      }
    }
  }
  return result;
}

/** Workspace packages from `pnpm-workspace.yaml` (simple `- dir` entries, no globs). */
export function loadWorkspacePackages(root = REPO_ROOT): WorkspacePackage[] {
  const workspace = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  const packagesSection = workspace.split(/^packages:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
  const dirs = [...packagesSection.matchAll(/^\s*-\s*['"]?([^'"\s]+)['"]?\s*$/gm)].map(match => match[1]);
  return dirs.flatMap(dir => {
    const packageJsonPath = path.join(root, dir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return [];
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const workspaceDeps = Object.entries(deps)
      .filter(([, version]) => String(version).startsWith('workspace:'))
      .map(([name]) => name);
    return [{ name: packageJson.name, dir, workspaceDeps }];
  });
}
