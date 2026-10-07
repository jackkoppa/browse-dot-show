import { execCommandOrThrow } from './shell-exec.js';
import { printInfo, printSuccess } from './logging.js';

/**
 * Upload the built homepage (packages/homepage/dist) and invalidate its CloudFront cache.
 * Shared by `bds infra homepage deploy` and `bds ci upload-homepage`. Uses the AWS
 * credentials in the environment (AWS_PROFILE locally, OIDC in GitHub Actions).
 */
export async function uploadHomepageFiles(bucketName: string, distributionId: string): Promise<void> {
  const DIST_DIR = 'packages/homepage/dist';
  
  printInfo(`Uploading homepage files from ${DIST_DIR} to S3 bucket: ${bucketName}`);
  
  // Sync files to S3
  await execCommandOrThrow('aws', [
    's3',
    'sync',
    DIST_DIR,
    `s3://${bucketName}/`,
    '--delete',
    '--cache-control',
    'max-age=31536000',  // 1 year for assets
    '--exclude',
    'index.html'
  ]);

  // Upload index.html with shorter cache
  await execCommandOrThrow('aws', [
    's3',
    'cp',
    `${DIST_DIR}/index.html`,
    `s3://${bucketName}/index.html`,
    '--cache-control',
    'max-age=3600'  // 1 hour for index.html
  ]);

  printInfo('Invalidating entire CloudFront cache...');
  await execCommandOrThrow('aws', [
    'cloudfront',
    'create-invalidation',
    '--distribution-id',
    distributionId,
    '--paths',
    '/\\*',
    '--no-cli-pager'
  ]);

  printSuccess('✅ Homepage files uploaded successfully!');
}
