#!/usr/bin/env node

const { selectSite, loadSiteEnvVars } = require('./utils/site-selector.js');
const { spawn } = require('child_process');
const path = require('path');

/**
 * Wrapper script that handles site selection and runs commands with site context
 * Usage: node scripts/run-with-site-selection.js <operation> <command> [args...]
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.error('Usage: node run-with-site-selection.js <operation> <command> [args...]');
        console.error('Example: node run-with-site-selection.js "client development" "pnpm --filter @browse-dot-show/client _vite-dev"');
        process.exit(1);
    }

    const operation = args[0];
    const command = args[1];
    const commandArgs = args.slice(2);

    try {
        // Select site
        console.log(`🌐 Selecting site for ${operation}...`);
        const siteId = await selectSite({ operation });
        
        console.log(`📍 Selected site: ${siteId}`);

        // Load site-specific environment variables
        // For local development, use 'local' instead of 'dev'
        const envType = process.env.NODE_ENV === 'production' ? 'prod' : 'local';
        const siteEnvVars = loadSiteEnvVars(siteId, envType);
        
        // Merge with current environment, giving priority to site-specific vars
        const envVars = {
            ...process.env,
            ...siteEnvVars,
            SELECTED_SITE_ID: siteId,
            CURRENT_SITE_ID: siteId  // Set for site-aware functions in @browse-dot-show/constants
        };

        console.log(`🚀 Running: ${command} ${commandArgs.join(' ')}`);
        console.log(`   With site: ${siteId}`);
        
        // Execute the command with site context
        const child = spawn(command, commandArgs, {
            stdio: 'inherit',
            shell: true,
            env: envVars,
            cwd: process.cwd()
        });

        child.on('close', (code) => {
            process.exit(code);
        });

        child.on('error', (error) => {
            console.error('Error executing command:', error);
            process.exit(1);
        });

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main().catch(console.error); 