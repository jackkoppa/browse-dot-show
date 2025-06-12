import { resolve } from 'node:path';
import * as fs from 'fs/promises';
import { SEARCH_INDEX_DB_S3_KEY, LOCAL_DB_PATH } from '@browse-dot-show/constants';
import { SearchRequest, SearchResponse } from '@browse-dot-show/types';
import { deserializeOramaIndex, searchOramaIndex, OramaSearchDatabase } from '@browse-dot-show/database';
import { log } from '@browse-dot-show/logging';
import {
  getFile,
  fileExists
} from '@browse-dot-show/s3';

// Keep the Orama index in memory for reuse between lambda invocations
let oramaIndex: OramaSearchDatabase | null = null;

/**
 * Initialize the Orama search index from S3
 */
async function initializeOramaIndex(forceFreshDBFileDownload?: boolean): Promise<OramaSearchDatabase> {
  if (oramaIndex && !forceFreshDBFileDownload) {
    return oramaIndex;
  }

  if (oramaIndex && forceFreshDBFileDownload) {
    log.info('Forcing fresh DB file download. Clearing existing Orama index from memory.');
    oramaIndex = null;
    // Setting to null allows the object to be garbage collected if no other references exist.
  }

  log.info('Initializing Orama search index from S3...');
  const startTime = Date.now();

  // Ensure the local /tmp/ directory is available
  try {
    await fs.access('/tmp');
  } catch (error) {
    log.warn("Local /tmp directory is not accessible, attempting to create.", error);
    await fs.mkdir('/tmp', { recursive: true });
    log.debug("Created /tmp directory.");
  }

  // Check if the index file exists in S3
  const indexFileExistsInS3 = await fileExists(SEARCH_INDEX_DB_S3_KEY);
  if (!indexFileExistsInS3) {
    throw new Error(`Orama search index not found in S3 at: ${SEARCH_INDEX_DB_S3_KEY}. Exiting.`);
  }

  // Download the Orama index file from S3 to the local /tmp path
  log.info(`Downloading Orama index from S3 (${SEARCH_INDEX_DB_S3_KEY}) to local path (${LOCAL_DB_PATH})`);
  try {
    const indexFileBuffer = await getFile(SEARCH_INDEX_DB_S3_KEY);
    await fs.writeFile(LOCAL_DB_PATH, indexFileBuffer);
    log.info(`Successfully downloaded and saved Orama index to ${LOCAL_DB_PATH}`);
    
    // Log the file size of the downloaded index file
    try {
      const stats = await fs.stat(LOCAL_DB_PATH);
      log.info(`Orama index file size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (error) {
      log.warn(`Failed to get file size for Orama index at ${LOCAL_DB_PATH}: ${error}`);
    }
  } catch (error) {
    throw new Error(`Failed to download or save Orama index from S3: ${error}. Exiting.`);
  }

  // Deserialize the Orama index from the downloaded file
  try {
    const indexData = await fs.readFile(LOCAL_DB_PATH);
    const index = await deserializeOramaIndex(indexData);
    
    log.info(`Orama search index loaded in ${Date.now() - startTime}ms`);
    
    // Cache the index for future invocations
    oramaIndex = index;
    return index;
  } catch (error) {
    throw new Error(`Failed to deserialize Orama index: ${error}. Exiting.`);
  }
}

/**
 * Main Lambda handler function
 */
export async function handler(event: any): Promise<SearchResponse> {
  log.info('Search request received:', JSON.stringify(event));
  const startTime = Date.now();

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
    const index = await initializeOramaIndex(forceFreshDBFileDownload);

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
    const searchResponse = await searchOramaIndex(index, searchRequest);

    return searchResponse;
  } catch (error) {
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
