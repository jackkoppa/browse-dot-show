#!/usr/bin/env tsx

/**
 * Git worktree helper script for managing parallel development sessions
 * 
 * Usage:
 *   pnpm bds worktree create <branch-name>  # Create a new worktree
 *   pnpm bds worktree list                  # List all worktrees
 *   pnpm bds worktree remove <branch-name>  # Remove a worktree
 *   pnpm bds worktree link-config [path]    # Symlink gitignored config into a worktree
 *   pnpm bds worktree help                  # Show help message
 */

import { execCommand, execCommandOrThrow } from './lib/shell-exec.js';
import { linkWorktreeConfig, mainWorktreePath } from './lib/worktree-config.js';
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
    
    // Suggest a default path relative to the parent of the repo root
    const repoParent = path.dirname(REPO_ROOT);
    const repoName = path.basename(REPO_ROOT);
    const suggestedPath = path.join(repoParent, `${repoName}--worktrees`);
    
    const response = await prompts({
      type: 'text',
      name: 'directory',
      message: 'Enter the worktree directory path:',
      initial: suggestedPath,
      validate: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'Directory path is required';
        }
        const trimmedValue = value.trim();
        // Check if the path is inside the repo root
        const resolvedPath = path.resolve(trimmedValue);
        if (resolvedPath.startsWith(REPO_ROOT + path.sep) || resolvedPath === REPO_ROOT) {
          return 'Worktree directory must be outside the main repository to avoid nested repos';
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
  
  // Check if branch exists locally or remotely using rev-parse
  const localCheck = await execCommand('git', ['rev-parse', '--verify', branchName], { cwd: REPO_ROOT });
  const remoteCheck = await execCommand('git', ['rev-parse', '--verify', `origin/${branchName}`], { cwd: REPO_ROOT });
  const branchExists = localCheck.exitCode === 0 || remoteCheck.exitCode === 0;
  
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

  await linkConfig(worktreePath);

  console.log(`\n💡 To use this worktree:`);
  console.log(`   cd ${worktreePath}`);
  console.log(`   pnpm install && pnpm all:build`);
}

/** Symlink the main checkout's gitignored config files (.env.*, .local-files-config.json, ...) into a worktree. */
async function linkConfig(worktreePath: string) {
  const mainPath = await mainWorktreePath(REPO_ROOT);
  if (path.resolve(worktreePath) === path.resolve(mainPath)) {
    console.error('❌ That is the main checkout; config files already live there.');
    process.exit(1);
  }
  const { linked, skipped } = await linkWorktreeConfig(mainPath, worktreePath);
  console.log(`🔗 Linked ${linked.length} gitignored config file(s) from ${mainPath}`);
  linked.forEach(file => console.log(`   ${file}`));
  if (skipped.length > 0) console.log(`   (${skipped.length} already present, left as is: ${skipped.join(', ')})`);
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
  let displayNumber = 1;
  lines.forEach((line, index) => {
    const parts = line.split(/\s+/);
    const worktreePath = parts[0];
    const branch = parts[1]?.replace(/\[(.+)\]/, '$1') || 'unknown';
    const isWorktreeDir = worktreePath.startsWith(worktreeDir);
    
    if (isWorktreeDir || index === 0) {
      console.log(`  ${displayNumber}. ${worktreePath}`);
      console.log(`     Branch: ${branch}`);
      console.log('');
      displayNumber++;
    }
  });
}

async function removeWorktree(branchName: string) {
  const worktreeDir = await ensureWorktreeDirectory();
  const worktreePath = path.join(worktreeDir, branchName);
  
  // Check if worktree is registered
  const result = await execCommand('git', ['worktree', 'list'], { cwd: REPO_ROOT });
  const isRegistered = result.stdout.includes(worktreePath);
  
  if (isRegistered) {
    console.log(`🗑️  Removing worktree: ${worktreePath}`);
    
    // Check if directory exists
    if (fs.existsSync(worktreePath)) {
      await execCommandOrThrow('git', ['worktree', 'remove', worktreePath], { cwd: REPO_ROOT });
    } else {
      // Directory was manually deleted, prune the reference
      console.log(`⚠️  Worktree directory was manually deleted. Pruning stale reference...`);
      await execCommandOrThrow('git', ['worktree', 'prune'], { cwd: REPO_ROOT });
    }
    console.log(`✅ Worktree removed successfully`);
  } else if (fs.existsSync(worktreePath)) {
    console.log(`⚠️  Worktree directory exists but is not registered. Removing directory...`);
    fs.rmSync(worktreePath, { recursive: true, force: true });
    console.log(`✅ Directory removed`);
  } else {
    console.error(`❌ Worktree not found at: ${worktreePath}`);
    console.error(`💡 Tip: Run 'git worktree prune' to clean up stale references`);
    process.exit(1);
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
    
    // Handle user cancellation
    if (response.deleteBranch === undefined) {
      console.log('❌ Operation cancelled by user');
      process.exit(1);
    }
    
    if (response.deleteBranch) {
      await execCommandOrThrow('git', ['branch', '-D', branchName], { cwd: REPO_ROOT });
      console.log(`✅ Branch '${branchName}' deleted`);
    }
  }
}

async function pruneWorktrees() {
  console.log('🧹 Pruning stale worktree references...');
  const result = await execCommand('git', ['worktree', 'prune', '-v'], { cwd: REPO_ROOT });
  
  if (result.exitCode !== 0) {
    console.error('❌ Failed to prune worktrees');
    process.exit(1);
  }
  
  if (result.stdout.trim()) {
    console.log(result.stdout);
    console.log('✅ Stale worktree references pruned');
  } else {
    console.log('✅ No stale worktree references found');
  }
}

function showHelp() {
  console.log('Git Worktree Helper - Manage parallel development sessions');
  console.log('');
  console.log('Usage:');
  console.log('  pnpm bds worktree <command> [arguments]');
  console.log('');
  console.log('Commands:');
  console.log('  create <branch-name>   Create a new worktree for a branch');
  console.log('  list                   List all worktrees');
  console.log('  remove <branch-name>   Remove a worktree');
  console.log('  prune                  Clean up stale worktree references');
  console.log('  link-config [path]     Symlink gitignored config into a worktree (default: current directory)');
  console.log('  help                   Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  pnpm bds worktree create feature/my-feature');
  console.log('  pnpm bds worktree list');
  console.log('  pnpm bds worktree remove feature/my-feature');
  console.log('  pnpm bds worktree prune');
  console.log('  pnpm bds worktree link-config ../browse-dot-show--worktrees/feature/my-feature');
  console.log('');
  console.log('Configuration:');
  console.log('  Worktree directory is stored in .local-files-config.json');
  console.log('  You will be prompted to set it on first use');
}

async function main() {
  const command = process.argv[2];
  const branchName = process.argv[3];
  
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    process.exit(command ? 0 : 1);
  }
  
  try {
    switch (command) {
      case 'create':
        if (!branchName) {
          console.error('❌ Branch name is required for create command');
          console.error('Usage: pnpm bds worktree create <branch-name>');
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
          console.error('Usage: pnpm bds worktree remove <branch-name>');
          process.exit(1);
        }
        await removeWorktree(branchName);
        break;
        
      case 'prune':
        await pruneWorktrees();
        break;

      case 'link-config':
        // pnpm runs scripts from the package root; INIT_CWD is where the user ran the command
        await linkConfig(path.resolve(process.env.INIT_CWD ?? process.cwd(), branchName ?? '.'));
        break;
        
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.error('');
        showHelp();
        process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
