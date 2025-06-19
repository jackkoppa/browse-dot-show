#!/usr/bin/env tsx

import * as path from 'path';
import { execCommand, execCommandOrThrow, commandExists, ShellExecOptions } from './shell-exec';
import { exists } from './file-operations';
import { logInfo, logError, logWarning, logStep } from './logging';

export interface TerraformOptions extends ShellExecOptions {
  workingDir?: string;
  autoApprove?: boolean;
  varFile?: string;
  backendConfig?: string;
  vars?: Record<string, string>;
}

/**
 * Check if Terraform is installed
 */
export async function checkTerraform(): Promise<boolean> {
  const exists = await commandExists('terraform');
  if (!exists) {
    logError('Terraform is not installed. Please install it first.');
  }
  return exists;
}

/**
 * Execute a Terraform command
 */
export async function terraformCommand(
  command: string,
  args: string[] = [],
  options: TerraformOptions = {}
): Promise<string> {
  if (!(await checkTerraform())) {
    throw new Error('Terraform is not available');
  }

  const { 
    workingDir = process.cwd(),
    autoApprove = false,
    varFile,
    backendConfig,
    vars,
    ...execOptions 
  } = options;

  const terraformArgs = ['terraform', command];

  // Add variable file if specified
  if (varFile) {
    terraformArgs.push('-var-file', varFile);
  }

  // Add backend config if specified
  if (backendConfig) {
    terraformArgs.push('-backend-config', backendConfig);
  }

  // Add individual variables
  if (vars) {
    Object.entries(vars).forEach(([key, value]) => {
      terraformArgs.push('-var', `${key}=${value}`);
    });
  }

  // Add auto-approve for apply/destroy commands
  if (autoApprove && (command === 'apply' || command === 'destroy')) {
    terraformArgs.push('-auto-approve');
  }

  // Add the command-specific arguments
  terraformArgs.push(...args);

  const result = await execCommandOrThrow('', terraformArgs, {
    ...execOptions,
    cwd: workingDir
  });

  return result.stdout;
}

/**
 * Initialize Terraform working directory
 */
export async function terraformInit(
  options: TerraformOptions = {}
): Promise<void> {
  logStep('Initializing Terraform...');
  await terraformCommand('init', [], options);
  logInfo('Terraform initialization completed');
}

/**
 * Validate Terraform configuration
 */
export async function terraformValidate(
  options: TerraformOptions = {}
): Promise<void> {
  logStep('Validating Terraform configuration...');
  await terraformCommand('validate', [], options);
  logInfo('Terraform configuration is valid');
}

/**
 * Plan Terraform changes
 */
export async function terraformPlan(
  outputFile?: string,
  options: TerraformOptions = {}
): Promise<string> {
  logStep('Planning Terraform changes...');
  const args = outputFile ? ['-out', outputFile] : [];
  const result = await terraformCommand('plan', args, options);
  logInfo('Terraform plan completed');
  return result;
}

/**
 * Apply Terraform changes
 */
export async function terraformApply(
  planFile?: string,
  options: TerraformOptions = {}
): Promise<string> {
  logStep('Applying Terraform changes...');
  const args = planFile ? [planFile] : [];
  const result = await terraformCommand('apply', args, {
    ...options,
    autoApprove: options.autoApprove ?? true
  });
  logInfo('Terraform apply completed');
  return result;
}

/**
 * Destroy Terraform infrastructure
 */
export async function terraformDestroy(
  options: TerraformOptions = {}
): Promise<string> {
  logStep('Destroying Terraform infrastructure...');
  const result = await terraformCommand('destroy', [], {
    ...options,
    autoApprove: options.autoApprove ?? true
  });
  logInfo('Terraform destroy completed');
  return result;
}

/**
 * Get Terraform output values
 */
export async function terraformOutput(
  outputName?: string,
  options: TerraformOptions = {}
): Promise<any> {
  const args = ['-json'];
  if (outputName) {
    args.push(outputName);
  }

  const result = await terraformCommand('output', args, {
    ...options,
    silent: true
  });

  try {
    return JSON.parse(result);
  } catch {
    return result; // Return raw output if not JSON
  }
}

