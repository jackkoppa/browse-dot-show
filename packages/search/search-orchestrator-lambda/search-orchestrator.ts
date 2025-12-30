import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getShardManifestKey } from '@browse-dot-show/constants';
import { SearchRequest, SearchResponse, ApiSearchResultHit } from '@browse-dot-show/types';
import { ShardManifest } from '@browse-dot-show/types';
import { log } from '@browse-dot-show/logging';
import { getFile } from '@browse-dot-show/s3';

// Initialize Lambda client
const lambdaClient = new LambdaClient({});

// Cache the shard manifest in memory between invocations
let cachedShardManifest: ShardManifest | null = null;

/**
 * Load the shard manifest from S3
 */
async function loadShardManifest(): Promise<ShardManifest> {
  if (cachedShardManifest) {
    log.debug('Using cached shard manifest');
    return cachedShardManifest;
  }

  log.info('Loading shard manifest from S3...');
  const manifestKey = getShardManifestKey();
  
  try {
    const manifestBuffer = await getFile(manifestKey);
    const manifestJson = manifestBuffer.toString('utf-8');
    const manifest: ShardManifest = JSON.parse(manifestJson);
    
    log.info(`Loaded shard manifest: ${manifest.shardCount} shards, ${manifest.totalEpisodes} total episodes`);
    cachedShardManifest = manifest;
    return manifest;
  } catch (error) {
    log.error(`Failed to load shard manifest from ${manifestKey}:`, error);
    throw new Error(`Failed to load shard manifest: ${error}`);
  }
}

/**
 * Get shard Lambda ARNs from environment variable
 */
function getShardLambdaArns(): string[] {
  const arnsJson = process.env.SHARD_LAMBDA_ARNS;
  if (!arnsJson) {
    throw new Error('SHARD_LAMBDA_ARNS environment variable not set');
  }
  
  try {
    const arns = JSON.parse(arnsJson);
    if (!Array.isArray(arns) || arns.length === 0) {
      throw new Error('SHARD_LAMBDA_ARNS must be a non-empty array');
    }
    return arns;
  } catch (error) {
    throw new Error(`Failed to parse SHARD_LAMBDA_ARNS: ${error}`);
  }
}

/**
 * Invoke a single shard Lambda
 */
