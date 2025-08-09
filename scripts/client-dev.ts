#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';

// Import site loading utilities
import { selectSite, loadSiteEnvVars } from './utils/site-selector.js';

const execAsync = promisify(exec);

/**
 * Opens a URL in the user's default browser
 */
async function openInBrowser(url: string): Promise<void> {
    try {
        const platform = process.platform;
        let command: string;
        
        switch (platform) {
            case 'darwin': // macOS
                command = `open "${url}"`;
                break;
            case 'win32': // Windows
                command = `start "" "${url}"`;
                break;
            default: // Linux and others
                command = `xdg-open "${url}"`;
                break;
        }
        
        await execAsync(command);
        console.log(`🌐 Opened ${url} in browser`);
    } catch (error) {
        console.error('Failed to open browser:', error);
    }
}

/**
 * Monitors process output for localhost URL and opens it in browser
 */
function monitorForLocalhost(child: any): void {
    let urlOpened = false;
    
    if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
            const output = data.toString();
            
            // Look for localhost URL pattern in Vite output
            const localhostMatch = output.match(/Local:\s+(http:\/\/localhost:\d+\/)/);
            
            if (localhostMatch && !urlOpened) {
                const url = localhostMatch[1];
                urlOpened = true;
                
                // Open the URL in browser after a short delay to ensure all processes are started
                setTimeout(() => {
                    openInBrowser(url);
                }, 2000);
            }
        });
    }
}

/**
 * Main function to run client development with site selection
 */
async function main(): Promise<void> {
    try {
        // Parse command line arguments for --site parameter
        const args: string[] = process.argv.slice(2);
        let preselectedSiteId: string | undefined;
        
        const siteArgIndex = args.findIndex(arg => arg.startsWith('--site='));
        if (siteArgIndex >= 0) {
            const siteArg = args[siteArgIndex];
            preselectedSiteId = siteArg.split('=')[1];
            
            if (!preselectedSiteId) {
                console.error('Error: --site= parameter requires a site ID (e.g., --site=claretandblue)');
                process.exit(1);
            }
        }

        // Select site
        if (preselectedSiteId) {
            console.log(`🌐 Using preselected site for client development: ${preselectedSiteId}`);
        } else {
            console.log('🌐 Selecting site for client development...');
        }
        
        const siteId: string = await selectSite({ 
            operation: 'client development',
            defaultSiteId: preselectedSiteId,
            skipPrompt: !!preselectedSiteId
        });
        
        console.log(`📍 Selected site: ${siteId}`);

        // Load site-specific environment variables
        const envType: string = 'local';
        const siteEnvVars: Record<string, string> = loadSiteEnvVars(siteId, envType);
        
        // Merge with current environment, giving priority to site-specific vars
        const envVars: NodeJS.ProcessEnv = {
            ...process.env,
            ...siteEnvVars,
            SITE_ID: siteId,
            NODE_OPTIONS: '--max-old-space-size=9728'
        };

        console.log('🚀 Starting client development environment...');
        console.log(`   With site: ${siteId}`);
        
        // The complex command that was in package.json
        const command = 'concurrently';
        const commandArgs = [
            '"pnpm --filter @browse-dot-show/client _vite-dev"',
            '"pnpm --filter @browse-dot-show/client _serve-s3-assets"',
            '"pnpm --filter @browse-dot-show/search-lambda dev:local"'
        ];

        // Execute the command with site context
        const child = spawn(command, commandArgs, {
            stdio: 'pipe', // Use pipe instead of inherit so we can monitor output
            shell: true,
            env: envVars,
            cwd: process.cwd()
        });

        // Setup browser monitoring
        monitorForLocalhost(child);
        
        // Forward output to console while monitoring
        if (child.stdout) {
            child.stdout.pipe(process.stdout);
        }
        if (child.stderr) {
            child.stderr.pipe(process.stderr);
        }

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
