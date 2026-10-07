#!/usr/bin/env tsx

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ShellExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: 'inherit' | 'pipe' | 'ignore';
  shell?: boolean;
  timeout?: number;
  silent?: boolean;
}

export interface ShellExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a shell command and return the result
 */
export async function execCommand(
  command: string,
  args: string[] = [],
  options: ShellExecOptions = {}
): Promise<ShellExecResult> {
  const {
    cwd = process.cwd(),
    env = process.env,
    timeout = 30000,
    silent = false
  } = options;

  if (!silent) {
    console.log(`🔧 Executing: ${command} ${args.join(' ')}`);
  }

  try {
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    const { stdout, stderr } = await execAsync(fullCommand, {
      cwd,
      env,
      timeout
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0
    };
  } catch (error: any) {
    const exitCode = error.code || 1;
    const stderr = error.stderr || error.message || '';
    const stdout = error.stdout || '';

    if (!silent) {
      console.error(`❌ Command failed with exit code ${exitCode}`);
      if (stderr) console.error(`   stderr: ${stderr}`);
    }

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode
    };
  }
}

/**
 * Execute a command with live output streaming (like spawn with stdio: 'inherit')
 */
export async function execCommandLive(
  command: string,
  args: string[] = [],
  options: ShellExecOptions = {}
): Promise<number> {
  const {
    cwd = process.cwd(),
    env = process.env,
    shell = true,
    silent = false
  } = options;

  if (!silent) {
    console.log(`🔧 Executing: ${command} ${args.join(' ')}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell,
      stdio: 'inherit'
    });

    child.on('close', (code: number | null) => {
      resolve(code || 0);
    });

    child.on('error', (error: Error) => {
      if (!silent) {
        console.error('❌ Command execution error:', error.message);
      }
      reject(error);
    });
  });
}

/**
 * Check if a command exists in the system
 */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const result = await execCommand(`which ${command}`, [], { silent: true });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Execute a command and throw an error if it fails
 */
export async function execCommandOrThrow(
  command: string,
  args: string[] = [],
  options: ShellExecOptions = {}
): Promise<ShellExecResult> {
  const result = await execCommand(command, args, options);
  
  if (result.exitCode !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}\nExit code: ${result.exitCode}\nStderr: ${result.stderr}`);
  }
  
  return result;
}

/**
 * Execute a command with live output and throw an error if it fails
 */
export async function execCommandLiveOrThrow(
  command: string,
  args: string[] = [],
  options: ShellExecOptions = {}
): Promise<void> {
  const exitCode = await execCommandLive(command, args, options);
  
  if (exitCode !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}\nExit code: ${exitCode}`);
  }
} 