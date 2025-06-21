#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { discoverSites, loadSiteEnvVars, Site } from './utils/site-selector.js';

interface SiteProcessingResult {
    siteId: string;
    siteTitle: string;
    rssRetrievalSuccess: boolean;
    rssRetrievalDuration: number;
    audioProcessingSuccess: boolean;
    audioProcessingDuration: number;
    newAudioFilesDownloaded: number;
    newEpisodesTranscribed: number;
    errors: string[];
}

/**
 * Runs a command with site context and captures output to extract metrics
 */
async function runCommandWithSiteContext(
    siteId: string,
    command: string,
    args: string[],
    operation: string
): Promise<{ success: boolean; duration: number; error?: string; newAudioFiles?: number; newTranscripts?: number }> {
    const startTime = Date.now();
    
    console.log(`\n🚀 Running ${operation} for site: ${siteId}`);
    console.log(`   Command: ${command} ${args.join(' ')}`);
    
    return new Promise((resolve) => {
        try {
            // Load site-specific environment variables
            const siteEnvVars = loadSiteEnvVars(siteId, 'local');
            
            // Merge with current environment, giving priority to site-specific vars
            const envVars = {
                ...process.env,
                ...siteEnvVars,
                SELECTED_SITE_ID: siteId,
                CURRENT_SITE_ID: siteId
            };

            let stdout = '';
            let stderr = '';

            const child = spawn(command, args, {
                stdio: ['inherit', 'pipe', 'pipe'],
                shell: true,
                env: envVars,
                cwd: process.cwd()
            });

            // Capture stdout and stderr while also displaying them
            child.stdout?.on('data', (data: Buffer) => {
                const output = data.toString();
                stdout += output;
                process.stdout.write(output);
            });

            child.stderr?.on('data', (data: Buffer) => {
                const output = data.toString();
                stderr += output;
                process.stderr.write(output);
            });

            child.on('close', (code: number | null) => {
                const duration = Date.now() - startTime;
                const success = code === 0;
                
                // Parse metrics from output
                let newAudioFiles = 0;
                let newTranscripts = 0;

                if (success) {
                    // Extract metrics from RSS retrieval output
                    const audioFilesMatch = stdout.match(/🎧 New Audio Files Downloaded: (\d+)/);
                    if (audioFilesMatch) {
                        newAudioFiles = parseInt(audioFilesMatch[1], 10);
                    }

                    // Extract metrics from audio processing output
                    const transcriptsMatch = stdout.match(/✅ Successfully transcribed (\d+) audio files?/);
                    if (transcriptsMatch) {
                        newTranscripts = parseInt(transcriptsMatch[1], 10);
                    }

                    console.log(`   ✅ ${operation} completed successfully for ${siteId} (${(duration / 1000).toFixed(1)}s)`);
                } else {
                    console.log(`   ❌ ${operation} failed for ${siteId} with exit code ${code} (${(duration / 1000).toFixed(1)}s)`);
                }
                
                resolve({
                    success,
                    duration,
                    error: success ? undefined : `Exit code: ${code}`,
                    newAudioFiles,
                    newTranscripts
                });
            });

            child.on('error', (error: Error) => {
                const duration = Date.now() - startTime;
                console.log(`   ❌ ${operation} failed for ${siteId} with error: ${error.message} (${(duration / 1000).toFixed(1)}s)`);
                
                resolve({
                    success: false,
                    duration,
                    error: error.message,
                    newAudioFiles: 0,
                    newTranscripts: 0
                });
            });

        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.log(`   ❌ ${operation} failed for ${siteId} with error: ${error.message} (${(duration / 1000).toFixed(1)}s)`);
            
            resolve({
                success: false,
                duration,
                error: error.message,
                newAudioFiles: 0,
                newTranscripts: 0
            });
        }
    });
}

/**
 * Main function that processes all sites
 */
