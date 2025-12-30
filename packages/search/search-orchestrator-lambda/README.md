# Search Orchestrator Lambda

Coordinates distributed search across multiple shard Lambdas for large sites that exceed single Lambda memory limits.

## Overview

The search orchestrator is an optional component that enables browse.show sites to scale beyond the 10GB Lambda memory limit by distributing search across multiple shard Lambdas.

### Architecture

```
Client → API Gateway → Search Orchestrator Lambda
                              ↓
                    ┌─────────┼─────────┐
                    ↓         ↓         ↓
                 Shard 1   Shard 2   Shard N
                 (ep 1-300) (301-600) (601+)
```

## Features

### 1. Parallel Shard Invocation
- Invokes all shard Lambdas in parallel via AWS SDK
- Configurable timeout per shard (default: 25s)
- Handles partial results when some shards fail

### 2. Score Normalization
- Normalizes BM25 scores across shards for fair comparison
- Uses rank-based normalization (1.0 for top result, 0.0 for bottom)
- Ensures consistent result ordering regardless of shard

### 3. Distributed Pagination
- **First page (offset=0)**: Over-fetch from all shards (limit * 2)
- **Subsequent pages**: Two-phase approach:
  1. Get total counts from each shard (limit=0)
  2. Calculate proportional offsets based on result distribution
  3. Fetch results with proportional pagination

### 4. Partial Results
- Returns results from successful shards even if some fail
- Marks response as `partial: true` when shards fail
- Includes `failedShards` array for debugging

### 5. Health Check & Warming
- Supports health check requests for Lambda warming
- Optionally warms all shard Lambdas in parallel
- Caches shard manifest in memory between invocations

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHARD_LAMBDA_ARNS` | Yes | JSON array of shard Lambda ARNs |
| `SITE_ID` | Yes | Site identifier |
| `FILE_STORAGE_ENV` | Yes | Storage environment (`prod-s3` or `local`) |
| `S3_BUCKET_NAME` | Yes | S3 bucket for shard manifest |
| `LOG_LEVEL` | No | Logging level (default: `info`) |
| `WARM_SHARDS_ON_HEALTH_CHECK` | No | Whether to warm shards during health checks (default: `false`) |

## Request/Response Format

### Request
Same as single search Lambda:

```typescript
{
  query: string;
  limit?: number;        // default: 10
  offset?: number;       // default: 0
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  searchFields?: string[];
  isHealthCheckOnly?: boolean;
  forceFreshDBFileDownload?: boolean;
}
```

### Response
Extends single search Lambda response with sharding metadata:

```typescript
{
  hits: ApiSearchResultHit[];
  totalHits: number;
  processingTimeMs: number;
  query: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  shardingMetadata?: {
    isShardedResponse: boolean;
    queriedShards?: number[];      // [1, 2, 3]
    failedShards?: number[];       // [2] if shard 2 failed
    partial?: boolean;             // true if any shards failed
  }
}
```

## Development

### Local Testing

```bash
# Start dev server
pnpm dev:local

# Test search
curl "http://localhost:3001/search?query=test&limit=5"

# Test health check
curl "http://localhost:3001/search?isHealthCheckOnly=true"
```

### Build for AWS

```bash
pnpm build:prod
```

This creates `aws-dist/` directory with bundled Lambda code.

## Implementation Details

### Score Normalization Algorithm

Since Orama's BM25 scores are index-specific (depend on document frequency), we normalize scores within each shard before merging:

```typescript
// Rank-based normalization
normalizedScore = 1.0 - (rank / (totalResults - 1))
```

This ensures the top result from each shard gets score 1.0, bottom gets 0.0, with linear interpolation.

### Pagination Strategy

**First page (offset=0)**:
- Request `limit * 2` from each shard
- Merge and normalize all results
- Return top `limit` results

**Subsequent pages (offset > 0)**:
- Phase 1: Get total counts from each shard (limit=0)
- Phase 2: Calculate proportional offsets:
  ```
  shardOffset = floor(offset * shardRatio)
  shardLimit = ceil(limit * 2 * shardRatio)
  ```
- Phase 3: Fetch and merge results

This ensures consistent pagination across shards with different result distributions.

### Error Handling

- **All shards fail**: Throw error (search fails)
- **Some shards fail**: Return partial results with `partial: true`
- **Shard timeout**: 25s timeout per shard, treated as failure
- **Invalid response**: Logged and treated as failure

## Testing

See `search-orchestrator.spec.ts` for unit tests covering:
- Score normalization
- Result merging
- Proportional pagination
- Partial results handling
- Health check warming

## Related Documentation

- [Search Orchestration Architecture](../../../docs/architecture/search-orchestration.md)
- [Search Orchestration Diagrams](../../../docs/architecture/search-orchestration-diagrams.md)
- [Shard Manifest Types](../../types/shard-manifest.ts)
