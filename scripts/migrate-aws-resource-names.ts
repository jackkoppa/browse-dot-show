#!/usr/bin/env tsx

import { awsCommand, checkAwsCredentials, getAwsIdentity } from './utils/aws-utils.js';
import { selectSite, loadSiteEnvVars } from './utils/site-selector.js';
import { logInfo, logError, logSuccess, logWarning } from './utils/logging.js';

/**
 * Function name mappings for AWS resource name migration
 */
const FUNCTION_NAME_MAPPINGS = {
    'retrieve-rss-feeds-and-download-audio-files': 'rss-retrieval',
    'process-new-audio-files-via-whisper': 'whisper-transcription',
    'convert-srts-indexed-search': 'srt-indexing',
    'search-indexed-transcripts': 'search-api'
};

interface LambdaFunctionInfo {
    FunctionName: string;
    FunctionArn: string;
    Runtime: string;
    Role: string;
    Handler: string;
    Description?: string;
    Timeout: number;
    MemorySize: number;
    Environment?: {
        Variables?: Record<string, string>;
    };
}

/**
 * Migrates AWS resources for a specific site
 */
async function migrateAwsResourcesForSite(siteId: string, awsProfile: string): Promise<void> {
    logInfo(`🔄 Starting migration for site: ${siteId}`);
    
    // Verify AWS credentials
    const credentialsValid = await checkAwsCredentials(awsProfile);
    if (!credentialsValid) {
        logError(`AWS credentials not valid for profile: ${awsProfile}`);
        throw new Error('Invalid AWS credentials');
    }
    
    const identity = await getAwsIdentity(awsProfile);
    logInfo(`✅ Connected to AWS account: ${identity.Account}`);
    
    // Get list of existing Lambda functions for this site
    const existingFunctions = await getExistingLambdaFunctions(siteId, awsProfile);
    
    if (existingFunctions.length === 0) {
        logWarning(`No existing Lambda functions found for site: ${siteId}`);
        return;
    }
    
    logInfo(`Found ${existingFunctions.length} existing Lambda functions:`);
    existingFunctions.forEach(fn => logInfo(`  - ${fn.FunctionName}`));
    
    // Migrate each function
    for (const functionInfo of existingFunctions) {
        await migrateLambdaFunction(functionInfo, siteId, awsProfile);
    }
    
    logSuccess(`✅ Migration completed for site: ${siteId}`);
}

/**
 * Gets existing Lambda functions for a site
 */
async function getExistingLambdaFunctions(siteId: string, awsProfile: string): Promise<LambdaFunctionInfo[]> {
    try {
        const result = await awsCommand('lambda list-functions', [], { profile: awsProfile });
        const allFunctions = result.Functions || [];
        
        // Filter functions that belong to this site and need migration
        const siteFunctions = allFunctions.filter((fn: any) => 
            fn.FunctionName.includes(siteId) && 
            Object.keys(FUNCTION_NAME_MAPPINGS).some(oldName => 
                fn.FunctionName.includes(oldName)
            )
        );
        
        return siteFunctions;
    } catch (error: any) {
        logError(`Error listing Lambda functions: ${error.message}`);
        return [];
    }
}

/**
 * Migrates a single Lambda function
 */
