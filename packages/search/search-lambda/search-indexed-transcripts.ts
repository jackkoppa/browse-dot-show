import * as fs from 'fs/promises';
import { getSearchIndexKey, getLocalDbPath } from '@browse-dot-show/constants';
import { SearchRequest, SearchResponse } from '@browse-dot-show/types';
import { searchOramaIndex, OramaSearchDatabase, restoreFromFileStreamingMsgPackR } from '@browse-dot-show/database';
import { log } from '@browse-dot-show/logging';
import {
  getFile,
  fileExists
} from '@browse-dot-show/s3';

// Keep the Orama index in memory for reuse between lambda invocations
let oramaIndex: OramaSearchDatabase | null = null;

/**
 * Memory monitoring utility functions
 */
function getMemoryUsage() {
  const memUsage = process.memoryUsage();
  return {
    rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100, // MB
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
    external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100, // MB
    arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024 * 100) / 100 // MB
  };
}

function logMemoryUsage(stage: string, additionalInfo?: any) {
  // Only log memory usage if debug logging is enabled
  if (log.getLevel() > log.levels.DEBUG) {
    return;
  }
  
  const memory = getMemoryUsage();
  log.debug(`MEMORY [${stage}]: RSS=${memory.rss}MB, HeapTotal=${memory.heapTotal}MB, HeapUsed=${memory.heapUsed}MB, External=${memory.external}MB, ArrayBuffers=${memory.arrayBuffers}MB`, additionalInfo);
}

function forceGarbageCollection() {
  if (global.gc) {
    log.info('Forcing garbage collection...');
    global.gc();
    logMemoryUsage('After GC');
  } else {
    log.warn('Garbage collection not available (run with --expose-gc for manual GC)');
  }
}

/**
 * Initialize the Orama search index from S3
 */
