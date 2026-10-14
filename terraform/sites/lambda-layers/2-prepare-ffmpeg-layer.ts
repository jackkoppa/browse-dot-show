#!/usr/bin/env tsx

/**
 * Script to prepare FFmpeg Lambda Layer from downloaded static binaries
 * Takes ffmpeg-release-arm64-static.tar.xz and creates ffmpeg-layer.zip
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execCommandOrThrow, execCommand } from '../../../scripts/lib/shell-exec.js';
import { exists, removeDir, ensureDir } from '../../../scripts/lib/file-operations.js';
import { printInfo, printError, printSuccess, logHeader } from '../../../scripts/lib/logging.js';

// Get the current script directory (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPT_DIR = __dirname;
const TAR_FILE = join(SCRIPT_DIR, 'ffmpeg-release-arm64-static.tar.xz');
const LAYER_DIR = join(SCRIPT_DIR, 'ffmpeg-layer');
const OUTPUT_ZIP = join(SCRIPT_DIR, 'ffmpeg-layer.zip');

async function checkTarFile(): Promise<void> {
  if (!(await exists(TAR_FILE))) {
    printError(`❌ Error: ${TAR_FILE} not found!`);
    console.log();
    printError('Please download the file from:');
    printError('https://johnvansickle.com/ffmpeg/ - ffmpeg-release-arm64-static.tar.xz');
    console.log();
    printError(`Save it as: ${TAR_FILE}`);
    process.exit(1);
  }
}

async function cleanupExistingFiles(): Promise<void> {
  // Clean up any existing layer directory
  if (await exists(LAYER_DIR)) {
    printInfo('🧹 Cleaning up existing layer directory...');
    await removeDir(LAYER_DIR);
  }

  // Remove existing zip file
  if (await exists(OUTPUT_ZIP)) {
    printInfo('🧹 Removing existing zip file...');
    await execCommand('rm', ['-f', OUTPUT_ZIP]);
  }
}

async function createLayerStructure(): Promise<void> {
  // Create layer directory structure
  printInfo('📁 Creating layer directory structure...');
  await ensureDir(join(LAYER_DIR, 'bin'));
}

async function extractTarFile(): Promise<void> {
  // Extract the tar file
  printInfo('📦 Extracting ffmpeg binaries...');
  await execCommandOrThrow('tar', [
    '-xf', TAR_FILE,
    '--strip-components=1',
    '-C', LAYER_DIR
  ]);
}

async function moveBindaries(): Promise<void> {
  // Move binaries to the bin directory (Lambda layer convention)
  printInfo('🔧 Moving binaries to bin/ directory...');
  
  const ffmpegSrc = join(LAYER_DIR, 'ffmpeg');
  const ffprobeSrc = join(LAYER_DIR, 'ffprobe');
  const binDir = join(LAYER_DIR, 'bin');
  
  if (await exists(ffmpegSrc)) {
    await execCommandOrThrow('mv', [ffmpegSrc, join(binDir, 'ffmpeg')]);
  }
  
  if (await exists(ffprobeSrc)) {
    await execCommandOrThrow('mv', [ffprobeSrc, join(binDir, 'ffprobe')]);
  }
}

async function removeUnnecessaryFiles(): Promise<void> {
  // Optional: Keep only essential files to reduce layer size
  printInfo('🗑️  Removing unnecessary files to reduce layer size...');
  
  const filesToRemove = [
    join(LAYER_DIR, 'manpages'),
    join(LAYER_DIR, 'qt-faststart'),
    join(LAYER_DIR, 'readme.txt'),
    join(LAYER_DIR, 'GPLv3.txt')
  ];

  for (const file of filesToRemove) {
    if (await exists(file)) {
      const isDir = (await import('fs')).statSync(file).isDirectory();
      if (isDir) {
        await removeDir(file);
      } else {
        await execCommand('rm', ['-f', file]);
      }
    }
  }
}

async function createZipFile(): Promise<void> {
  // Create the zip file
  printInfo('🗜️  Creating Lambda layer zip file...');
  
  // Zip from inside the layer folder, so the zip has bin/ffmpeg and bin/ffprobe at its root.
  // (execCommand joins its arguments into one shell command, so `bash -c 'cd … && zip …'`
  // ran zip in the wrong folder.)
  await execCommandOrThrow('zip', ['-r', '-q', OUTPUT_ZIP, '.'], { cwd: LAYER_DIR, timeout: 5 * 60 * 1000 });
}

async function cleanupTemporaryFiles(): Promise<void> {
  // Clean up the temporary directory
  printInfo('🧹 Cleaning up temporary files...');
  await removeDir(LAYER_DIR);
}

async function verifyOutput(): Promise<void> {
  // Verify the zip file was created and show size
  if (await exists(OUTPUT_ZIP)) {
    const stats = await import('fs').then(fs => fs.promises.stat(OUTPUT_ZIP));
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log();
    printSuccess('✅ FFmpeg Lambda Layer created successfully!');
    printInfo(`📁 File: ${OUTPUT_ZIP}`);
    printInfo(`📏 Size: ${fileSizeInMB} MB`);
    console.log();
    printSuccess('🚀 Ready for deployment with Terraform!');
  } else {
    printError('❌ Error: Failed to create zip file');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    logHeader('FFmpeg Lambda Layer Preparation');

    printInfo('🎬 Preparing FFmpeg Lambda Layer...');

    // Check if the tar file exists
    await checkTarFile();

    // Clean up existing files
    await cleanupExistingFiles();

    // Create layer directory structure
    await createLayerStructure();

    // Extract the tar file
    await extractTarFile();

    // Move binaries to the bin directory
    await moveBindaries();

    // Remove unnecessary files
    await removeUnnecessaryFiles();

    // Create the zip file
    await createZipFile();

    // Clean up temporary files
    await cleanupTemporaryFiles();

    // Verify output
    await verifyOutput();

  } catch (error) {
    printError(`FFmpeg layer preparation failed: ${error instanceof Error ? error.message : String(error)}`);
    
    // Clean up on error
    if (await exists(LAYER_DIR)) {
      await removeDir(LAYER_DIR);
    }
    
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nFFmpeg layer preparation cancelled...');
  process.exit(0);
});

main(); 