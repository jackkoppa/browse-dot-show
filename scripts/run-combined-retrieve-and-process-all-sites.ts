#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { discoverSites, loadSiteEnvVars, Site } from './utils/site-selector.js';
import { getSearchIndexKey } from '@browse-dot-show/constants';
import { fileExists, getFile } from '@browse-dot-show/s3';
import * as fs from 'fs/promises';
import * as path from 'path';

interface SiteProcessingResult {
    siteId: string;
    siteTitle: string;
    rssRetrievalSuccess: boolean;
    rssRetrievalDuration: number;
    audioProcessingSuccess: boolean;
    audioProcessingDuration: number;
    srtIndexingSuccess: boolean;
    srtIndexingDuration: number;
    newAudioFilesDownloaded: number;
    newEpisodesTranscribed: number;
    newSearchEntriesAdded: number;
    searchIndexFileSizeBytes: number;
    errors: string[];
}

/**
 * Get the size of a file in S3 or local storage
 */
async function getFileSize(key: string): Promise<number> {
    try {
        const fileStorageEnv = process.env.FILE_STORAGE_ENV || 'prod-s3';
        
        if (fileStorageEnv === 'local') {
            // For local files, use fs.stat
            const siteId = process.env.SITE_ID;
            const localS3Path = path.join(process.cwd(), 'aws-local-dev/s3');
            let localPath: string;
            
            if (siteId && !key.startsWith('sites/')) {
                localPath = path.join(localS3Path, 'sites', siteId, key);
            } else {
                localPath = path.join(localS3Path, key);
            }
            
            const stats = await fs.stat(localPath);
            return stats.size;
        } else {
            // For S3, we need to use headObject
            const AWS = await import('@aws-sdk/client-s3');
            const s3 = new AWS.S3({
                region: process.env.AWS_REGION || 'us-east-1',
            });
            
            const siteId = process.env.SITE_ID;
            const bucketName = siteId ? `${siteId}-browse-dot-show` : 'listen-fair-play-s3-prod';
            
            const response = await s3.headObject({
                Bucket: bucketName,
                Key: key,
            });
            
            return response.ContentLength || 0;
        }
    } catch (error) {
        console.warn(`Could not get file size for ${key}:`, error);
        return 0;
    }
}

/**
 * Runs a command with site context and captures output to extract metrics
 */
async function runCommandWithSiteContext(
    siteId: string,
    command: string,
    args: string[],
    operation: string
): Promise<{ success: boolean; duration: number; error?: string; newAudioFiles?: number; newTranscripts?: number; newSearchEntries?: number }> {
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
                SITE_ID: siteId
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
                let newSearchEntries = 0;

                if (success) {
                    // Extract metrics from RSS retrieval output
                    const audioFilesMatch = stdout.match(/🎧 New Audio Files Downloaded: (\d+)/);
                    if (audioFilesMatch) {
                        newAudioFiles = parseInt(audioFilesMatch[1], 10);
                    }

                    // Extract metrics from audio processing output
                    const transcriptsMatch = stdout.match(/✅ Successfully Processed: (\d+)/);
                    if (transcriptsMatch) {
                        newTranscripts = parseInt(transcriptsMatch[1], 10);
                    }

                    // Extract metrics from SRT indexing output
                    const searchEntriesMatch = stdout.match(/📝 New Search Entries Added: (\d+)/);
                    if (searchEntriesMatch) {
                        newSearchEntries = parseInt(searchEntriesMatch[1], 10);
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
                    newTranscripts,
                    newSearchEntries
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
                    newTranscripts: 0,
                    newSearchEntries: 0
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
                newTranscripts: 0,
                newSearchEntries: 0
            });
        }
    });
}

/**
 * Main function that processes all sites
 */
