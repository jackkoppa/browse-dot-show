#!/usr/bin/env tsx

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

function main(): void {
  // Get the current site ID from environment
  const siteId = process.env.SELECTED_SITE_ID || process.env.SITE_ID;
  
  if (!siteId) {
    console.error('❌ SELECTED_SITE_ID or SITE_ID environment variable is required');
    console.error('   This script should be run through the site selection system');
    process.exit(1);
  }

  // Determine the path to serve based on site ID
  const rootDir = path.resolve(__dirname, '..');
  const siteAssetsPath = path.join(rootDir, 'aws-local-dev', 's3', 'sites', siteId);
  const legacyAssetsPath = path.join(rootDir, 'aws-local-dev', 's3');

  let assetsPath: string;
  
  // Check if site-specific directory exists
  if (fs.existsSync(siteAssetsPath)) {
    assetsPath = siteAssetsPath;
    console.log(`📁 Serving site-specific assets for '${siteId}' from: ${assetsPath}`);
  } else {
    // Fall back to legacy structure
    assetsPath = legacyAssetsPath;
    console.log(`📁 Site-specific directory not found, serving legacy assets from: ${assetsPath}`);
    console.log(`   (Expected site directory: ${siteAssetsPath})`);
  }

  // Ensure the directory exists
  if (!fs.existsSync(assetsPath)) {
    console.error(`❌ Assets directory does not exist: ${assetsPath}`);
    console.error('   Please run ingestion commands to populate local assets first');
    process.exit(1);
  }

  // Start http-server for the assets
  console.log(`🚀 Starting asset server on http://localhost:8080 for site: ${siteId}`);
  const server = spawn('npx', ['http-server', assetsPath, '--cors', '--port', '8080'], {
    stdio: 'inherit'
  });

  // Handle server exit
  server.on('close', (code) => {
    if (code !== null && code !== 0) {
      console.error(`❌ Asset server exited with code ${code}`);
      process.exit(code);
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down asset server...');
    server.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down asset server...');
    server.kill('SIGTERM');
  });
}

main(); 