async function main(): Promise<void> {
    console.log('🌐 Combined RSS Retrieval and Audio Processing for All Sites');
    console.log('='.repeat(60));
    
    // Discover all available sites
    const sites = discoverSites();
    
    if (sites.length === 0) {
        console.error('❌ No sites found! Please create a site in /sites/my-sites/ or /sites/origin-sites/');
        process.exit(1);
    }
    
    console.log(`\n📍 Found ${sites.length} site(s):`);
    sites.forEach((site: Site) => {
        console.log(`   - ${site.id} (${site.title})`);
    });
    
    const results: SiteProcessingResult[] = [];
    const overallStartTime = Date.now();
    
    // Phase 1: RSS Retrieval for all sites
    console.log('\n' + '='.repeat(60));
    console.log('📡 Phase 1: RSS Retrieval for all sites');
    console.log('='.repeat(60));
    
    for (const site of sites) {
        const rssResult = await runCommandWithSiteContext(
            site.id,
            'pnpm',
            ['--filter', '@browse-dot-show/rss-retrieval-lambda', 'run', 'run:local'],
            'RSS retrieval'
        );
        
        results.push({
            siteId: site.id,
            siteTitle: site.title,
            rssRetrievalSuccess: rssResult.success,
            rssRetrievalDuration: rssResult.duration,
            audioProcessingSuccess: false,
            audioProcessingDuration: 0,
            newAudioFilesDownloaded: rssResult.newAudioFiles || 0,
            newEpisodesTranscribed: 0,
            errors: rssResult.error ? [rssResult.error] : []
        });
    }
    
    // Phase 2: Audio Processing for all sites
    console.log('\n' + '='.repeat(60));
    console.log('🎵 Phase 2: Audio Processing for all sites');
    console.log('='.repeat(60));
    
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        const audioResult = await runCommandWithSiteContext(
            site.id,
            'pnpm',
            ['--filter', '@browse-dot-show/process-audio-lambda', 'run', 'run:local'],
            'Audio processing'
        );
        
        // Update the existing result
        results[i].audioProcessingSuccess = audioResult.success;
        results[i].audioProcessingDuration = audioResult.duration;
        results[i].newEpisodesTranscribed = audioResult.newTranscripts || 0;
        if (audioResult.error) {
            results[i].errors.push(audioResult.error);
        }
    }
    
    // Generate final summary
    const overallDuration = Date.now() - overallStartTime;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Final Summary');
    console.log('='.repeat(60));
    
    console.log(`\n⏱️  Overall Duration: ${(overallDuration / 1000).toFixed(1)}s (${(overallDuration / 1000 / 60).toFixed(1)} minutes)`);
    
    console.log('\n📈 Per-Site Results:');
    results.forEach(result => {
        const rssStatus = result.rssRetrievalSuccess ? '✅' : '❌';
        const audioStatus = result.audioProcessingSuccess ? '✅' : '❌';
        const totalDuration = result.rssRetrievalDuration + result.audioProcessingDuration;
        
        console.log(`\n   ${result.siteId} (${result.siteTitle}):`);
        console.log(`      RSS Retrieval: ${rssStatus} (${(result.rssRetrievalDuration / 1000).toFixed(1)}s)`);
        console.log(`      Audio Processing: ${audioStatus} (${(result.audioProcessingDuration / 1000).toFixed(1)}s)`);
        console.log(`      📥 New Audio Files Downloaded: ${result.newAudioFilesDownloaded}`);
        console.log(`      🎤 Episodes Transcribed: ${result.newEpisodesTranscribed}`);
        console.log(`      Total: ${(totalDuration / 1000).toFixed(1)}s`);
        
        if (result.errors.length > 0) {
            console.log(`      Errors: ${result.errors.join(', ')}`);
        }
    });
    
    // Overall statistics
    const successfulRssCount = results.filter(r => r.rssRetrievalSuccess).length;
    const successfulAudioCount = results.filter(r => r.audioProcessingSuccess).length;
    const totalRssDuration = results.reduce((sum, r) => sum + r.rssRetrievalDuration, 0);
    const totalAudioDuration = results.reduce((sum, r) => sum + r.audioProcessingDuration, 0);
    const totalAudioFilesDownloaded = results.reduce((sum, r) => sum + r.newAudioFilesDownloaded, 0);
    const totalEpisodesTranscribed = results.reduce((sum, r) => sum + r.newEpisodesTranscribed, 0);
    
    console.log('\n📊 Overall Statistics:');
    console.log(`   Sites processed: ${results.length}`);
    console.log(`   RSS Retrieval success rate: ${successfulRssCount}/${results.length} (${((successfulRssCount / results.length) * 100).toFixed(1)}%)`);
    console.log(`   Audio Processing success rate: ${successfulAudioCount}/${results.length} (${((successfulAudioCount / results.length) * 100).toFixed(1)}%)`);
    console.log(`   📥 Total Audio Files Downloaded: ${totalAudioFilesDownloaded}`);
    console.log(`   🎤 Total Episodes Transcribed: ${totalEpisodesTranscribed}`);
    console.log(`   Total RSS Retrieval time: ${(totalRssDuration / 1000).toFixed(1)}s`);
    console.log(`   Total Audio Processing time: ${(totalAudioDuration / 1000).toFixed(1)}s`);
    console.log(`   Average time per site: ${((totalRssDuration + totalAudioDuration) / results.length / 1000).toFixed(1)}s`);
    
    // Exit with appropriate code
    const hasErrors = results.some(r => r.errors.length > 0);
    if (hasErrors) {
        console.log('\n⚠️  Some operations failed. Check the errors above.');
        process.exit(1);
    } else {
        console.log('\n🎉 All operations completed successfully!');
        process.exit(0);
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Operation cancelled by user');
    process.exit(130);
});

main().catch((error) => {
    console.error('\n❌ Unexpected error:', error.message);
    process.exit(1);
}); 