async function main(): Promise<void> {
    console.log('🌐 All Ingestion Lambdas for All Sites');
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
            srtIndexingSuccess: false,
            srtIndexingDuration: 0,
            newAudioFilesDownloaded: rssResult.newAudioFiles || 0,
            newEpisodesTranscribed: 0,
            newSearchEntriesAdded: 0,
            searchIndexFileSizeBytes: 0,
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
    
    // Phase 3: SRT Indexing for all sites
    console.log('\n' + '='.repeat(60));
    console.log('🔍 Phase 3: SRT Indexing for all sites');
    console.log('='.repeat(60));
    
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        const srtResult = await runCommandWithSiteContext(
            site.id,
            'pnpm',
            ['--filter', '@browse-dot-show/srt-indexing-lambda', 'run', 'run:local'],
            'SRT indexing'
        );
        
        // Update the existing result
        results[i].srtIndexingSuccess = srtResult.success;
        results[i].srtIndexingDuration = srtResult.duration;
        results[i].newSearchEntriesAdded = srtResult.newSearchEntries || 0;
        if (srtResult.error) {
            results[i].errors.push(srtResult.error);
        }
        
        // Get search index file size
        if (srtResult.success) {
            try {
                // Set site context for getSearchIndexKey
                process.env.SITE_ID = site.id;
                const searchIndexKey = getSearchIndexKey();
                const fileSize = await getFileSize(searchIndexKey);
                results[i].searchIndexFileSizeBytes = fileSize;
            } catch (error) {
                console.warn(`Could not get search index file size for ${site.id}:`, error);
            }
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
        const srtStatus = result.srtIndexingSuccess ? '✅' : '❌';
        const totalDuration = result.rssRetrievalDuration + result.audioProcessingDuration + result.srtIndexingDuration;
        
        console.log(`\n   ${result.siteId} (${result.siteTitle}):`);
        console.log(`      RSS Retrieval: ${rssStatus} (${(result.rssRetrievalDuration / 1000).toFixed(1)}s)`);
        console.log(`      Audio Processing: ${audioStatus} (${(result.audioProcessingDuration / 1000).toFixed(1)}s)`);
        console.log(`      SRT Indexing: ${srtStatus} (${(result.srtIndexingDuration / 1000).toFixed(1)}s)`);
        console.log(`      📥 New Audio Files Downloaded: ${result.newAudioFilesDownloaded}`);
        console.log(`      🎤 Episodes Transcribed: ${result.newEpisodesTranscribed}`);
        console.log(`      📝 Search Entries Added: ${result.newSearchEntriesAdded}`);
        if (result.searchIndexFileSizeBytes > 0) {
            console.log(`      📊 Search Index Size: ${(result.searchIndexFileSizeBytes / 1024 / 1024).toFixed(2)} MB`);
        }
        console.log(`      Total: ${(totalDuration / 1000).toFixed(1)}s`);
        
        if (result.errors.length > 0) {
            console.log(`      Errors: ${result.errors.join(', ')}`);
        }
    });
    
    // Overall statistics
    const successfulRssCount = results.filter(r => r.rssRetrievalSuccess).length;
    const successfulAudioCount = results.filter(r => r.audioProcessingSuccess).length;
    const successfulSrtCount = results.filter(r => r.srtIndexingSuccess).length;
    const totalRssDuration = results.reduce((sum, r) => sum + r.rssRetrievalDuration, 0);
    const totalAudioDuration = results.reduce((sum, r) => sum + r.audioProcessingDuration, 0);
    const totalSrtDuration = results.reduce((sum, r) => sum + r.srtIndexingDuration, 0);
    const totalAudioFilesDownloaded = results.reduce((sum, r) => sum + r.newAudioFilesDownloaded, 0);
    const totalEpisodesTranscribed = results.reduce((sum, r) => sum + r.newEpisodesTranscribed, 0);
    const totalSearchEntriesAdded = results.reduce((sum, r) => sum + r.newSearchEntriesAdded, 0);
    const totalSearchIndexSize = results.reduce((sum, r) => sum + r.searchIndexFileSizeBytes, 0);
    
    console.log('\n📊 Overall Statistics:');
    console.log(`   Sites processed: ${results.length}`);
    console.log(`   RSS Retrieval success rate: ${successfulRssCount}/${results.length} (${((successfulRssCount / results.length) * 100).toFixed(1)}%)`);
    console.log(`   Audio Processing success rate: ${successfulAudioCount}/${results.length} (${((successfulAudioCount / results.length) * 100).toFixed(1)}%)`);
    console.log(`   SRT Indexing success rate: ${successfulSrtCount}/${results.length} (${((successfulSrtCount / results.length) * 100).toFixed(1)}%)`);
    console.log(`   📥 Total Audio Files Downloaded: ${totalAudioFilesDownloaded}`);
    console.log(`   🎤 Total Episodes Transcribed: ${totalEpisodesTranscribed}`);
    console.log(`   📝 Total Search Entries Added: ${totalSearchEntriesAdded}`);
    console.log(`   📊 Total Search Index Size: ${(totalSearchIndexSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Total RSS Retrieval time: ${(totalRssDuration / 1000).toFixed(1)}s`);
    console.log(`   Total Audio Processing time: ${(totalAudioDuration / 1000).toFixed(1)}s`);
    console.log(`   Total SRT Indexing time: ${(totalSrtDuration / 1000).toFixed(1)}s`);
    console.log(`   Average time per site: ${((totalRssDuration + totalAudioDuration + totalSrtDuration) / results.length / 1000).toFixed(1)}s`);
    
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