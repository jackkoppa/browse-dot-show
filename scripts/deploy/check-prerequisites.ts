#!/usr/bin/env tsx

import { execCommand, commandExists } from '../utils/shell-exec';
import { exists, readTextFile } from '../utils/file-operations';
import { logInfo, logError, logWarning, printInfo, printError, logSuccess, logProgress } from '../utils/logging';
import { validateAwsEnvironment } from '../utils/aws-utils';
import { checkTerraform, getTerraformVersion } from '../utils/terraform-utils';
import { loadEnvFile } from '../utils/env-validation';

interface PrerequisiteCheck {
  name: string;
  passed: boolean;
  version?: string;
  warning?: string;
  error?: string;
}

/**
 * Check prerequisites for Browse Dot Show deployment
 * 
 * Usage: tsx check-prerequisites.ts
 */

async function checkTool(
  toolName: string, 
  command: string, 
  versionArgs: string[] = ['--version'],
  versionExtractor?: (output: string) => string,
  minVersion?: { major: number; minor?: number }
): Promise<PrerequisiteCheck> {
  
  if (!(await commandExists(command))) {
    return {
      name: toolName,
      passed: false,
      error: `${toolName} is not installed`
    };
  }

  try {
    const result = await execCommand(command, versionArgs, { silent: true });
    let version = 'unknown';
    
    if (versionExtractor) {
      version = versionExtractor(result.stdout);
    } else {
      // Default version extraction
      const match = result.stdout.match(/v?(\d+\.\d+\.\d+)/);
      if (match) {
        version = match[1];
      }
    }

    const check: PrerequisiteCheck = {
      name: toolName,
      passed: true,
      version
    };

    // Check minimum version if specified
    if (minVersion && version !== 'unknown') {
      const [major, minor = 0] = version.split('.').map(Number);
      const requiredMinor = minVersion.minor || 0;
      
      if (major < minVersion.major || (major === minVersion.major && minor < requiredMinor)) {
        check.warning = `Version ${minVersion.major}.${requiredMinor}.0 or later is recommended (current: ${version})`;
        
        // For Terraform, make version requirement strict
        if (toolName === 'Terraform' && (major < minVersion.major || minor < requiredMinor)) {
          check.passed = false;
          check.error = `Terraform version ${minVersion.major}.${requiredMinor}.0 or later is required for AWS SSO support (current: ${version})`;
        }
      }
    }

    return check;
    
  } catch (error: any) {
    return {
      name: toolName,
      passed: false,
      error: `Failed to get ${toolName} version: ${error.message}`
    };
  }
}

async function checkNodejs(): Promise<PrerequisiteCheck> {
  return checkTool(
    'Node.js', 
    'node', 
    ['--version'],
    (output) => output.replace('v', '').trim(),
    { major: 20 }
  );
}

async function checkPnpm(): Promise<PrerequisiteCheck> {
  return checkTool(
    'pnpm', 
    'pnpm', 
    ['--version'],
    (output) => output.trim(),
    { major: 8 }
  );
}

async function checkTerraformTool(): Promise<PrerequisiteCheck> {
  return checkTool(
    'Terraform', 
    'terraform', 
    ['--version'],
    (output) => {
      const match = output.match(/Terraform v(\d+\.\d+\.\d+)/);
      return match ? match[1] : 'unknown';
    },
    { major: 1, minor: 6 }
  );
}

async function checkAwsCli(): Promise<PrerequisiteCheck> {
  return checkTool(
    'AWS CLI', 
    'aws', 
    ['--version'],
    (output) => {
      const match = output.match(/aws-cli\/(\d+\.\d+\.\d+)/);
      return match ? match[1] : 'unknown';
    }
  );
}

async function checkSiteAwsSsoConfig(): Promise<PrerequisiteCheck> {
  // Check that AWS_PROFILE is set from site-specific .env.aws-sso
  const awsProfile = process.env.AWS_PROFILE;
  
  if (!awsProfile) {
    return {
      name: 'Site AWS SSO Configuration',
      passed: false,
      error: 'AWS_PROFILE not found. Please ensure your site .env.aws-sso file contains AWS_PROFILE=your-profile-name'
    };
  }

  return {
    name: 'Site AWS SSO Configuration',
    passed: true,
    version: `Profile: ${awsProfile}`
  };
}

async function checkAwsAuthentication(): Promise<PrerequisiteCheck> {
  try {
    // Get AWS profile from environment (should be loaded from site .env.aws-sso)
    const awsProfile = process.env.AWS_PROFILE;

    if (!awsProfile) {
      return {
        name: 'AWS SSO Authentication',
        passed: false,
        error: 'AWS_PROFILE not set. Please ensure your site .env.aws-sso file contains AWS_PROFILE=your-profile-name'
      };
    }

    const validation = await validateAwsEnvironment(awsProfile);
    
    if (!validation.valid) {
      const errorMsg = validation.requiresSsoLogin
        ? `AWS SSO session not active for profile: ${awsProfile}. Please run 'aws sso login --profile ${awsProfile}' to authenticate`
        : validation.errors.join(', ');
        
      return {
        name: 'AWS SSO Authentication',
        passed: false,
        error: errorMsg
      };
    }

    return {
      name: 'AWS SSO Authentication',
      passed: true,
      version: `Profile: ${awsProfile}`
    };

  } catch (error: any) {
    return {
      name: 'AWS SSO Authentication',
      passed: false,
      error: `AWS authentication check failed: ${error.message}`
    };
  }
}

async function main(): Promise<void> {
  logProgress('Checking prerequisites for Browse Dot Show deployment...');

  const checks = await Promise.all([
    checkTerraformTool(),
    checkAwsCli(),
    checkNodejs(),
    checkPnpm(),
    checkSiteAwsSsoConfig(),
    checkAwsAuthentication()
  ]);

  let allPassed = true;

  for (const check of checks) {
    if (check.passed) {
      const versionInfo = check.version ? ` v${check.version}` : '';
      logSuccess(`✅ ${check.name}${versionInfo} installed`);
      
      if (check.warning) {
        logWarning(`⚠️  Warning: ${check.warning}`);
      }
    } else {
      printError(`❌ ${check.name}: ${check.error}`);
      allPassed = false;
    }
  }

  if (allPassed) {
    logSuccess('✅ All prerequisites checked! You\'re ready to deploy.');
    process.exit(0);
  } else {
    logError('❌ Some prerequisites are not met. Please fix the issues above before deploying.');
    process.exit(1);
  }
}

main().catch((error) => {
  logError('Unexpected error during prerequisites check:', error);
  process.exit(1);
}); 