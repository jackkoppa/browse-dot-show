#!/usr/bin/env tsx

/**
 * Test script for Phase 2.5 - Cross-Account Access Testing
 * 
 * This script tests that the automation account can:
 * 1. Assume the role in the hardfork site account
 * 2. Upload files to the hardfork S3 bucket  
 * 3. Invoke the hardfork indexing lambda
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';

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

const HARDFORK_ACCOUNT_ID = '927984855345';
const HARDFORK_ROLE_ARN = `arn:aws:iam::${HARDFORK_ACCOUNT_ID}:role/browse-dot-show-automation-role`;
const HARDFORK_BUCKET = 'hardfork-browse-dot-show';
const HARDFORK_INDEXING_LAMBDA = 'convert-srts-indexed-search-hardfork';

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

function testRoleAssumption(): TestResult {
  console.log('🔐 Testing role assumption...');
  
  const command = `aws sts assume-role --role-arn "${HARDFORK_ROLE_ARN}" --role-session-name "test-automation-access"`;
  const result = runAwsCommand(command);
  
  if (result.success) {
    try {
      const assumeRoleOutput = JSON.parse(result.output);
      const credentials = assumeRoleOutput.Credentials;
      
      return {
        test: 'Role Assumption',
        success: true,
        message: '✅ Successfully assumed hardfork automation role',
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
      message: '❌ Failed to assume hardfork automation role',
      details: result.error
    };
  }
}

function testS3Access(): TestResult {
  console.log('🪣 Testing S3 access...');
  
  // First assume the role to get temporary credentials
  const assumeRoleCommand = `aws sts assume-role --role-arn "${HARDFORK_ROLE_ARN}" --role-session-name "test-s3-access"`;
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
    const uploadCommand = `AWS_ACCESS_KEY_ID="${credentials.AccessKeyId}" AWS_SECRET_ACCESS_KEY="${credentials.SecretAccessKey}" AWS_SESSION_TOKEN="${credentials.SessionToken}" aws s3 cp ${testFileName} s3://${HARDFORK_BUCKET}/automation-tests/${testFileName}`;
    
    const uploadResult = runAwsCommand(uploadCommand);
    
    // Clean up local test file
    unlinkSync(testFileName);
    
    if (uploadResult.success) {
      // Try to delete the test file to clean up
      const deleteCommand = `AWS_ACCESS_KEY_ID="${credentials.AccessKeyId}" AWS_SECRET_ACCESS_KEY="${credentials.SecretAccessKey}" AWS_SESSION_TOKEN="${credentials.SessionToken}" aws s3 rm s3://${HARDFORK_BUCKET}/automation-tests/${testFileName}`;
      runAwsCommand(deleteCommand);
      
      return {
        test: 'S3 Access',
        success: true,
        message: '✅ Successfully uploaded and deleted test file from S3',
        details: `Bucket: ${HARDFORK_BUCKET}`
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

function testLambdaAccess(): TestResult {
  console.log('⚡ Testing Lambda access...');
  
  // First assume the role to get temporary credentials
  const assumeRoleCommand = `aws sts assume-role --role-arn "${HARDFORK_ROLE_ARN}" --role-session-name "test-lambda-access"`;
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
    const invokeCommand = `AWS_ACCESS_KEY_ID="${credentials.AccessKeyId}" AWS_SECRET_ACCESS_KEY="${credentials.SecretAccessKey}" AWS_SESSION_TOKEN="${credentials.SessionToken}" aws lambda invoke --function-name ${HARDFORK_INDEXING_LAMBDA} --invocation-type DryRun --payload '{}' /tmp/lambda-test-output.json`;
    
    const invokeResult = runAwsCommand(invokeCommand);
    
    if (invokeResult.success) {
      return {
        test: 'Lambda Access',
        success: true,
        message: '✅ Successfully tested lambda invoke permissions (dry-run)',
        details: `Function: ${HARDFORK_INDEXING_LAMBDA}`
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
  console.log('🧪 Cross-Account Access Testing - Phase 2.5');
  console.log('=============================================');
  console.log(`Target Account: ${HARDFORK_ACCOUNT_ID} (hardfork)`);
  console.log(`Role ARN: ${HARDFORK_ROLE_ARN}`);
  console.log('');
  
  // Validate environment
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Missing AWS credentials in .env.automation file');
    process.exit(1);
  }
  
  const results: TestResult[] = [];
  
  // Run tests
  results.push(testRoleAssumption());
  results.push(testS3Access());
  results.push(testLambdaAccess());
  
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
    console.log('🎉 ALL TESTS PASSED! Cross-account access is working correctly.');
    console.log('✅ Phase 2.5 - Cross-Account Access: COMPLETE');
    console.log('\n🚀 Ready to proceed to Phase 2.6 - Roll out to remaining sites');
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.');
    console.log('❌ Phase 2.5 - Cross-Account Access: NEEDS ATTENTION');
  }
  
  process.exit(allPassed ? 0 : 1);
}

main(); 