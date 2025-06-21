#!/usr/bin/env tsx

import { spawn } from 'child_process';
import * as path from 'path';

// Import site loading utilities
import { selectSite, loadSiteEnvVars } from './utils/site-selector.js';

/**
 * Wrapper script that handles site selection and runs commands with site context
 * Usage: tsx scripts/run-with-site-selection.ts <operation> <command> [args...]
 */
async function main(): Promise<void> {
    const args: string[] = process.argv.slice(2);
    
    if (args.length < 2) {
        console.error('Usage: tsx run-with-site-selection.ts <operation> <command> [args...]');
        console.error('Example: tsx run-with-site-selection.ts "client development" "pnpm --filter @browse-dot-show/client _vite-dev"');
        process.exit(1);
    }

    const operation: string = args[0];
    const command: string = args[1];
    const commandArgs: string[] = args.slice(2);

    try {
        // Select site
        console.log(`🌐 Selecting site for ${operation}...`);
        const siteId: string = await selectSite({ operation });
        
        console.log(`📍 Selected site: ${siteId}`);

        // Load site-specific environment variables
        // For local development, use 'local' instead of 'dev'
        const envType: string = process.env.NODE_ENV === 'production' ? 'prod' : 'local';
        const siteEnvVars: Record<string, string> = loadSiteEnvVars(siteId, envType);
        
        // Merge with current environment, giving priority to site-specific vars
        const envVars: NodeJS.ProcessEnv = {
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

        child.on('close', (code: number | null) => {
            process.exit(code || 0);
        });

        child.on('error', (error: Error) => {
            console.error('Error executing command:', error);
            process.exit(1);
        });

    } catch (error: any) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main().catch(console.error); 