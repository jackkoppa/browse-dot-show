#!/usr/bin/env tsx

/**
 * This script provides functions to manage Terraform state backup in S3.
 * It expects to be sourced by another script that sets up the following environment variables:
 * - S3_TFSTATE_URI: The full S3 URI for the Terraform state file (e.g., s3://my-bucket/environment/terraform.tfstate)
 * - TF_STATE_FILENAME: The basename of the Terraform state file (e.g., terraform.tfstate)
 * - AWS_PROFILE: (Optional) The AWS profile to use for AWS CLI commands.
 *
 * All functions in this script assume they are executed from WITHIN the Terraform configuration directory.
 */

import { join } from 'path';
import { execCommand, execCommandOrThrow } from '../utils/shell-exec.js';
import { exists, readTextFile, writeTextFile } from '../utils/file-operations.js';
import { printInfo, printError, printWarning, printSuccess, promptUser } from '../utils/logging.js';

interface TfStateConfig {
  s3TfStateUri: string;
  tfStateFilename: string;
  awsProfile?: string;
}



/**
 * Internal helper function for AWS CLI S3 commands.
 * It respects the AWS_PROFILE environment variable if set.
 */
async function runAwsS3Command(command: string, args: string[], awsProfile?: string): Promise<{ success: boolean; output?: string }> {
  const awsArgs = ['aws', 's3', command, ...args];
  
  if (awsProfile) {
    awsArgs.splice(1, 0, '--profile', awsProfile);
  }

  try {
    const result = await execCommand('', awsArgs, { shell: true });
    return { success: result.exitCode === 0, output: result.stdout };
  } catch (error) {
    return { success: false };
  }
}

/**
 * Compares local Terraform state with the backup in S3 and prompts for synchronization.
 */
export async function compareTfStates(config: TfStateConfig): Promise<void> {
  const { s3TfStateUri, tfStateFilename, awsProfile } = config;
  const tfStateDownloadTempName = `${tfStateFilename}.s3`;

  printInfo(`Checking Terraform state backup in S3: ${s3TfStateUri}...`);

  // Attempt to download the S3 state backup to a temporary file
  const downloadResult = await runAwsS3Command('cp', [s3TfStateUri, tfStateDownloadTempName, '--quiet'], awsProfile);
  
  if (downloadResult.success) {
    printSuccess(`Successfully downloaded S3 state backup to ${tfStateDownloadTempName} for comparison.`);

    const localStateExists = await exists(tfStateFilename);
    
    if (!localStateExists) {
      printWarning(`Local state file ${tfStateFilename} does not exist in ${process.cwd()}.`);
      const confirm = await promptUser('Do you want to use the S3 state backup as your local state? (y/N): ');
      
      if (/^[yY]$/.test(confirm)) {
        const s3Content = await readTextFile(tfStateDownloadTempName);
        await writeTextFile(tfStateFilename, s3Content);
        printSuccess(`Restored S3 state backup to ${tfStateFilename}.`);
      } else {
        printInfo('Proceeding without local state. A new state file may be created by Terraform if it doesn\'t exist.');
      }
    } else {
      // Local state file exists, so compare it with the downloaded S3 version
      const localContent = await readTextFile(tfStateFilename);
      const s3Content = await readTextFile(tfStateDownloadTempName);
      
      if (localContent === s3Content) {
        printSuccess(`Local Terraform state (${tfStateFilename}) and S3 backup are identical.`);
      } else {
        printWarning(`WARNING: Local Terraform state (${tfStateFilename}) and S3 backup (${tfStateDownloadTempName}) have diverged!`);
        printWarning('Differences detected between local state and S3 backup');
        console.log();
        
        const action = await promptUser('Choose an action: (L)oad S3 backup to local, (C)ontinue with local (S3 backup will be overwritten), or (A)bort: ');
        
        switch (action.toLowerCase()) {
          case 'l':
            await writeTextFile(tfStateFilename, s3Content);
            printSuccess(`S3 state backup has been loaded to local ${tfStateFilename}.`);
            printInfo('The S3 backup will be updated with this state if deployment is successful.');
            break;
          case 'c':
            printInfo(`Continuing with local state ${tfStateFilename}.`);
            printInfo('S3 backup will be overwritten with the local state if deployment is successful.');
            break;
          case 'a':
          default:
            printError('Aborting deployment due to state conflict. Please resolve manually.');
            // Clean up the temporary downloaded S3 state file before exiting
            if (await exists(tfStateDownloadTempName)) {
              await execCommand('rm', [tfStateDownloadTempName]);
            }
            process.exit(1);
        }
      }
    }
    
    // Clean up the temporary downloaded S3 state file if it still exists
    if (await exists(tfStateDownloadTempName)) {
      await execCommand('rm', [tfStateDownloadTempName]);
    }
  } else {
    printWarning(`⚠️ Could not download Terraform state backup from ${s3TfStateUri}.`);
    printWarning('    This could be the first deployment for this environment, or the S3 object may not exist yet.');
    
    if (!(await exists(tfStateFilename))) {
      printWarning(`    ➡️ No local state file (${tfStateFilename}) found in ${process.cwd()} either. Terraform will likely create a new state.`);
    } else {
      printWarning(`    ➡️ Proceeding with existing local state file (${tfStateFilename}). This local state will be backed up to S3 if deployment is successful.`);
    }
  }
  
  console.log('----------------------------------------');
}

