#!/usr/bin/env tsx

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const S3_BUCKET = 'listen-fair-play-s3-dev';
const LOCAL_TARGET_DIR = '/Users/jackkoppa/Documents/TEMP-browse-dot-show-previous-S3-retrieved-files/2025-06-25';

async function checkAWSAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    const stsCmd = spawn('aws', ['sts', 'get-caller-identity'], { stdio: 'pipe' });
    stsCmd.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

async function downloadS3Bucket(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting S3 bucket download...');
    console.log(`📁 Source: s3://${S3_BUCKET}`);
    console.log(`📂 Destination: ${LOCAL_TARGET_DIR}`);
    console.log('');
    
    // Ensure target directory exists
    if (!fs.existsSync(LOCAL_TARGET_DIR)) {
      console.log('📁 Creating target directory...');
      fs.mkdirSync(LOCAL_TARGET_DIR, { recursive: true });
    }
    
    // AWS S3 sync command with options for large files and resume capability
    const args = [
      's3', 'sync',
      `s3://${S3_BUCKET}`,
      LOCAL_TARGET_DIR,
      '--no-progress',  // We'll handle our own progress display
      '--cli-read-timeout', '0',  // No read timeout for large files
      '--cli-connect-timeout', '60',  // 60 second connect timeout
      '--exclude', '.DS_Store',  // Exclude system files
      '--exclude', 'Thumbs.db',  // Exclude Windows thumbnails
    ];
    
    console.log(`🔄 Running: aws ${args.join(' ')}`);
    console.log('⏳ This may take a while for 20-30 GB of data...');
    console.log('💡 You can safely interrupt (Ctrl+C) and restart - AWS CLI will resume where it left off');
    console.log('');
    
    const syncCmd = spawn('aws', args, { 
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env 
    });
    
    let totalFiles = 0;
    let totalBytes = 0;
    
    syncCmd.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          if (line.includes('download:')) {
            totalFiles++;
            // Extract file size if available in the output
            const sizeMatch = line.match(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)/);
            if (sizeMatch) {
              const size = parseFloat(sizeMatch[1]);
              const unit = sizeMatch[2];
              let bytes = size;
              if (unit === 'KB') bytes *= 1024;
              else if (unit === 'MB') bytes *= 1024 * 1024;
              else if (unit === 'GB') bytes *= 1024 * 1024 * 1024;
              totalBytes += bytes;
            }
            
            // Show progress every 10 files
            if (totalFiles % 10 === 0) {
              const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
              console.log(`📥 Downloaded ${totalFiles} files (${totalMB} MB so far)...`);
            }
            
            // Show individual large file downloads
            if (line.includes('MB') || line.includes('GB')) {
              const fileName = line.split(' ').pop() || 'unknown';
              const fileNameShort = fileName.length > 50 ? '...' + fileName.slice(-47) : fileName;
              console.log(`   📄 ${fileNameShort}`);
            }
          }
        }
      }
    });
    
    syncCmd.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      // Only show actual errors, not warnings
      if (errorOutput.includes('error') || errorOutput.includes('Error')) {
        console.error(`❌ Error: ${errorOutput.trim()}`);
      }
    });
    
    syncCmd.on('close', (code) => {
      console.log('');
      if (code === 0) {
        const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
        const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
        console.log('✅ Download completed successfully!');
        console.log(`📊 Final stats: ${totalFiles} files, ${totalMB} MB (${totalGB} GB)`);
        console.log(`📂 Files saved to: ${LOCAL_TARGET_DIR}`);
        resolve();
      } else {
        console.error(`❌ Download failed with exit code: ${code}`);
        console.error('💡 You can re-run this script to resume the download');
        reject(new Error(`AWS CLI exited with code ${code}`));
      }
    });
  });
}

async function main() {
  try {
    console.log('🌐 TEMP S3 Bucket Download Script');
    console.log('==================================');
    console.log('');
    
    // Check AWS authentication
    console.log('🔐 Checking AWS authentication...');
    const isAuthenticated = await checkAWSAuth();
    
    if (!isAuthenticated) {
      console.error('❌ AWS authentication failed.');
      console.error('   Please ensure you are logged in:');
      console.error('   aws sso login');
      console.error('   or configure your AWS credentials');
      process.exit(1);
    }
    
    console.log('✅ AWS authentication verified');
    console.log('');
    
    await downloadS3Bucket();
    
  } catch (error) {
    console.error('\n❌ Error during download:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Download interrupted by user');
  console.log('💡 You can re-run this script to resume where it left off');
  process.exit(0);
});

main().catch(console.error); 