async function initializeOramaIndex(forceFreshDBFileDownload?: boolean): Promise<OramaSearchDatabase> {
  logMemoryUsage('Function Entry');

  if (oramaIndex && !forceFreshDBFileDownload) {
    logMemoryUsage('Using Cached Index');
    return oramaIndex;
  }

  if (oramaIndex && forceFreshDBFileDownload) {
    log.info('Forcing fresh DB file download. Clearing existing Orama index from memory.');
    logMemoryUsage('Before Clearing Cache');
    oramaIndex = null;
    // Setting to null allows the object to be garbage collected if no other references exist.
    forceGarbageCollection();
    logMemoryUsage('After Clearing Cache');
  }

  log.info('Initializing Orama search index from S3...');
  const startTime = Date.now();
  logMemoryUsage('Init Start');

  // Ensure the local /tmp/ directory is available
  try {
    await fs.access('/tmp');
  } catch (error) {
    log.warn("Local /tmp directory is not accessible, attempting to create.", error);
    await fs.mkdir('/tmp', { recursive: true });
    log.debug("Created /tmp directory.");
  }

  // Check if the index file exists in S3
  const searchIndexKey = getSearchIndexKey();
  const localDbPath = getLocalDbPath();
  logMemoryUsage('Before S3 Check', { searchIndexKey, localDbPath });
  
  const indexFileExistsInS3 = await fileExists(searchIndexKey);
  if (!indexFileExistsInS3) {
    throw new Error(`Orama search index not found in S3 at: ${searchIndexKey}. Exiting.`);
  }
  logMemoryUsage('After S3 Check');

  // Download the Orama index file from S3 to the local /tmp path
  log.info(`Downloading Orama index from S3 (${searchIndexKey}) to local path (${localDbPath})`);
  let indexFileBuffer: Buffer;
  try {
    logMemoryUsage('Before S3 Download');
    indexFileBuffer = await getFile(searchIndexKey);
    logMemoryUsage('After S3 Download', { bufferSize: `${Math.round(indexFileBuffer.length / 1024 / 1024 * 100) / 100}MB` });
    
    await fs.writeFile(localDbPath, indexFileBuffer);
    log.info(`Successfully downloaded and saved Orama index to ${localDbPath}`);
    logMemoryUsage('After File Write');
    
    // Log the file size of the downloaded index file
    try {
      const stats = await fs.stat(localDbPath);
      log.info(`Orama index file size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      logMemoryUsage('After File Stat', { fileSize: `${(stats.size / 1024 / 1024).toFixed(2)}MB` });
    } catch (error) {
      log.warn(`Failed to get file size for Orama index at ${localDbPath}: ${error}`);
    }
  } catch (error) {
    throw new Error(`Failed to download or save Orama index from S3: ${error}. Exiting.`);
  }

  // Clear the buffer reference to help with memory management
  // @ts-ignore - we want to explicitly clear this reference
  indexFileBuffer = null;
  forceGarbageCollection();

  // Restore the Orama index from the downloaded file using streaming approach
  try {
    logMemoryUsage('Before Orama Streaming Restoration');
    const index = await restoreFromFileStreamingMsgPackR(localDbPath, 'zstd');
    logMemoryUsage('After Orama Streaming Restoration');
    
    log.info(`Orama search index loaded in ${Date.now() - startTime}ms`);
    
    forceGarbageCollection();
    
    // Cache the index for future invocations
    oramaIndex = index;
    logMemoryUsage('Final - Index Cached');
    return index;
  } catch (error) {
    logMemoryUsage('Error During Streaming Restoration');
    throw new Error(`Failed to restore Orama index from streaming file: ${error}. Exiting.`);
  }
}

/**
 * Main Lambda handler function
 */
export async function handler(event: any): Promise<SearchResponse> {
  logMemoryUsage('Handler Entry');
  log.info('Search request received:', JSON.stringify(event));
  const startTime = Date.now();

  // Handle CORS preflight requests (OPTIONS) immediately
  if (event.requestContext?.http?.method === 'OPTIONS') {
    log.info('CORS preflight request received, returning early without processing');
    return {
      hits: [],
      totalHits: 0,
      processingTimeMs: Date.now() - startTime,
      query: 'preflight-check',
      sortBy: undefined,
      sortOrder: 'DESC'
    };
  }

  // Determine forceFreshDBFileDownload early, as it's needed for initializeOramaIndex
  let forceFreshDBFileDownload = false;
  if (event.requestContext?.http?.method === 'GET' && event.queryStringParameters) {
    forceFreshDBFileDownload = event.queryStringParameters.forceFreshDBFileDownload === 'true';
  } else if (event.body) {
    const bodySource = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    forceFreshDBFileDownload = bodySource.forceFreshDBFileDownload === true;
  } else if (event.forceFreshDBFileDownload !== undefined) { // For direct invocation with the property
    forceFreshDBFileDownload = event.forceFreshDBFileDownload === true;
  }

  try {
    logMemoryUsage('Before Index Init');
    const index = await initializeOramaIndex(forceFreshDBFileDownload);
    logMemoryUsage('After Index Init');

    // Extract search parameters from the event
    let searchRequest: SearchRequest = {
      query: '',
      limit: 10,
      offset: 0,
      searchFields: ['text'],
      sortBy: undefined,
      sortOrder: 'DESC',
      isHealthCheckOnly: false,
      forceFreshDBFileDownload: false // Default to false
    };

    // Check if this is an API Gateway v2 event
    if (event.requestContext?.http?.method) {
      const method = event.requestContext.http.method;
      
      if (method === 'GET') {
        // For API Gateway GET requests
        const queryParams = event.queryStringParameters || {};
        searchRequest = {
          query: queryParams.query || '',
          limit: parseInt(queryParams.limit || '10', 10),
          offset: parseInt(queryParams.offset || '0', 10),
          searchFields: queryParams.fields ? queryParams.fields.split(',') : ['text'],
          sortBy: queryParams.sortBy || undefined,
          sortOrder: (queryParams.sortOrder as 'ASC' | 'DESC') || 'DESC',
          isHealthCheckOnly: queryParams.isHealthCheckOnly === 'true',
          forceFreshDBFileDownload: queryParams.forceFreshDBFileDownload === 'true'
        };
      } else if (method === 'POST' && event.body) {
        // For POST requests with a body
        const body: SearchRequest = typeof event.body === 'string'
          ? JSON.parse(event.body)
          : event.body;

        searchRequest = {
          query: body.query || '',
          limit: body.limit || 10,
          offset: body.offset || 0,
          searchFields: body.searchFields || ['text'],
          sortBy: body.sortBy || undefined,
          sortOrder: body.sortOrder || 'DESC',
          isHealthCheckOnly: body.isHealthCheckOnly || false,
          forceFreshDBFileDownload: body.forceFreshDBFileDownload || false
        };
      }
    } else if (event.body) {
      // For direct invocations or POST requests with a body
      const body: SearchRequest = typeof event.body === 'string'
        ? JSON.parse(event.body)
        : event.body;

      searchRequest = {
        query: body.query || '',
        limit: body.limit || 10,
        offset: body.offset || 0,
        searchFields: body.searchFields || ['text'],
        sortBy: body.sortBy || undefined,
        sortOrder: body.sortOrder || 'DESC',
        isHealthCheckOnly: body.isHealthCheckOnly || false,
        forceFreshDBFileDownload: body.forceFreshDBFileDownload || false
      };
    } else if (typeof event.query === 'string') {
      // For direct invocations with a query property (backward compatibility)
      searchRequest = {
        query: event.query,
        limit: event.limit || 10,
        offset: event.offset || 0,
        searchFields: event.searchFields || ['text'],
        sortBy: event.sortBy || undefined,
        sortOrder: event.sortOrder || 'DESC',
        isHealthCheckOnly: event.isHealthCheckOnly || false,
        forceFreshDBFileDownload: event.forceFreshDBFileDownload || false
      };
    }

    // If this is a health check, return early with a minimal response
    if (searchRequest.isHealthCheckOnly) {
      const processingTimeMs = Date.now() - startTime;
      log.info(`Health check completed in ${processingTimeMs}ms - Lambda is now warm`);
      logMemoryUsage('Health Check Complete');
      return {
        hits: [],
        totalHits: 0,
        processingTimeMs,
        query: 'health-check',
        sortBy: undefined,
        sortOrder: 'DESC'
      };
    }

    // // For local testing: add delay
    // await new Promise(resolve => setTimeout(resolve, 5000));

    // Perform the search using Orama
    logMemoryUsage('Before Search Execution');
    const searchResponse = await searchOramaIndex(index, searchRequest);
    logMemoryUsage('After Search Execution', { 
      totalHits: searchResponse.totalHits, 
      hitCount: searchResponse.hits.length 
    });

    return searchResponse;
  } catch (error) {
    logMemoryUsage('Error in Handler');
    log.error('Error searching indexed transcripts:', error);
    throw error;
  }
}

// Check if the module is being run directly - simplified for compatibility
if (process.argv[1] && process.argv[1].endsWith('search-indexed-transcripts.ts')) {
  const testQuery: SearchRequest = {
    query: 'test query',
    limit: 5,
    sortBy: 'episodePublishedUnixTimestamp',
    sortOrder: 'DESC',
    forceFreshDBFileDownload: false // Example, can be true to test
  };
  handler({ body: testQuery })
    .then(result => log.debug('Search results:', JSON.stringify(result, null, 2)))
    .catch(err => log.error('Search failed with error:', err));
}
