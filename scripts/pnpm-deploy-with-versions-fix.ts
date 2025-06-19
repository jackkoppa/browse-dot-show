#!/usr/bin/env tsx

import { execCommandOrThrow } from './utils/shell-exec';
import { logInfo, logError, printInfo, printError } from './utils/logging';
import { removeDir } from './utils/file-operations';

/**
 * pnpm deploy with versions fix
 * 
 * Workaround for: https://github.com/pnpm/pnpm/issues/6269
 * Solution from: https://github.com/pnpm/pnpm/issues/6269#issuecomment-1482879661
 * 
 * Usage: tsx pnpm-deploy-with-versions-fix.ts <package-name>
 * Example: tsx pnpm-deploy-with-versions-fix.ts @browse-dot-show/rss-retrieval-lambda
 */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printError('Package name is required');
    console.error('Usage: tsx pnpm-deploy-with-versions-fix.ts <package-name>');
    console.error('Example: tsx pnpm-deploy-with-versions-fix.ts @browse-dot-show/rss-retrieval-lambda');
    process.exit(1);
  }

  const packageName = args[0];
  
  try {
    printInfo(`Running pnpm deploy with versions fix for: ${packageName}`);

    // Run pnpm deploy with the workaround sequence
    await execCommandOrThrow('pnpm', [
      '--filter', packageName,
      'deploy', '--prod', 'temp-packed-dist'
    ]);

    await execCommandOrThrow('pnpm', ['pack']);

    await execCommandOrThrow('tar', ['-zxvf', '*.tgz', 'package/package.json']);

    await execCommandOrThrow('mv', ['package/package.json', 'aws-dist/package.json']);

    // Cleanup
    await removeDir('temp-packed-dist');
    await execCommandOrThrow('rm', ['*.tgz']);
    await removeDir('package');

    logInfo(`✅ Successfully deployed ${packageName} with versions fix`);

  } catch (error: any) {
    logError(`Failed to deploy ${packageName}:`, error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  logError('Unexpected error:', error);
  process.exit(1);
}); 