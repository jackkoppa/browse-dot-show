#!/usr/bin/env node

import { execSync } from 'child_process';
import { discoverSites, getSiteById } from '../../sites/dist/index.js';

// Parse command line arguments
const args = process.argv.slice(2);
const target = args[0];

if (!target) {
  console.error('❌ Error: Please specify either "all" or a specific site ID');
  console.error('Usage:');
  console.error('  node build-all-sites.js all      # builds all sites');
  console.error('  node build-all-sites.js hardfork # builds only hardfork');
  process.exit(1);
}

// Function to build a single site
function buildSite(siteConfig) {
  console.log(`\n🏗️  Building site: ${siteConfig.id} (${siteConfig.appHeader.primaryTitle})`);
  
  try {
    // Set environment variables for the build
    const buildEnv = {
      ...process.env,
      SITE_ID: siteConfig.id,
      BUILD_OUT_DIR: `dist-${siteConfig.id}`
    };
    
    // Build the site with Vite (all logic handled in vite.config.ts)
    const buildCommand = `npx vite build --config vite.config.ts`;
    
    console.log(`   Running: ${buildCommand}`);
    execSync(buildCommand, {
      env: buildEnv,
      stdio: 'inherit'
    });
    
    console.log(`   ✅ Successfully built ${siteConfig.id} to dist-${siteConfig.id}/`);
    
  } catch (error) {
    console.error(`   ❌ Failed to build ${siteConfig.id}:`, error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    let sitesToBuild = [];
    
    if (target === 'all') {
      // Build all sites
      sitesToBuild = discoverSites();
      
      if (sitesToBuild.length === 0) {
        console.log('❌ No sites found to build');
        process.exit(1);
      }
      
      console.log(`🚀 Building all ${sitesToBuild.length} sites:`);
      sitesToBuild.forEach(site => {
        console.log(`   - ${site.id} (${site.shortTitle})`);
      });
      
    } else {
      // Build specific site
      const siteConfig = getSiteById(target);
      
      if (!siteConfig) {
        console.error(`❌ Error: Site '${target}' not found`);
        const availableSites = discoverSites();
        if (availableSites.length > 0) {
          console.error('Available sites:');
          availableSites.forEach(site => {
            console.error(`   - ${site.id}`);
          });
        }
        process.exit(1);
      }
      
      sitesToBuild = [siteConfig];
      console.log(`🚀 Building site: ${target}`);
    }
    
    // Build each site sequentially to avoid resource conflicts
    for (const site of sitesToBuild) {
      buildSite(site);
    }
    
    console.log('\n🎉 Build completed successfully!');
    
    // Print summary
    console.log('\n📦 Build Summary:');
    sitesToBuild.forEach(site => {
      console.log(`   ✅ ${site.id} -> packages/client/dist-${site.id}/`);
    });
    
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run the build
main(); 