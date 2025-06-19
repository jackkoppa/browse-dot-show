#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const fsAccess = promisify(fs.access);
const fsCopyFile = promisify(fs.copyFile);
const fsMkdir = promisify(fs.mkdir);
const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const fsRmdir = promisify(fs.rmdir);
const fsReaddir = promisify(fs.readdir);
const fsStat = promisify(fs.stat);

export interface CopyOptions {
  preserveTimestamps?: boolean;
  overwrite?: boolean;
  createDirectories?: boolean;
}

/**
 * Check if a file or directory exists
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fsAccess(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it and parent directories if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fsMkdir(dirPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Copy a file from source to destination
 */
export async function copyFile(
  src: string,
  dest: string,
  options: CopyOptions = {}
): Promise<void> {
  const { createDirectories = true, overwrite = true } = options;

  // Check if source exists
  if (!(await exists(src))) {
    throw new Error(`Source file does not exist: ${src}`);
  }

  // Check if destination exists and overwrite is false
  if (!overwrite && (await exists(dest))) {
    throw new Error(`Destination file already exists: ${dest}`);
  }

  // Create destination directory if needed
  if (createDirectories) {
    const destDir = path.dirname(dest);
    await ensureDir(destDir);
  }

  await fsCopyFile(src, dest);
}

/**
 * Copy a directory recursively
 */
export async function copyDir(
  src: string,
  dest: string,
  options: CopyOptions = {}
): Promise<void> {
  const { createDirectories = true } = options;

  if (!(await exists(src))) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  const srcStat = await fsStat(src);
  if (!srcStat.isDirectory()) {
    throw new Error(`Source is not a directory: ${src}`);
  }

  if (createDirectories) {
    await ensureDir(dest);
  }

  const entries = await fsReaddir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, options);
    } else {
      await copyFile(srcPath, destPath, options);
    }
  }
}

/**
 * Move a file or directory from source to destination
 */
export async function move(src: string, dest: string): Promise<void> {
  if (!(await exists(src))) {
    throw new Error(`Source does not exist: ${src}`);
  }

  // Create destination directory if needed
  const destDir = path.dirname(dest);
  await ensureDir(destDir);

  // Try rename first (fastest if on same filesystem)
  try {
    await promisify(fs.rename)(src, dest);
    return;
  } catch (error: any) {
    // If rename fails, fall back to copy + delete
    if (error.code === 'EXDEV') {
      const srcStat = await fsStat(src);
      if (srcStat.isDirectory()) {
        await copyDir(src, dest);
        await removeDir(src);
      } else {
        await copyFile(src, dest);
        await promisify(fs.unlink)(src);
      }
    } else {
      throw error;
    }
  }
}

/**
 * Remove a directory recursively
 */
export async function removeDir(dirPath: string): Promise<void> {
  if (!(await exists(dirPath))) {
    return;
  }

  const entries = await fsReaddir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await removeDir(entryPath);
    } else {
      await promisify(fs.unlink)(entryPath);
    }
  }

  await fsRmdir(dirPath);
}

/**
 * Read a JSON file and parse it
 */
export async function readJsonFile<T = any>(filePath: string): Promise<T> {
  const content = await fsReadFile(filePath, 'utf8');
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse JSON file ${filePath}: ${error}`);
  }
}

/**
 * Write an object to a JSON file
 */
export async function writeJsonFile(
  filePath: string,
  data: any,
  options: { spaces?: number; createDirectories?: boolean } = {}
): Promise<void> {
  const { spaces = 2, createDirectories = true } = options;

  if (createDirectories) {
    const dir = path.dirname(filePath);
    await ensureDir(dir);
  }

  const content = JSON.stringify(data, null, spaces);
  await fsWriteFile(filePath, content, 'utf8');
}

/**
 * Read a text file
 */
export async function readTextFile(filePath: string): Promise<string> {
  return await fsReadFile(filePath, 'utf8');
}

/**
 * Write a text file
 */
export async function writeTextFile(
  filePath: string,
  content: string,
  options: { createDirectories?: boolean } = {}
): Promise<void> {
  const { createDirectories = true } = options;

  if (createDirectories) {
    const dir = path.dirname(filePath);
    await ensureDir(dir);
  }

  await fsWriteFile(filePath, content, 'utf8');
}

/**
 * Get file stats
 */
export async function getStats(filePath: string): Promise<fs.Stats> {
  return await fsStat(filePath);
}

/**
 * Check if a path is a directory
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fsStat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path is a file
 */
export async function isFile(filePath: string): Promise<boolean> {
  try {
    const stats = await fsStat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
} 