/**
 * Uploads the local Terraform state file to the S3 backup location.
 */
export async function uploadTfStateBackup(config: TfStateConfig): Promise<boolean> {
  const { s3TfStateUri, tfStateFilename, awsProfile } = config;
  
  if (!(await exists(tfStateFilename))) {
    printError(`ERROR: Local Terraform state file (${tfStateFilename}) not found in ${process.cwd()}. Cannot upload to S3.`);
    return false;
  }

  printInfo(`Uploading local Terraform state (${tfStateFilename}) from ${process.cwd()} to S3 backup: ${s3TfStateUri}`);
  
  const uploadResult = await runAwsS3Command('cp', [tfStateFilename, s3TfStateUri], awsProfile);
  
  if (uploadResult.success) {
    printSuccess(`Successfully uploaded ${tfStateFilename} to ${s3TfStateUri}`);
    return true;
  } else {
    printError(`ERROR: Failed to upload ${tfStateFilename} to ${s3TfStateUri}`);
    return false;
  }
}

/**
 * Main function for standalone execution (for testing purposes)
 */
async function main(): Promise<void> {
  // Setup stdin for interactive mode
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  try {
    const s3TfStateUri = process.env.S3_TFSTATE_URI;
    const tfStateFilename = process.env.TF_STATE_FILENAME || 'terraform.tfstate';
    const awsProfile = process.env.AWS_PROFILE;

    if (!s3TfStateUri) {
      printError('S3_TFSTATE_URI environment variable is required');
      process.exit(1);
    }

    const config: TfStateConfig = {
      s3TfStateUri,
      tfStateFilename,
      awsProfile
    };

    const action = process.argv[2];
    
    switch (action) {
      case 'compare':
        await compareTfStates(config);
        break;
      case 'upload':
        const success = await uploadTfStateBackup(config);
        process.exit(success ? 0 : 1);
        break;
      default:
        printError('Usage: tsx scripts/deploy/manage-tfstate.ts [compare|upload]');
        printInfo('Environment variables required:');
        printInfo('  S3_TFSTATE_URI: S3 URI for the state file');
        printInfo('  TF_STATE_FILENAME: Local state filename (default: terraform.tfstate)');
        printInfo('  AWS_PROFILE: (Optional) AWS profile to use');
        process.exit(1);
    }
  } catch (error) {
    printError(`Terraform state management failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nTerraform state management cancelled...');
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
});

// Only run main if this script is executed directly
if (require.main === module) {
  main();
} 