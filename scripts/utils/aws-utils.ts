#!/usr/bin/env tsx

import { execCommandOrThrow, commandExists, ShellExecOptions } from './shell-exec';
import { logInfo, logError } from './logging';

export interface AwsCliOptions extends ShellExecOptions {
  profile?: string;
  region?: string;
}

/**
 * Check if AWS CLI is installed
 */
export async function checkAwsCli(): Promise<boolean> {
  const exists = await commandExists('aws');
  if (!exists) {
    logError('AWS CLI is not installed. Please install it first.');
  }
  return exists;
}

/**
 * Execute an AWS CLI command
 */
export async function awsCommand(
  command: string,
  args: string[] = [],
  options: AwsCliOptions = {}
): Promise<any> {
  if (!(await checkAwsCli())) {
    throw new Error('AWS CLI is not available');
  }

  const { profile, region, ...execOptions } = options;
  const awsArgs = ['aws'];

  // Add profile if specified
  if (profile) {
    awsArgs.push('--profile', profile);
  }

  // Add region if specified
  if (region) {
    awsArgs.push('--region', region);
  }

  // Add the actual command and arguments
  awsArgs.push(command, ...args);

  const result = await execCommandOrThrow('', awsArgs, {
    ...execOptions,
    shell: true
  });

  // Try to parse JSON output
  try {
    return JSON.parse(result.stdout);
  } catch {
    // Return raw output if not JSON
    return result.stdout;
  }
}

/**
 * Check if AWS SSO credentials are configured and active
 */
