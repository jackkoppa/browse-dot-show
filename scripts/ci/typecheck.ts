import { spawn } from 'child_process';
import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * `pnpm all:typecheck`: `tsc --noEmit` for every TypeScript project in the workspace, reporting
 * all failures (not just the first). The `checks` workflow runs it on every PR.
 *
 * Run `pnpm all:build` first: packages import each other's built `dist/` types.
 *
 * Lambda packages are checked here rather than through a `typecheck` script in their
 * package.json, because those scripts are copied into aws-dist/package.json, and any change
 * there changes every site's lambda zip.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** The scripts package's TypeScript (the workspace catalog version), since not every package depends on it */
const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc');

export const TYPECHECK_PROJECTS: { dir: string; config: string }[] = [
  { dir: 'scripts', config: 'tsconfig.json' },
  { dir: 'sites', config: 'tsconfig.json' },
  { dir: 'packages/alerting', config: 'tsconfig.json' },
  { dir: 'packages/blocks', config: 'tsconfig.json' },
  { dir: 'packages/config', config: 'tsconfig.json' },
  { dir: 'packages/constants', config: 'tsconfig.json' },
  { dir: 'packages/database', config: 'tsconfig.json' },
  { dir: 'packages/logging', config: 'tsconfig.json' },
  { dir: 'packages/s3', config: 'tsconfig.json' },
  { dir: 'packages/spelling', config: 'tsconfig.json' },
  { dir: 'packages/types', config: 'tsconfig.json' },
  { dir: 'packages/validation', config: 'tsconfig.json' },
  { dir: 'packages/ingestion/rss-retrieval-lambda', config: 'tsconfig.json' },
  { dir: 'packages/ingestion/process-audio-lambda', config: 'tsconfig.json' },
  { dir: 'packages/ingestion/srt-indexing-lambda', config: 'tsconfig.json' },
  { dir: 'packages/search/search-lambda', config: 'tsconfig.json' },
  // Not yet: packages/client and packages/homepage (their tsconfig.app.json fails on
  // packages/ui, which is imported from source without @types/react), packages/ui (no tsconfig).
];

interface Result {
  project: string;
  ok: boolean;
  output: string;
  seconds: number;
}

function typecheck(project: { dir: string; config: string }): Promise<Result> {
  const started = Date.now();
  const name = `${project.dir}/${project.config}`;
  return new Promise(resolve => {
    const child = spawn(process.execPath, [TSC, '--noEmit', '-p', project.config], { cwd: path.join(REPO_ROOT, project.dir), stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => chunks.push(chunk));
    const done = (ok: boolean, extra = '') =>
      resolve({ project: name, ok, output: Buffer.concat(chunks).toString('utf8') + extra, seconds: Math.round((Date.now() - started) / 1000) });
    child.on('error', error => done(false, error.message));
    child.on('close', code => done(code === 0));
  });
}

async function main(): Promise<number> {
  const queue = [...TYPECHECK_PROJECTS];
  const results: Result[] = [];
  const inGithub = Boolean(process.env.GITHUB_ACTIONS);
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let project = queue.shift(); project; project = queue.shift()) {
        const result = await typecheck(project);
        results.push(result);
        console.log(`${result.ok ? '✅' : '❌'} ${result.project} (${result.seconds}s)`);
        if (!result.ok) {
          if (inGithub) console.log(`::group::${result.project}`);
          console.log(result.output.trim());
          if (inGithub) console.log('::endgroup::');
        }
      }
    })
  );
  const failed = results.filter(result => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} projects typecheck${failed.length ? `; failing: ${failed.map(result => result.project).join(', ')}` : ''}`);
  return failed.length ? 1 : 0;
}

main().then(code => process.exit(code), error => {
  console.error(error);
  process.exit(1);
});