/**
 * Show Terraform state
 */
export async function terraformShow(
  options: TerraformOptions = {}
): Promise<any> {
  const result = await terraformCommand('show', ['-json'], {
    ...options,
    silent: true
  });

  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

/**
 * Format Terraform files
 */
export async function terraformFormat(
  check: boolean = false,
  options: TerraformOptions = {}
): Promise<string> {
  const args = check ? ['-check'] : [];
  return await terraformCommand('fmt', args, options);
}

/**
 * Import existing infrastructure into Terraform
 */
export async function terraformImport(
  address: string,
  id: string,
  options: TerraformOptions = {}
): Promise<string> {
  logStep(`Importing ${address} with ID ${id}...`);
  const result = await terraformCommand('import', [address, id], options);
  logInfo(`Successfully imported ${address}`);
  return result;
}

/**
 * Get current Terraform workspace
 */
export async function getCurrentWorkspace(
  options: TerraformOptions = {}
): Promise<string> {
  const result = await terraformCommand('workspace show', [], {
    ...options,
    silent: true
  });
  return result.trim();
}

/**
 * Create or select Terraform workspace
 */
export async function selectWorkspace(
  workspaceName: string,
  options: TerraformOptions = {}
): Promise<void> {
  try {
    // Try to select existing workspace
    await terraformCommand('workspace select', [workspaceName], {
      ...options,
      silent: true
    });
    logInfo(`Selected workspace: ${workspaceName}`);
  } catch {
    // If selection fails, create new workspace
    logStep(`Creating new workspace: ${workspaceName}`);
    await terraformCommand('workspace new', [workspaceName], options);
    logInfo(`Created and selected workspace: ${workspaceName}`);
  }
}

/**
 * Check if Terraform state file exists
 */
export async function stateExists(
  options: TerraformOptions = {}
): Promise<boolean> {
  const { workingDir = process.cwd() } = options;
  const stateFile = path.join(workingDir, 'terraform.tfstate');
  return await exists(stateFile);
}

/**
 * Validate Terraform backend configuration
 */
export async function validateBackend(
  options: TerraformOptions = {}
): Promise<boolean> {
  try {
    await terraformCommand('validate', [], { ...options, silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute a complete Terraform deployment workflow
 */
export async function deployWithTerraform(
  options: TerraformOptions & {
    planFile?: string;
    validateFirst?: boolean;
    initFirst?: boolean;
  } = {}
): Promise<void> {
  const {
    planFile = 'tfplan',
    validateFirst = true,
    initFirst = true,
    ...terraformOptions
  } = options;

  try {
    // Initialize if requested
    if (initFirst) {
      await terraformInit(terraformOptions);
    }

    // Validate if requested
    if (validateFirst) {
      await terraformValidate(terraformOptions);
    }

    // Plan
    await terraformPlan(planFile, terraformOptions);

    // Apply
    await terraformApply(planFile, terraformOptions);

  } catch (error: any) {
    logError('Terraform deployment failed:', error.message);
    throw error;
  }
}

/**
 * Execute a complete Terraform destroy workflow
 */
export async function destroyWithTerraform(
  options: TerraformOptions & {
    validateFirst?: boolean;
    initFirst?: boolean;
  } = {}
): Promise<void> {
  const {
    validateFirst = false,
    initFirst = false,
    ...terraformOptions
  } = options;

  try {
    // Initialize if requested
    if (initFirst) {
      await terraformInit(terraformOptions);
    }

    // Validate if requested
    if (validateFirst) {
      await terraformValidate(terraformOptions);
    }

    // Destroy
    await terraformDestroy(terraformOptions);

  } catch (error: any) {
    logError('Terraform destroy failed:', error.message);
    throw error;
  }
}

/**
 * Get Terraform version
 */
export async function getTerraformVersion(): Promise<string> {
  if (!(await checkTerraform())) {
    throw new Error('Terraform is not available');
  }

  const result = await execCommand('terraform', ['version'], { silent: true });
  const versionMatch = result.stdout.match(/Terraform v(\d+\.\d+\.\d+)/);
  return versionMatch ? versionMatch[1] : 'unknown';
} 