async function invokeShardLambda(
  lambdaArn: string,
  shardId: number,
  searchRequest: SearchRequest,
  timeout: number = 25000 // 25 second timeout per shard
): Promise<{ shardId: number; response?: SearchResponse; error?: any }> {
  const startTime = Date.now();
  
  try {
    log.debug(`Invoking shard ${shardId} Lambda: ${lambdaArn}`);
    
    const command = new InvokeCommand({
      FunctionName: lambdaArn,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(searchRequest),
    });

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Shard ${shardId} timeout after ${timeout}ms`)), timeout);
    });

    // Race between Lambda invocation and timeout
    const result = await Promise.race([
      lambdaClient.send(command),
      timeoutPromise
    ]);

    const duration = Date.now() - startTime;
    
    if (result.FunctionError) {
      log.error(`Shard ${shardId} returned error:`, result.FunctionError);
      return {
        shardId,
        error: new Error(`Shard ${shardId} function error: ${result.FunctionError}`)
      };
    }

    if (!result.Payload) {
      log.error(`Shard ${shardId} returned no payload`);
      return {
        shardId,
        error: new Error(`Shard ${shardId} returned no payload`)
      };
    }

    const payloadString = Buffer.from(result.Payload).toString('utf-8');
    const response: SearchResponse = JSON.parse(payloadString);
    
    log.info(`Shard ${shardId} completed in ${duration}ms: ${response.hits.length} hits, ${response.totalHits} total`);
    
    return { shardId, response };
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(`Shard ${shardId} failed after ${duration}ms:`, error);
    return { shardId, error };
  }
}

/**
 * Normalize scores within a result set to 0-1 scale
 * This allows fair comparison of BM25 scores across different indexes
 */
function normalizeScores(hits: ApiSearchResultHit[]): Array<ApiSearchResultHit & { normalizedScore: number }> {
  if (hits.length === 0) {
    return [];
  }

  // Orama doesn't expose scores directly in the hit objects by default
  // For now, we'll use a simpler approach: rank-based normalization
  // The first result gets score 1.0, last gets 0.0, linear interpolation in between
  return hits.map((hit, index) => ({
    ...hit,
    normalizedScore: hits.length === 1 ? 1.0 : 1.0 - (index / (hits.length - 1))
  }));
}

/**
 * Merge and sort results from multiple shards
 * Uses score normalization to ensure fair comparison across shards
 */
function mergeShardResults(
  shardResults: Array<{ shardId: number; response: SearchResponse }>,
  limit: number,
  offset: number
): ApiSearchResultHit[] {
  log.debug(`Merging results from ${shardResults.length} shards`);
  
  // Normalize scores within each shard's results
  const normalizedResults = shardResults.flatMap(({ shardId, response }) => {
    const normalized = normalizeScores(response.hits);
    log.debug(`Shard ${shardId}: normalized ${normalized.length} hits`);
    return normalized;
  });

  // Sort by normalized score descending
  normalizedResults.sort((a, b) => b.normalizedScore - a.normalizedScore);
  
  // Apply pagination
  const paginatedResults = normalizedResults.slice(offset, offset + limit);
  
  // Remove the normalizedScore property before returning
  return paginatedResults.map(({ normalizedScore, ...hit }) => hit);
}

/**
 * Calculate total hits across all shards
 */
function calculateTotalHits(shardResults: Array<{ shardId: number; response: SearchResponse }>): number {
  return shardResults.reduce((total, { response }) => total + response.totalHits, 0);
}

/**
 * Calculate proportional offsets for distributed pagination
 * 
 * This ensures consistent pagination by distributing the offset proportionally
 * based on each shard's contribution to total results.
 */
function calculateProportionalOffsets(
  shardResults: Array<{ shardId: number; response: SearchResponse }>,
  offset: number,
  limit: number
): Map<number, { offset: number; limit: number }> {
  const totalHits = calculateTotalHits(shardResults);
  const offsetMap = new Map<number, { offset: number; limit: number }>();
  
  if (totalHits === 0) {
    // No results, return empty map
    return offsetMap;
  }

  // For each shard, calculate proportional offset and over-fetch limit
  for (const { shardId, response } of shardResults) {
    const shardRatio = response.totalHits / totalHits;
    const shardOffset = Math.floor(offset * shardRatio);
    // Over-fetch: request limit * 2 to ensure we have enough results after merging
    const shardLimit = Math.ceil(limit * 2 * shardRatio);
    
    offsetMap.set(shardId, { offset: shardOffset, limit: shardLimit });
    log.debug(`Shard ${shardId}: ratio=${shardRatio.toFixed(3)}, offset=${shardOffset}, limit=${shardLimit}`);
  }

  return offsetMap;
}

/**
 * Invoke all shard Lambdas in parallel with the same search query
 * For the first request (offset=0), we get total counts from each shard
 * For subsequent requests, we use proportional pagination
 */
async function invokeAllShards(
  lambdaArns: string[],
  searchRequest: SearchRequest
): Promise<{
  successfulShards: Array<{ shardId: number; response: SearchResponse }>;
  failedShards: number[];
}> {
  log.info(`Invoking ${lambdaArns.length} shard Lambdas in parallel`);
  const startTime = Date.now();

  // For the first page (offset=0), we need to get total counts from each shard
  // For subsequent pages, we'll use proportional pagination
  const isFirstPage = (searchRequest.offset || 0) === 0;
  
  if (isFirstPage) {
    // First page: over-fetch from all shards to ensure we have enough results
    const overFetchLimit = (searchRequest.limit || 10) * 2;
    const shardRequest: SearchRequest = {
      ...searchRequest,
      limit: overFetchLimit,
      offset: 0
    };

    const results = await Promise.all(
      lambdaArns.map((arn, index) => invokeShardLambda(arn, index + 1, shardRequest))
    );

    const successfulShards = results
      .filter(r => r.response !== undefined)
      .map(r => ({ shardId: r.shardId, response: r.response! }));
    
    const failedShards = results
      .filter(r => r.error !== undefined)
      .map(r => r.shardId);

    const duration = Date.now() - startTime;
    log.info(`All shards completed in ${duration}ms: ${successfulShards.length} successful, ${failedShards.length} failed`);

    return { successfulShards, failedShards };
  } else {
    // Subsequent pages: we need to do a two-phase approach
    // Phase 1: Get total counts from each shard (with limit=0 for efficiency)
    log.info('Phase 1: Getting total counts from each shard');
    const countRequest: SearchRequest = {
      ...searchRequest,
      limit: 0,
      offset: 0
    };

    const countResults = await Promise.all(
      lambdaArns.map((arn, index) => invokeShardLambda(arn, index + 1, countRequest))
    );

    const successfulCountShards = countResults
      .filter(r => r.response !== undefined)
      .map(r => ({ shardId: r.shardId, response: r.response! }));

    if (successfulCountShards.length === 0) {
      log.error('All shards failed during count phase');
      return { successfulShards: [], failedShards: lambdaArns.map((_, i) => i + 1) };
    }

    // Phase 2: Calculate proportional offsets and fetch results
    log.info('Phase 2: Fetching results with proportional pagination');
    const offsetMap = calculateProportionalOffsets(
      successfulCountShards,
      searchRequest.offset || 0,
      searchRequest.limit || 10
    );

    const fetchResults = await Promise.all(
      lambdaArns.map((arn, index) => {
        const shardId = index + 1;
        const pagination = offsetMap.get(shardId);
        
        if (!pagination) {
          // This shard has no results, skip it
          return Promise.resolve({ shardId, response: undefined });
        }

        const shardRequest: SearchRequest = {
          ...searchRequest,
          limit: pagination.limit,
          offset: pagination.offset
        };

        return invokeShardLambda(arn, shardId, shardRequest);
      })
    );

    const successfulShards = fetchResults
      .filter(r => r.response !== undefined)
      .map(r => ({ shardId: r.shardId, response: r.response! }));
    
    const failedShards = fetchResults
      .filter(r => r.error !== undefined)
      .map(r => r.shardId);

    const duration = Date.now() - startTime;
    log.info(`All shards completed in ${duration}ms: ${successfulShards.length} successful, ${failedShards.length} failed`);

    return { successfulShards, failedShards };
  }
}

/**
 * Handle health check requests
 * Warms up the orchestrator and optionally all shard Lambdas
 */
async function handleHealthCheck(lambdaArns: string[]): Promise<SearchResponse> {
  log.info('Health check request received');
  const startTime = Date.now();

  // Load the shard manifest to warm up the orchestrator
  await loadShardManifest();

  // Optionally warm up all shard Lambdas in parallel
  const warmShards = process.env.WARM_SHARDS_ON_HEALTH_CHECK === 'true';
  
  if (warmShards) {
    log.info('Warming up all shard Lambdas...');
    const healthCheckRequest: SearchRequest = {
      query: '',
      isHealthCheckOnly: true
    };

    const results = await Promise.all(
      lambdaArns.map((arn, index) => invokeShardLambda(arn, index + 1, healthCheckRequest, 30000))
    );

    const successCount = results.filter(r => r.response !== undefined).length;
    log.info(`Warmed up ${successCount}/${lambdaArns.length} shard Lambdas`);
  }

  const processingTimeMs = Date.now() - startTime;
  log.info(`Health check completed in ${processingTimeMs}ms`);

  return {
    hits: [],
    totalHits: 0,
    processingTimeMs,
    query: 'health-check',
    sortBy: undefined,
    sortOrder: 'DESC',
    shardingMetadata: {
      isShardedResponse: true,
      queriedShards: [],
      failedShards: [],
      partial: false
    }
  };
}

/**
 * Main Lambda handler function
 */
export async function handler(event: any): Promise<SearchResponse> {
  log.info('Search orchestrator request received:', JSON.stringify(event));
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

  try {
    // Get shard Lambda ARNs from environment
    const lambdaArns = getShardLambdaArns();
    log.info(`Orchestrating search across ${lambdaArns.length} shard Lambdas`);

    // Extract search parameters from the event
    let searchRequest: SearchRequest = {
      query: '',
      limit: 10,
      offset: 0,
      searchFields: ['text'],
      sortBy: undefined,
      sortOrder: 'DESC',
      isHealthCheckOnly: false,
      forceFreshDBFileDownload: false
    };

    // Parse request based on event structure (same logic as search Lambda)
    if (event.requestContext?.http?.method) {
      const method = event.requestContext.http.method;
      
      if (method === 'GET') {
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

    // Handle health check requests
    if (searchRequest.isHealthCheckOnly) {
      return await handleHealthCheck(lambdaArns);
    }

    // Invoke all shard Lambdas in parallel
    const { successfulShards, failedShards } = await invokeAllShards(lambdaArns, searchRequest);

    // If all shards failed, throw an error
    if (successfulShards.length === 0) {
      throw new Error('All shard Lambdas failed');
    }

    // Merge results from successful shards
    const mergedHits = mergeShardResults(
      successfulShards,
      searchRequest.limit || 10,
      searchRequest.offset || 0
    );

    const totalHits = calculateTotalHits(successfulShards);
    const processingTimeMs = Date.now() - startTime;

    log.info(`Search orchestration completed in ${processingTimeMs}ms: ${mergedHits.length} hits returned, ${totalHits} total hits`);

    return {
      hits: mergedHits,
      totalHits,
      processingTimeMs,
      query: searchRequest.query,
      sortBy: searchRequest.sortBy,
      sortOrder: searchRequest.sortOrder,
      shardingMetadata: {
        isShardedResponse: true,
        queriedShards: successfulShards.map(s => s.shardId),
        failedShards: failedShards.length > 0 ? failedShards : undefined,
        partial: failedShards.length > 0
      }
    };
  } catch (error) {
    log.error('Error in search orchestrator:', error);
    throw error;
  }
}

// Check if the module is being run directly
if (process.argv[1] && process.argv[1].endsWith('search-orchestrator.ts')) {
  const testQuery: SearchRequest = {
    query: 'test query',
    limit: 5,
    sortBy: 'episodePublishedUnixTimestamp',
    sortOrder: 'DESC'
  };
  handler({ body: testQuery })
    .then(result => log.debug('Search results:', JSON.stringify(result, null, 2)))
    .catch(err => log.error('Search failed with error:', err));
}