export async function checkAwsCredentials(profile?: string): Promise<boolean> {
  try {
    await awsCommand('sts get-caller-identity', [], { profile, silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if AWS SSO profile is logged in
 */
export async function checkAwsSsoLogin(profile: string): Promise<boolean> {
  try {
    await awsCommand('sts get-caller-identity', [], { profile, silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current AWS identity
 */
export async function getAwsIdentity(profile?: string): Promise<{
  UserId: string;
  Account: string;
  Arn: string;
}> {
  return await awsCommand('sts get-caller-identity', [], { profile });
}

/**
 * List AWS S3 buckets
 */
export async function listS3Buckets(profile?: string): Promise<any[]> {
  const result = await awsCommand('s3api list-buckets', [], { profile });
  return result.Buckets || [];
}

/**
 * Check if S3 bucket exists
 */
export async function s3BucketExists(bucketName: string, profile?: string): Promise<boolean> {
  try {
    await awsCommand('s3api head-bucket', [`--bucket`, bucketName], { 
      profile, 
      silent: true 
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create S3 bucket
 */
export async function createS3Bucket(
  bucketName: string, 
  region: string = 'us-east-1',
  profile?: string
): Promise<void> {
  const args = ['--bucket', bucketName];
  
  if (region !== 'us-east-1') {
    args.push('--create-bucket-configuration', `LocationConstraint=${region}`);
  }

  await awsCommand('s3api create-bucket', args, { profile, region });
  logInfo(`Created S3 bucket: ${bucketName}`);
}

/**
 * Upload file to S3
 */
export async function uploadToS3(
  localPath: string,
  bucketName: string,
  s3Key: string,
  options: AwsCliOptions & { 
    contentType?: string;
    metadata?: Record<string, string>;
  } = {}
): Promise<void> {
  const { contentType, metadata, ...awsOptions } = options;
  const args = [localPath, `s3://${bucketName}/${s3Key}`];

  if (contentType) {
    args.push('--content-type', contentType);
  }

  if (metadata) {
    const metadataStr = Object.entries(metadata)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
    args.push('--metadata', metadataStr);
  }

  await awsCommand('s3 cp', args, awsOptions);
}

/**
 * Download file from S3
 */
export async function downloadFromS3(
  bucketName: string,
  s3Key: string,
  localPath: string,
  options: AwsCliOptions = {}
): Promise<void> {
  const args = [`s3://${bucketName}/${s3Key}`, localPath];
  await awsCommand('s3 cp', args, options);
}

/**
 * Sync directory with S3
 */
export async function syncToS3(
  localPath: string,
  bucketName: string,
  s3Prefix: string = '',
  options: AwsCliOptions & {
    delete?: boolean;
    exclude?: string[];
    include?: string[];
  } = {}
): Promise<void> {
  const { delete: deleteFlag, exclude, include, ...awsOptions } = options;
  const s3Path = s3Prefix ? `s3://${bucketName}/${s3Prefix}` : `s3://${bucketName}`;
  const args = [localPath, s3Path];

  if (deleteFlag) {
    args.push('--delete');
  }

  if (exclude) {
    exclude.forEach(pattern => args.push('--exclude', pattern));
  }

  if (include) {
    include.forEach(pattern => args.push('--include', pattern));
  }

  await awsCommand('s3 sync', args, awsOptions);
}

/**
 * Invoke Lambda function
 */
export async function invokeLambda(
  functionName: string,
  payload?: any,
  options: AwsCliOptions = {}
): Promise<any> {
  const args = ['--function-name', functionName];

  if (payload) {
    args.push('--payload', JSON.stringify(payload));
  }

  args.push('--output', 'json');

  const result = await awsCommand('lambda invoke', [...args, '/dev/stdout'], options);
  return result;
}

/**
 * Get CloudFormation stack status
 */
export async function getStackStatus(
  stackName: string,
  options: AwsCliOptions = {}
): Promise<string | null> {
  try {
    const result = await awsCommand('cloudformation describe-stacks', [
      '--stack-name', stackName
    ], { ...options, silent: true });
    
    return result.Stacks?.[0]?.StackStatus || null;
  } catch {
    return null; // Stack doesn't exist
  }
}

/**
 * Wait for CloudFormation stack operation to complete
 */
export async function waitForStackOperation(
  stackName: string,
  operation: 'create' | 'update' | 'delete',
  options: AwsCliOptions = {}
): Promise<void> {
  const waitCommand = `stack-${operation}-complete`;
  await awsCommand('cloudformation wait', [waitCommand, '--stack-name', stackName], options);
}

/**
 * Validate AWS SSO environment and credentials
 */
export async function validateAwsEnvironment(profile?: string): Promise<{
  valid: boolean;
  identity?: any;
  errors: string[];
  requiresSsoLogin?: boolean;
}> {
  const errors: string[] = [];

  // Check AWS CLI
  if (!(await checkAwsCli())) {
    errors.push('AWS CLI is not installed');
    return { valid: false, errors };
  }

  // If no profile provided, that's an error
  if (!profile) {
    errors.push('AWS_PROFILE not specified in site .env.aws-sso file');
    return { valid: false, errors };
  }

  // Check SSO credentials
  if (!(await checkAwsSsoLogin(profile))) {
    errors.push(`AWS SSO session not active for profile: ${profile}`);
    return { valid: false, errors, requiresSsoLogin: true };
  }

  try {
    const identity = await getAwsIdentity(profile);
    logInfo(`AWS Identity: ${identity.Arn} (Account: ${identity.Account})`);
    return { valid: true, identity, errors: [] };
  } catch (error: any) {
    errors.push(`Failed to get AWS identity: ${error.message}`);
    return { valid: false, errors };
  }
}

/**
 * Validate AWS SSO environment and credentials specifically for homepage
 */
export async function validateHomepageAwsEnvironment(profile: string): Promise<{
  valid: boolean;
  identity?: any;
  errors: string[];
  requiresSsoLogin?: boolean;
}> {
  const errors: string[] = [];

  // Check AWS CLI
  if (!(await checkAwsCli())) {
    errors.push('AWS CLI is not installed');
    return { valid: false, errors };
  }

  // Check SSO credentials
  if (!(await checkAwsSsoLogin(profile))) {
    errors.push(`AWS SSO session not active for profile: ${profile}`);
    errors.push(`Please run: aws sso login --profile ${profile}`);
    return { valid: false, errors, requiresSsoLogin: true };
  }

  try {
    const identity = await getAwsIdentity(profile);
    logInfo(`Homepage AWS Identity: ${identity.Arn} (Account: ${identity.Account})`);
    return { valid: true, identity, errors: [] };
  } catch (error: any) {
    errors.push(`Failed to get AWS identity: ${error.message}`);
    return { valid: false, errors };
  }
} 