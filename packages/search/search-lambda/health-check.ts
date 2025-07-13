#!/usr/bin/env tsx

import { handler } from './search-indexed-transcripts.js';
import { log } from '@browse-dot-show/logging';

/**
 * Health check script for the search lambda
 * Tests how long it takes to load the search index and return a health check response
 */
async function runHealthCheck() {
  log.info('=== Search Lambda Health Check Starting ===');
  
  const startTime = Date.now();
  const startTimeISO = new Date(startTime).toISOString();
  
  log.info(`Health check started at: ${startTimeISO}`);
  
  try {
    // Create an event with health check only parameter
    const healthCheckEvent = {
      isHealthCheckOnly: true,
      forceFreshDBFileDownload: false // Can be set to true to test fresh downloads
    };
    
    log.info('Calling search handler with health check event...');
    const result = await handler(healthCheckEvent);
    
    const endTime = Date.now();
    const endTimeISO = new Date(endTime).toISOString();
    const totalElapsedMs = endTime - startTime;
    
    log.info(`Health check completed at: ${endTimeISO}`);
    log.info(`Total elapsed time: ${totalElapsedMs}ms (${(totalElapsedMs / 1000).toFixed(2)}s)`);
    log.info(`Lambda internal processing time: ${result.processingTimeMs}ms`);
    log.info('=== Search Lambda Health Check Complete ===');
    
    // Exit successfully
    process.exit(0);
    
  } catch (error) {
    const endTime = Date.now();
    const endTimeISO = new Date(endTime).toISOString();
    const totalElapsedMs = endTime - startTime;
    
    log.error(`Health check failed at: ${endTimeISO}`);
    log.error(`Total elapsed time before failure: ${totalElapsedMs}ms (${(totalElapsedMs / 1000).toFixed(2)}s)`);
    log.error('Health check error:', error);
    log.error('=== Search Lambda Health Check Failed ===');
    
    // Exit with error code
    process.exit(1);
  }
}

// Run the health check
runHealthCheck().catch((error) => {
  log.error('Unexpected error in health check:', error);
  process.exit(1);
}); 