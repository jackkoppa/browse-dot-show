#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const prompts = require('prompts');

// Import site loading utilities
let getSiteById, getAvailableSiteIds;
try {
    const siteUtils = require('../sites/dist/index.js');
    getSiteById = siteUtils.getSiteById;
    getAvailableSiteIds = siteUtils.getAvailableSiteIds;
} catch (error) {
    console.error('❌ Failed to load site utilities. Make sure to build sites package first:');
    console.error('   cd sites && pnpm build');
    process.exit(1);
}

// Directory structure that should exist for each site
const SITE_DIRECTORIES = [
    'audio',
    'transcripts', 
    'search-entries',
    'search-index',
    'episode-manifest',
    'rss',
    'assets'
];

function createSiteDirectories(siteId) {
    const rootDir = path.resolve(__dirname, '..');
    const siteDir = path.join(rootDir, 'aws-local-dev', 's3', 'sites', siteId);
    
    console.log(`📁 Creating directories for site: ${siteId}`);
    console.log(`   Base directory: ${siteDir}`);
    
    // Create the site base directory
    if (!fs.existsSync(siteDir)) {
        fs.mkdirSync(siteDir, { recursive: true });
        console.log(`   ✅ Created base directory: ${siteDir}`);
    } else {
        console.log(`   📁 Base directory already exists: ${siteDir}`);
    }
    
    // Create subdirectories
    let createdCount = 0;
    SITE_DIRECTORIES.forEach(dir => {
        const fullPath = path.join(siteDir, dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            console.log(`   ✅ Created: ${dir}/`);
            createdCount++;
        } else {
            console.log(`   📁 Already exists: ${dir}/`);
        }
    });
    
    if (createdCount > 0) {
        console.log(`   🎉 Created ${createdCount} new directories for site: ${siteId}`);
    } else {
        console.log(`   ℹ️  All directories already exist for site: ${siteId}`);
    }
    
    return siteDir;
}

function checkLegacyData() {
    const rootDir = path.resolve(__dirname, '..');
    const legacyDir = path.join(rootDir, 'aws-local-dev', 's3');
    
    // Check if legacy directories exist with data
    const legacyDirs = [];
    SITE_DIRECTORIES.forEach(dir => {
        const legacyPath = path.join(legacyDir, dir);
        if (fs.existsSync(legacyPath)) {
            const files = fs.readdirSync(legacyPath);
            // Filter out system files and check for actual content
            const contentFiles = files.filter(f => !f.startsWith('.') && f !== 'sites');
            if (contentFiles.length > 0) {
                legacyDirs.push({ name: dir, path: legacyPath, files: contentFiles });
            }
        }
    });
    
    return legacyDirs;
}

async function offerDataMigration(legacyDirs, targetSiteId) {
    if (legacyDirs.length === 0) {
        console.log('ℹ️  No legacy data found to migrate.');
        return;
    }
    
    console.log('\n📋 Found legacy data in the following directories:');
    legacyDirs.forEach(dir => {
        console.log(`   ${dir.name}/ (${dir.files.length} files)`);
    });
    
    const response = await prompts({
        type: 'confirm',
        name: 'migrate',
        message: `Would you like to copy this legacy data to the '${targetSiteId}' site directory?`,
        initial: true
    });
    
    if (!response.migrate) {
        console.log('⏭️  Skipping data migration.');
        return;
    }
    
    // Perform the migration
    const rootDir = path.resolve(__dirname, '..');
    const targetDir = path.join(rootDir, 'aws-local-dev', 's3', 'sites', targetSiteId);
    
    let copiedFiles = 0;
    legacyDirs.forEach(dir => {
        const targetPath = path.join(targetDir, dir.name);
        console.log(`📂 Copying ${dir.name}/ -> sites/${targetSiteId}/${dir.name}/`);
        
        dir.files.forEach(file => {
            const sourcePath = path.join(dir.path, file);
            const destPath = path.join(targetPath, file);
            
            try {
                fs.copyFileSync(sourcePath, destPath);
                console.log(`   ✅ ${file}`);
                copiedFiles++;
            } catch (error) {
                console.log(`   ❌ Failed to copy ${file}: ${error.message}`);
            }
        });
    });
    
    console.log(`🎉 Successfully copied ${copiedFiles} files to site: ${targetSiteId}`);
    
    // Ask about cleaning up legacy data
    const cleanupResponse = await prompts({
        type: 'confirm', 
        name: 'cleanup',
        message: 'Would you like to remove the legacy data (keeping only the site-specific copies)?',
        initial: false
    });
    
    if (cleanupResponse.cleanup) {
        legacyDirs.forEach(dir => {
            dir.files.forEach(file => {
                const filePath = path.join(dir.path, file);
                try {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️  Removed legacy file: ${dir.name}/${file}`);
                } catch (error) {
                    console.log(`   ❌ Failed to remove ${dir.name}/${file}: ${error.message}`);
                }
            });
        });
        console.log('🧹 Legacy data cleanup complete.');
    }
}

async function main() {
    console.log('🏗️  Site Local Directory Setup');
    console.log('================================\n');
    
    const availableSites = getAvailableSiteIds();
    
    if (availableSites.length === 0) {
        console.error('❌ No sites found. Please create sites in sites/my-sites/ or sites/origin-sites/');
        process.exit(1);
    }
    
    // Check for legacy data first
    const legacyDirs = checkLegacyData();
    
    // Site selection
    const siteChoices = availableSites.map(siteId => ({
        title: siteId,
        value: siteId
    }));
    
    // Add option to set up all sites
    siteChoices.unshift({
        title: 'All sites',
        value: '__ALL__'
    });
    
    const siteResponse = await prompts({
        type: 'select',
        name: 'siteSelection',
        message: 'Which site(s) would you like to set up local directories for?',
        choices: siteChoices,
        initial: 0
    });
    
    if (!siteResponse.siteSelection) {
        console.log('Exiting...');
        process.exit(0);
    }
    
    const sitesToSetup = siteResponse.siteSelection === '__ALL__' ? availableSites : [siteResponse.siteSelection];
    
    // Set up directories for selected sites
    console.log(`\n🎯 Setting up directories for ${sitesToSetup.length} site(s)...\n`);
    
    for (const siteId of sitesToSetup) {
        createSiteDirectories(siteId);
        
        // Offer data migration only for the first site if legacy data exists
        if (legacyDirs.length > 0 && sitesToSetup.indexOf(siteId) === 0) {
            await offerDataMigration(legacyDirs, siteId);
        }
        
        console.log(''); // Add spacing between sites
    }
    
    console.log('✅ Site directory setup complete!');
    console.log('\nNext steps:');
    console.log('1. Run ingestion commands to populate site-specific data');
    console.log('2. Use pnpm client:dev to start site-aware development server');
    console.log('3. All local data will now be organized by site ID');
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\nExiting...');
    process.exit(0);
});

main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
}); 