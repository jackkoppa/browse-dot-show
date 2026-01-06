/**
 * Health check script for warming up the search orchestrator Lambda
 * 
 * This can be invoked by EventBridge on a schedule to keep the Lambda warm
 * 
 * Usage:
 *   pnpm dev:health-check
 */

import { handler } from './search-orchestrator.js';
import { log } from '@browse-dot-show/logging';

// Set log level
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Mock environment variables if not set
if (!process.env.SHARD_LAMBDA_ARNS) {
  console.warn('SHARD_LAMBDA_ARNS not set. Using mock values.');
  process.env.SHARD_LAMBDA_ARNS = JSON.stringify([
    'arn:aws:lambda:us-east-1:123456789012:function:search-api-test-site-shard-1',
    'arn:aws:lambda:us-east-1:123456789012:function:search-api-test-site-shard-2'
  ]);
}

if (!process.env.SITE_ID) {
  process.env.SITE_ID = 'test-site';
}

if (!process.env.FILE_STORAGE_ENV) {
  process.env.FILE_STORAGE_ENV = 'local';
}

async function runHealthCheck() {
  log.info('Running health check...');
  
  try {
    const result = await handler({
      body: {
        isHealthCheckOnly: true
      }
    });
    
    log.info('Health check completed successfully:', result);
    log.info(`Processing time: ${result.processingTimeMs}ms`);
    
    if (result.shardingMetadata) {
      log.info(`Sharding metadata:`, result.shardingMetadata);
    }
    
    process.exit(0);
  } catch (error) {
    log.error('Health check failed:', error);
    process.exit(1);
  }
}

runHealthCheck();