async function migrateLambdaFunction(functionInfo: LambdaFunctionInfo, siteId: string, awsProfile: string): Promise<void> {
    const oldFunctionName = functionInfo.FunctionName;
    
    // Determine new function name
    let newFunctionName = oldFunctionName;
    for (const [oldName, newName] of Object.entries(FUNCTION_NAME_MAPPINGS)) {
        if (oldFunctionName.includes(oldName)) {
            newFunctionName = oldFunctionName.replace(oldName, newName);
            break;
        }
    }
    
    if (newFunctionName === oldFunctionName) {
        logWarning(`No migration needed for: ${oldFunctionName}`);
        return;
    }
    
    logInfo(`🔄 Migrating: ${oldFunctionName} → ${newFunctionName}`);
    
    try {
        // Step 1: Create new function with updated name
        await createNewLambdaFunction(functionInfo, newFunctionName, awsProfile);
        
        // Step 2: Update EventBridge triggers to point to new function
        await updateEventBridgeTriggers(oldFunctionName, newFunctionName, awsProfile);
        
        // Step 3: Update Lambda permissions
        await updateLambdaPermissions(oldFunctionName, newFunctionName, awsProfile);
        
        // Step 4: Update API Gateway integrations (for search function)
        if (oldFunctionName.includes('search-indexed-transcripts')) {
            await updateApiGatewayIntegration(oldFunctionName, newFunctionName, awsProfile);
        }
        
        // Step 5: Wait a bit for propagation
        logInfo('⏳ Waiting for resource propagation...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Step 6: Delete old function
        await deleteOldLambdaFunction(oldFunctionName, awsProfile);
        
        logSuccess(`✅ Successfully migrated: ${oldFunctionName} → ${newFunctionName}`);
        
    } catch (error: any) {
        logError(`❌ Failed to migrate ${oldFunctionName}: ${error.message}`);
        throw error;
    }
}

/**
 * Creates a new Lambda function with the updated name
 */
async function createNewLambdaFunction(sourceFunction: LambdaFunctionInfo, newFunctionName: string, awsProfile: string): Promise<void> {
    logInfo(`Creating new function: ${newFunctionName}`);
    
    // First, get the function's code
    const codeResult = await awsCommand('lambda get-function', ['--function-name', sourceFunction.FunctionName], { profile: awsProfile });
    const codeLocation = codeResult.Code.Location;
    
    // Download the code temporarily
    const tempCodePath = `/tmp/${newFunctionName}.zip`;
    await awsCommand('', ['curl', '-o', tempCodePath, codeLocation], { profile: awsProfile });
    
    // Create the new function
    const createArgs = [
        '--function-name', newFunctionName,
        '--runtime', sourceFunction.Runtime,
        '--role', sourceFunction.Role,
        '--handler', sourceFunction.Handler,
        '--zip-file', `fileb://${tempCodePath}`,
        '--timeout', sourceFunction.Timeout.toString(),
        '--memory-size', sourceFunction.MemorySize.toString()
    ];
    
    if (sourceFunction.Description) {
        createArgs.push('--description', sourceFunction.Description);
    }
    
    if (sourceFunction.Environment?.Variables) {
        const envVars = Object.entries(sourceFunction.Environment.Variables)
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
        createArgs.push('--environment', `Variables={${envVars}}`);
    }
    
    await awsCommand('lambda create-function', createArgs, { profile: awsProfile });
    
    // Clean up temp file
    await awsCommand('', ['rm', tempCodePath], { profile: awsProfile });
}

/**
 * Updates EventBridge triggers to point to new function
 */
async function updateEventBridgeTriggers(oldFunctionName: string, newFunctionName: string, awsProfile: string): Promise<void> {
    logInfo(`Updating EventBridge triggers for: ${newFunctionName}`);
    
    try {
        // List all rules to find ones that target this function
        const rulesResult = await awsCommand('events list-rules', [], { profile: awsProfile });
        const rules = rulesResult.Rules || [];
        
        for (const rule of rules) {
            const targetsResult = await awsCommand('events list-targets-by-rule', ['--rule', rule.Name], { profile: awsProfile });
            const targets = targetsResult.Targets || [];
            
            for (const target of targets) {
                if (target.Arn && target.Arn.includes(oldFunctionName)) {
                    logInfo(`  Updating rule: ${rule.Name}`);
                    
                    // Update the target to point to new function
                    const newArn = target.Arn.replace(oldFunctionName, newFunctionName);
                    const updateArgs = [
                        '--rule', rule.Name,
                        '--targets', `Id=${target.Id},Arn=${newArn}`
                    ];
                    
                    await awsCommand('events put-targets', updateArgs, { profile: awsProfile });
                }
            }
        }
    } catch (error: any) {
        logWarning(`Could not update EventBridge triggers: ${error.message}`);
    }
}

/**
 * Updates Lambda permissions
 */
async function updateLambdaPermissions(oldFunctionName: string, newFunctionName: string, awsProfile: string): Promise<void> {
    logInfo(`Updating Lambda permissions for: ${newFunctionName}`);
    
    try {
        // Get existing permissions
        const policyResult = await awsCommand('lambda get-policy', ['--function-name', oldFunctionName], { profile: awsProfile });
        const policy = JSON.parse(policyResult.Policy);
        
        // Add permissions to new function
        for (const statement of policy.Statement) {
            if (statement.Principal && statement.Action) {
                const addPermissionArgs = [
                    '--function-name', newFunctionName,
                    '--statement-id', statement.Sid,
                    '--action', statement.Action,
                    '--principal', typeof statement.Principal === 'string' ? statement.Principal : statement.Principal.Service
                ];
                
                if (statement.SourceArn) {
                    addPermissionArgs.push('--source-arn', statement.SourceArn);
                }
                
                await awsCommand('lambda add-permission', addPermissionArgs, { profile: awsProfile });
            }
        }
    } catch (error: any) {
        logWarning(`Could not update Lambda permissions: ${error.message}`);
    }
}

/**
 * Updates API Gateway integration for search function
 */
async function updateApiGatewayIntegration(oldFunctionName: string, newFunctionName: string, awsProfile: string): Promise<void> {
    logInfo(`Updating API Gateway integration for: ${newFunctionName}`);
    
    try {
        // This is a simplified approach - in practice you'd need to:
        // 1. Find the API Gateway that integrates with this function
        // 2. Update the integration to point to the new function
        // For now, we'll log that this needs manual attention
        logWarning(`⚠️  Manual step required: Update API Gateway integration for ${newFunctionName}`);
        logWarning(`   The API Gateway integration will need to be updated to point to the new function`);
    } catch (error: any) {
        logWarning(`Could not update API Gateway integration: ${error.message}`);
    }
}

/**
 * Deletes the old Lambda function
 */
async function deleteOldLambdaFunction(oldFunctionName: string, awsProfile: string): Promise<void> {
    logInfo(`Deleting old function: ${oldFunctionName}`);
    
    try {
        await awsCommand('lambda delete-function', ['--function-name', oldFunctionName], { profile: awsProfile });
        logSuccess(`✅ Deleted old function: ${oldFunctionName}`);
    } catch (error: any) {
        logError(`Failed to delete old function ${oldFunctionName}: ${error.message}`);
        throw error;
    }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
    try {
        // Check if site was provided via command line
        const siteArg = process.argv.find(arg => arg.startsWith('--site='));
        const preselectedSiteId = siteArg ? siteArg.split('=')[1] : undefined;
        
        // Select site
        const siteId = await selectSite({
            operation: 'AWS resource migration',
            defaultSiteId: preselectedSiteId,
            skipPrompt: !!preselectedSiteId
        });
        
        // Load site environment variables
        const siteEnvVars = loadSiteEnvVars(siteId, 'prod');
        const awsProfile = siteEnvVars.AWS_PROFILE;
        
        if (!awsProfile) {
            logError(`No AWS profile found for site: ${siteId}`);
            process.exit(1);
        }
        
        logInfo(`Using AWS profile: ${awsProfile}`);
        
        // Confirm before proceeding
        logWarning('⚠️  This will rename AWS resources in your production environment!');
        logWarning('   Make sure you have:');
        logWarning('   1. Updated the Terraform configuration first');
        logWarning('   2. Tested the new configuration');
        logWarning('   3. Have a backup plan');
        
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const proceed = await new Promise<boolean>((resolve) => {
            rl.question('Do you want to proceed? (y/N): ', (answer: string) => {
                rl.close();
                resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
            });
        });
        
        if (!proceed) {
            logInfo('Migration cancelled by user');
            return;
        }
        
        // Perform the migration
        await migrateAwsResourcesForSite(siteId, awsProfile);
        
        logSuccess('🎉 Migration completed successfully!');
        logInfo('');
        logInfo('📋 Next steps:');
        logInfo('  1. Apply the updated Terraform configuration');
        logInfo('  2. Test the site functionality');
        logInfo('  3. Monitor the logs for any issues');
        
    } catch (error: any) {
        logError(`Migration failed: ${error.message}`);
        process.exit(1);
    }
}

// Run the script
main().catch(console.error); 