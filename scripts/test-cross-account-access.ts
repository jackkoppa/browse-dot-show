#!/usr/bin/env tsx

/**
 * Test script for Phase 2.5+ - Cross-Account Access Testing
 * 
 * This script tests that the automation account can:
 * 1. Assume the role in the specified site account
 * 2. Upload files to the site's S3 bucket  
 * 3. Invoke the site's indexing lambda
 * 
 * Usage: tsx scripts/test-cross-account-access.ts --site=<site_id>
 * Example: tsx scripts/test-cross-account-access.ts --site=claretandblue
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { loadSiteAccountMappings, getSiteAccountMapping } from './utils/site-account-mappings.js';

// Site configuration mapping - partial list for testing
// TODO: Add pickleballstudio mapping when it's deployed for the first time
const LAMBDA_CONFIGS = {
  'hardfork': 'convert-srts-indexed-search-hardfork',
  'claretandblue': 'convert-srts-indexed-search-claretandblue',
  'listenfairplay': 'convert-srts-indexed-search-listenfairplay',
  'naddpod': 'convert-srts-indexed-search-naddpod'
} as const;

type SiteId = keyof typeof LAMBDA_CONFIGS;

// Parse command line arguments
function parseSiteFromArgs(): SiteId {
  const args = process.argv.slice(2);
  const siteArg = args.find(arg => arg.startsWith('--site='));
  
  if (!siteArg) {
    console.error('❌ Missing required --site parameter');
    console.error('Usage: tsx scripts/test-cross-account-access.ts --site=<site_id>');
    console.error('Available sites:', Object.keys(LAMBDA_CONFIGS).join(', '));
    process.exit(1);
  }
  
  const siteId = siteArg.split('=')[1] as SiteId;
  
  if (!LAMBDA_CONFIGS[siteId]) {
    console.error(`❌ Unknown site: ${siteId}`);
    console.error('Available sites:', Object.keys(LAMBDA_CONFIGS).join(', '));
    process.exit(1);
  }
  
  return siteId;
}

// Load automation credentials from .env.automation file
function loadAutomationEnv(): void {
  try {
    const envContent = readFileSync('.env.automation', 'utf-8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=');
          process.env[key] = value;
        }
      }
    }
  } catch (error) {
    console.error('❌ Could not load .env.automation file:', error);
    process.exit(1);
  }
}

loadAutomationEnv();

interface TestResult {
  test: string;
  success: boolean;
  message: string;
  details?: string;
}

function runAwsCommand(command: string): { success: boolean; output: string; error: string } {
  try {
    const output = execSync(command, { 
      encoding: 'utf-8',
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_DEFAULT_REGION: process.env.AWS_REGION || 'us-east-1'
      }
    });
    return { success: true, output: output.trim(), error: '' };
  } catch (error: any) {
    return { 
      success: false, 
      output: '', 
      error: error.message || error.toString() 
    };
  }
}

function testRoleAssumption(siteId: SiteId, roleArn: string): TestResult {
  console.log('🔐 Testing role assumption...');
  
  const command = `aws sts assume-role --role-arn "${roleArn}" --role-session-name "test-automation-access"`;
  const result = runAwsCommand(command);
  
  if (result.success) {
    try {
      const assumeRoleOutput = JSON.parse(result.output);
      
      
      return {
        test: 'Role Assumption',
        success: true,
        message: `✅ Successfully assumed ${siteId} automation role`,
        details: `Session: ${assumeRoleOutput.AssumedRoleUser?.Arn}`
      };
    } catch (parseError) {
      return {
        test: 'Role Assumption',
        success: false,
        message: '❌ Failed to parse assume-role response',
        details: result.output
      };
    }
  } else {
    return {
      test: 'Role Assumption',
      success: false,
      message: `❌ Failed to assume ${siteId} automation role`,
      details: result.error
    };
  }
}

function testS3Access(siteId: SiteId, roleArn: string, bucketName: string): TestResult {
  console.log('🪣 Testing S3 access...');
  
  // First assume the role to get temporary credentials
  const assumeRoleCommand = `aws sts assume-role --role-arn "${roleArn}" --role-session-name "test-s3-access"`;
  const assumeResult = runAwsCommand(assumeRoleCommand);
  
  if (!assumeResult.success) {
    return {
      test: 'S3 Access',
      success: false,
      message: '❌ Could not assume role for S3 test',
      details: assumeResult.error
    };
  }
  
  try {
    const credentials = JSON.parse(assumeResult.output).Credentials;
    
    // Create a test file
    const testFileName = 'test-automation-access.txt';
    const testContent = `Test file created by automation at ${new Date().toISOString()}`;
    writeFileSync(testFileName, testContent);
    
    // Upload test file using assumed role credentials
    const uploadCommand = `AWS_ACCESS_KEY_ID="${credentials.AccessKeyId}" AWS_SECRET_ACCESS_KEY="${credentials.SecretAccessKey}" AWS_SESSION_TOKEN="${credentials.SessionToken}" aws s3 cp ${testFileName} s3://${bucketName}/automation-tests/${testFileName}`;
    
    const uploadResult = runAwsCommand(uploadCommand);
    
    // Clean up local test file
    unlinkSync(testFileName);
    
    if (uploadResult.success) {
      // Try to delete the test file to clean up
      const deleteCommand = `AWS_ACCESS_KEY_ID="${credentials.AccessKeyId}" AWS_SECRET_ACCESS_KEY="${credentials.SecretAccessKey}" AWS_SESSION_TOKEN="${credentials.SessionToken}" aws s3 rm s3://${bucketName}/automation-tests/${testFileName}`;
      runAwsCommand(deleteCommand);
      
      return {
        test: 'S3 Access',
        success: true,
        message: '✅ Successfully uploaded and deleted test file from S3',
        details: `Bucket: ${bucketName}`
      };
    } else {
      return {
        test: 'S3 Access',
        success: false,
        message: '❌ Failed to upload test file to S3',
        details: uploadResult.error
      };
    }
  } catch (error: any) {
    return {
      test: 'S3 Access',
      success: false,
      message: '❌ Error during S3 test',
      details: error.message
    };
  }
}

function testLambdaAccess(siteId: SiteId, roleArn: string, lambdaName: string): TestResult {
  console.log('⚡ Testing Lambda access...');
  
  // First assume the role to get temporary credentials
  const assumeRoleCommand = `aws sts assume-role --role-arn "${roleArn}" --role-session-name "test-lambda-access"`;
  const assumeResult = runAwsCommand(assumeRoleCommand);
  
  if (!assumeResult.success) {
    return {
      test: 'Lambda Access',
      success: false,
      message: '❌ Could not assume role for Lambda test',
      details: assumeResult.error
    };
  }
  
  try {
    const credentials = JSON.parse(assumeResult.output).Credentials;
    
    // Test lambda invocation with dry-run (doesn't actually execute)
    const invokeCommand = `AWS_ACCESS_KEY_ID="${credentials.AccessKeyId}" AWS_SECRET_ACCESS_KEY="${credentials.SecretAccessKey}" AWS_SESSION_TOKEN="${credentials.SessionToken}" aws lambda invoke --function-name ${lambdaName} --invocation-type DryRun --payload '{}' /tmp/lambda-test-output.json`;
    
    const invokeResult = runAwsCommand(invokeCommand);
    
    if (invokeResult.success) {
      return {
        test: 'Lambda Access',
        success: true,
        message: '✅ Successfully tested lambda invoke permissions (dry-run)',
        details: `Function: ${lambdaName}`
      };
    } else {
      // Check if it's a validation error vs permission error
      if (invokeResult.error.includes('InvalidParameterValueException') || invokeResult.error.includes('does not exist')) {
        return {
          test: 'Lambda Access',
          success: false,
          message: '⚠️  Lambda permissions OK, but function may not exist yet',
          details: invokeResult.error
        };
      } else {
        return {
          test: 'Lambda Access',
          success: false,
          message: '❌ Failed to invoke lambda function',
          details: invokeResult.error
        };
      }
    }
  } catch (error: any) {
    return {
      test: 'Lambda Access',
      success: false,
      message: '❌ Error during Lambda test',
      details: error.message
    };
  }
}

function main(): void {
  const siteId = parseSiteFromArgs();
  const siteConfig = getSiteAccountMapping(siteId);
  const lambdaName = LAMBDA_CONFIGS[siteId];
  const roleArn = `arn:aws:iam::${siteConfig.accountId}:role/browse-dot-show-automation-role`;
  
  console.log('🧪 Cross-Account Access Testing - Phase 2.5+');
  console.log('==============================================');
  console.log(`Target Site: ${siteId}`);
  console.log(`Target Account: ${siteConfig.accountId}`);
  console.log(`Role ARN: ${roleArn}`);
  console.log(`S3 Bucket: ${siteConfig.bucketName}`);
  console.log(`Lambda Function: ${lambdaName}`);
  console.log('');
  
  // Validate environment
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Missing AWS credentials in .env.automation file');
    process.exit(1);
  }
  
  const results: TestResult[] = [];
  
  // Run tests
  results.push(testRoleAssumption(siteId, roleArn));
  results.push(testS3Access(siteId, roleArn, siteConfig.bucketName));
  results.push(testLambdaAccess(siteId, roleArn, lambdaName));
  
  // Report results
  console.log('\n📊 Test Results:');
  console.log('================');
  
  let allPassed = true;
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.test}: ${result.message}`);
    if (result.details) {
      console.log(`   Details: ${result.details}`);
    }
    if (!result.success) {
      allPassed = false;
    }
  });
  
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log(`🎉 ALL TESTS PASSED! Cross-account access is working correctly for ${siteId}.`);
    console.log(`✅ Phase 2.5+ - Cross-Account Access for ${siteId}: COMPLETE`);
  } else {
    console.log(`⚠️  Some tests failed for ${siteId}. Please review the errors above.`);
    console.log(`❌ Phase 2.5+ - Cross-Account Access for ${siteId}: NEEDS ATTENTION`);
  }
  
  process.exit(allPassed ? 0 : 1);
}

main(); 