#!/usr/bin/env tsx

/**
 * Git worktree helper script for managing parallel development sessions
 * 
 * Usage:
 *   tsx scripts/worktree.ts create <branch-name>  # Create a new worktree
 *   tsx scripts/worktree.ts list                   # List all worktrees
 *   tsx scripts/worktree.ts remove <branch-name>  # Remove a worktree
 */

import { execCommand, execCommandOrThrow } from './utils/shell-exec.js';
import { getWorktreeDirectory, saveWorktreeDirectory } from '@browse-dot-show/config';
import prompts from 'prompts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

async function ensureWorktreeDirectory(): Promise<string> {
  let worktreeDir = await getWorktreeDirectory();
  
  if (!worktreeDir) {
    console.log('⚠️  Worktree directory not configured.');
    const response = await prompts({
      type: 'text',
      name: 'directory',
      message: 'Enter the worktree directory path:',
      initial: '/Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees',
      validate: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'Directory path is required';
        }
        return true;
      }
    });
    
    if (!response.directory) {
      console.error('❌ No directory provided. Exiting.');
      process.exit(1);
    }
    
    worktreeDir = response.directory.trim();
    
    // Ensure directory exists
    if (!fs.existsSync(worktreeDir)) {
      console.log(`📁 Creating directory: ${worktreeDir}`);
      fs.mkdirSync(worktreeDir, { recursive: true });
    }
    
    saveWorktreeDirectory(worktreeDir);
    console.log(`✅ Saved worktree directory: ${worktreeDir}`);
  }
  
  return worktreeDir;
}

async function createWorktree(branchName: string) {
  const worktreeDir = await ensureWorktreeDirectory();
  const worktreePath = path.join(worktreeDir, branchName);
  
  // Check if worktree already exists
  if (fs.existsSync(worktreePath)) {
    console.error(`❌ Worktree already exists at: ${worktreePath}`);
    process.exit(1);
  }
  
  // Check if branch exists locally or remotely
  const branchCheck = await execCommand('git', ['branch', '-a'], { cwd: REPO_ROOT });
  const branchExists = branchCheck.stdout.includes(`remotes/origin/${branchName}`) || 
                       branchCheck.stdout.includes(`  ${branchName}`);
  
  console.log(`🌳 Creating worktree at: ${worktreePath}`);
  
  if (branchExists) {
    // Branch exists, just add worktree
    await execCommandOrThrow('git', ['worktree', 'add', worktreePath, branchName], { cwd: REPO_ROOT });
  } else {
    // Branch doesn't exist, create it with the worktree
    console.log(`🌿 Branch '${branchName}' doesn't exist. Creating new branch...`);
    await execCommandOrThrow('git', ['worktree', 'add', '-b', branchName, worktreePath], { cwd: REPO_ROOT });
    console.log(`✅ Created branch: ${branchName}`);
  }
  
  console.log(`✅ Worktree created successfully!`);
  console.log(`📂 Location: ${worktreePath}`);
  console.log(`\n💡 To use this worktree:`);
  console.log(`   cd ${worktreePath}`);
}

async function listWorktrees() {
  const worktreeDir = await ensureWorktreeDirectory();
  
  console.log(`📋 Listing worktrees in: ${worktreeDir}\n`);
  
  const result = await execCommand('git', ['worktree', 'list'], { cwd: REPO_ROOT });
  
  if (result.exitCode !== 0) {
    console.error('❌ Failed to list worktrees');
    process.exit(1);
  }
  
  const lines = result.stdout.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    console.log('No worktrees found.');
    return;
  }
  
  console.log('Worktrees:');
  lines.forEach((line, index) => {
    const parts = line.split(/\s+/);
    const worktreePath = parts[0];
    const branch = parts[1]?.replace(/\[(.+)\]/, '$1') || 'unknown';
    const isWorktreeDir = worktreePath.startsWith(worktreeDir);
    
    if (isWorktreeDir || index === 0) {
      console.log(`  ${index + 1}. ${worktreePath}`);
      console.log(`     Branch: ${branch}`);
      if (isWorktreeDir) {
        console.log(`     📂 ${worktreePath}`);
      }
      console.log('');
    }
  });
}

async function removeWorktree(branchName: string) {
  const worktreeDir = await ensureWorktreeDirectory();
  const worktreePath = path.join(worktreeDir, branchName);
  
  if (!fs.existsSync(worktreePath)) {
    console.error(`❌ Worktree not found at: ${worktreePath}`);
    process.exit(1);
  }
  
  // Check if worktree is registered
  const result = await execCommand('git', ['worktree', 'list'], { cwd: REPO_ROOT });
  const isRegistered = result.stdout.includes(worktreePath);
  
  if (isRegistered) {
    console.log(`🗑️  Removing worktree: ${worktreePath}`);
    await execCommandOrThrow('git', ['worktree', 'remove', worktreePath], { cwd: REPO_ROOT });
    console.log(`✅ Worktree removed successfully`);
  } else {
    console.log(`⚠️  Worktree directory exists but is not registered. Removing directory...`);
    fs.rmSync(worktreePath, { recursive: true, force: true });
    console.log(`✅ Directory removed`);
  }
  
  // Optionally delete the branch if it exists
  const branchCheck = await execCommand('git', ['branch', '-a'], { cwd: REPO_ROOT });
  const branchExists = branchCheck.stdout.includes(`  ${branchName}`);
  
  if (branchExists) {
    const response = await prompts({
      type: 'confirm',
      name: 'deleteBranch',
      message: `Delete branch '${branchName}'?`,
      initial: false
    });
    
    if (response.deleteBranch) {
      await execCommandOrThrow('git', ['branch', '-D', branchName], { cwd: REPO_ROOT });
      console.log(`✅ Branch '${branchName}' deleted`);
    }
  }
}

async function main() {
  const command = process.argv[2];
  const branchName = process.argv[3];
  
  if (!command) {
    console.error('Usage:');
    console.error('  tsx scripts/worktree.ts create <branch-name>  # Create a new worktree');
    console.error('  tsx scripts/worktree.ts list                   # List all worktrees');
    console.error('  tsx scripts/worktree.ts remove <branch-name>   # Remove a worktree');
    process.exit(1);
  }
  
  try {
    switch (command) {
      case 'create':
        if (!branchName) {
          console.error('❌ Branch name is required for create command');
          process.exit(1);
        }
        await createWorktree(branchName);
        break;
        
      case 'list':
        await listWorktrees();
        break;
        
      case 'remove':
        if (!branchName) {
          console.error('❌ Branch name is required for remove command');
          process.exit(1);
        }
        await removeWorktree(branchName);
        break;
        
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.error('Available commands: create, list, remove');
        process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
