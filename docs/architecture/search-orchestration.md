# Search Orchestration Lambda - Architecture Design

> **Status**: Draft - Planning Phase  
> **Epic**: bds-a8r  
> **Planning Task**: bds-a8r.1  
> **Diagrams**: [search-orchestration-diagrams.md](./search-orchestration-diagrams.md)

## Problem Statement

browse.show sites with large episode catalogs are hitting Lambda memory limits:

| Site | Episodes | Memory Used | Status |
|------|----------|-------------|--------|
| `limitedresources` | ~800+ | >10GB (OOM) | ❌ Broken |
| `myfavoritemurder` | ~500+ | ~8GB | ⚠️ Approaching limit |

**Root cause**: Each site has a single search Lambda that loads the entire Orama index into memory on cold start. AWS Lambda has a 10GB memory ceiling.

## Current Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│   Client    │────▶│ API Gateway │────▶│ Search Lambda       │
│             │◀────│             │◀────│ (loads full index)  │
└─────────────┘     └─────────────┘     └─────────────────────┘
                                                   │
                                                   ▼
                                        ┌─────────────────────┐
                                        │        S3           │
                                        │ orama_index.msp     │
                                        │ (single index file) │
                                        └─────────────────────┘
```

**Current flow:**
1. Client sends search query to API Gateway
2. API Gateway invokes Search Lambda
3. On cold start, Lambda downloads `orama_index.msp` from S3 (~1-3GB compressed)
4. Lambda decompresses and loads into memory (~5-10GB decompressed)
5. Lambda executes search and returns results

## Proposed Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│   Client    │────▶│ API Gateway │────▶│ Search Orchestrator │
│             │◀────│             │◀────│ Lambda              │
└─────────────┘     └─────────────┘     └─────────────────────┘
                                                   │
                           ┌───────────────────────┼───────────────────────┐
                           │                       │                       │
                           ▼                       ▼                       ▼
                  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
                  │ Search Lambda   │     │ Search Lambda   │     │ Search Lambda   │
                  │ Shard 1         │     │ Shard 2         │     │ Shard N         │
                  │ (ep. 1-300)     │     │ (ep. 301-600)   │     │ (ep. 601+)      │
                  └─────────────────┘     └─────────────────┘     └─────────────────┘
                           │                       │                       │
                           ▼                       ▼                       ▼
                  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
                  │ S3: index-1.msp │     │ S3: index-2.msp │     │ S3: index-N.msp │
                  └─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Proposed flow:**
1. Client sends search query to API Gateway (same API contract)
2. API Gateway invokes Search Orchestrator Lambda
3. Orchestrator fans out query to all Search Shard Lambdas in parallel
4. Each shard searches its portion of the index
5. Orchestrator merges results by relevancy score
6. Orchestrator returns unified response to client

## Key Design Decisions

### 1. Sharding Strategy: Episode Range

Partition episodes by sequential ID ranges. Each shard handles a contiguous range of episodes.

**Why episode range?**
- Simple to understand and debug
- Deterministic: given an episode ID, you know which shard has it
- Even distribution (assuming episodes are similar in transcript size)
- No auth complexity (that comes in Epic 2)

**Configuration example:**
```hcl
# terraform/sites/prod.tfvars
enable_search_orchestrator = true
search_shard_count = 3
# Shard boundaries auto-calculated, or can be manually specified:
# search_shard_boundaries = [0, 300, 600]  # Optional override
```

> **QUESTION FOR REVIEW**: Should shard boundaries be:
> - (A) Auto-calculated based on episode count / shard count?
> - (B) Manually specified in terraform config?
> - (C) Determined by target memory size per shard?
> 
> I'm leaning toward (A) with (B) as optional override.

### 2. Result Merging Strategy

Orama uses BM25 scoring. BM25 scores from different indexes are NOT directly comparable because document frequency (DF) is index-specific.

**Decision: Score normalization**

1. Collect top N results from each shard (over-fetch: `limit * 2` per shard)
2. Normalize scores within each shard's result set to 0-1 scale:
   ```
   normalized_score = (score - min_score) / (max_score - min_score)
   ```
3. Merge all normalized results
4. Sort by normalized score descending
5. Return top `limit` results

This ensures fair comparison across shards with different index characteristics.

### 3. Pagination Strategy

**Decision: Proper distributed pagination from the start**

Users frequently paginate to page 2, 3, 4, 5+ in this type of app. Results must be consistent.

**Approach: Proportional offset distribution**

For `offset=50, limit=10` across 3 shards:

1. **First request** (or cache miss): Get total counts from each shard
   - Shard 1: 150 total matches
   - Shard 2: 100 total matches  
   - Shard 3: 50 total matches
   - Total: 300 matches

2. **Calculate proportional offsets**:
   ```
   shard_1_ratio = 150/300 = 0.5  → offset = 25, limit = 15
   shard_2_ratio = 100/300 = 0.33 → offset = 17, limit = 10
   shard_3_ratio = 50/300 = 0.17  → offset = 8,  limit = 5
   ```

3. **Merge results** using score normalization (see above)

4. **Edge case handling**: If a shard returns fewer results than expected, request more from other shards

This ensures consistent pagination regardless of how results are distributed across shards.

### 4. Cold Start Management

Multiple Lambdas = multiple cold starts = longer initial response time.

**Strategies:**
1. **Parallel warming**: EventBridge warms all shards every N minutes
2. **Orchestrator health check**: On first request, orchestrator triggers parallel health checks
3. **Staggered deployment**: Don't deploy all shards at once

**Proposed approach:**
- Extend existing `enable_search_lambda_warming` to warm all shards
- Orchestrator invokes shards in parallel, waits for all (with timeout)

### 5. Error Handling

**Decision: Return partial results**

When one shard fails (timeout, error):
1. Return results from successful shards
2. Mark response as partial: `{ partial: true, failedShards: [2] }`
3. Log error with clear context (shard ID, error type, duration)
4. Client can display "Some results may be missing" warning

**Logging requirements:**
- Log shard failures with enough detail for debugging
- Track failure rates for alerting (future: Slack alerts when error counts spike)
- See task: **bds-kmy** for error monitoring infrastructure

### 6. API Gateway Timeout

API Gateway has a **30-second hard limit**. Current `myfavoritemurder` cold start is ~50 seconds with a single ~8GB index.

**Decision: Target ~7GB max per shard**

- Smaller indexes = faster cold starts
- ~7GB decompressed index should cold start in ~20-25 seconds
- Leaves buffer for orchestrator overhead

**Cold start budget:**
- Orchestrator cold start: ~2-3 seconds (lightweight, no index to load)
- Shard cold starts (parallel): ~20-25 seconds each
- Total: ~25 seconds (under 30s limit)

**Timeout handling:**
- Accept occasional timeouts during cold starts
- Client should retry on timeout
- Log timeout events via goatcounter for monitoring (see task: **bds-7dq**)
- Keep warming at 5 minutes (sufficient with smaller shards)

## Index Partitioning (Ingestion Side)

The indexing Lambda (`srt-indexing-lambda`) must create multiple index files.

### Current behavior:
```
S3 structure:
  search-index/orama_index.msp         # Single index file
  search-entries/{podcast}/*.json      # Per-episode search entries
```

### Proposed behavior:
```
S3 structure (when orchestrator enabled):
  search-index/shard-1/orama_index.msp  # Episodes 1-300
  search-index/shard-2/orama_index.msp  # Episodes 301-600
  search-index/shard-3/orama_index.msp  # Episodes 601+
  search-index/shard-manifest.json      # Shard boundaries & metadata
  search-entries/{podcast}/*.json       # Unchanged
```

### Shard manifest example:
```json
{
  "version": 1,
  "shardCount": 3,
  "shards": [
    { "id": 1, "episodeRange": [1, 300], "indexPath": "search-index/shard-1/orama_index.msp" },
    { "id": 2, "episodeRange": [301, 600], "indexPath": "search-index/shard-2/orama_index.msp" },
    { "id": 3, "episodeRange": [601, null], "indexPath": "search-index/shard-3/orama_index.msp" }
  ],
  "createdAt": "2025-01-15T12:00:00Z",
  "totalEpisodes": 823
}
```

## Terraform Configuration

### New variables (in `terraform/sites/variables.tf`):

```hcl
variable "enable_search_orchestrator" {
  description = "Enable search orchestration for large sites that exceed single Lambda memory limits"
  type        = bool
  default     = false
}

variable "search_shard_count" {
  description = "Number of search shards (only used when enable_search_orchestrator = true)"
  type        = number
  default     = 2
  validation {
    condition     = var.search_shard_count >= 2 && var.search_shard_count <= 10
    error_message = "Shard count must be between 2 and 10"
  }
}
```

### Resource changes (in `terraform/sites/main.tf`):

**When `enable_search_orchestrator = false` (default):**
- No changes from current behavior
- Single `search-api-{site_id}` Lambda
- API Gateway → Search Lambda directly

**When `enable_search_orchestrator = true`:**

```hcl
# Search Orchestrator Lambda (NEW)
module "search_orchestrator_lambda" {
  count  = var.enable_search_orchestrator ? 1 : 0
  source = "./modules/lambda"

  function_name = "search-orchestrator-${var.site_id}"
  handler       = "search-orchestrator.handler"
  runtime       = "nodejs24.x"
  timeout       = var.search_lambda_timeout
  memory_size   = 512  # Orchestrator is lightweight, just coordinates
  environment_variables = {
    S3_BUCKET_NAME   = module.s3_bucket.bucket_name
    LOG_LEVEL        = var.log_level
    SITE_ID          = var.site_id
    SHARD_COUNT      = var.search_shard_count
    # Shard Lambda ARNs passed as JSON array
    SHARD_LAMBDA_ARNS = jsonencode([for i in range(var.search_shard_count) : 
      module.search_shard_lambdas[i].lambda_function_arn
    ])
  }
  source_dir          = "../../packages/search/search-orchestrator-lambda/aws-dist"
  s3_bucket_name      = module.s3_bucket.bucket_name
  site_id             = var.site_id
  lambda_architecture = ["arm64"]
}

# Search Shard Lambdas (replaces single search Lambda when orchestrator enabled)
module "search_shard_lambdas" {
  count  = var.enable_search_orchestrator ? var.search_shard_count : 0
  source = "./modules/lambda"

  function_name = "search-api-${var.site_id}-shard-${count.index + 1}"
  handler       = "search-indexed-transcripts.handler"
  runtime       = "nodejs24.x"
  timeout       = var.search_lambda_timeout
  memory_size   = var.search_lambda_memory_size
  ephemeral_storage = 2048
  environment_variables = {
    S3_BUCKET_NAME   = module.s3_bucket.bucket_name
    LOG_LEVEL        = var.log_level
    SITE_ID          = var.site_id
    FILE_STORAGE_ENV = "prod-s3"
    SHARD_ID         = count.index + 1  # NEW: tells Lambda which shard index to load
    SHARD_COUNT      = var.search_shard_count
  }
  source_dir          = "../../packages/search/search-lambda/aws-dist"
  s3_bucket_name      = module.s3_bucket.bucket_name
  site_id             = var.site_id
  lambda_architecture = ["arm64"]
  layers              = [aws_lambda_layer_version.compress_encode_layer.arn]
}

# Original search Lambda (only when orchestrator disabled)
module "search_lambda" {
  count  = var.enable_search_orchestrator ? 0 : 1  # CHANGED: conditional
  source = "./modules/lambda"
  # ... existing configuration unchanged ...
}

# API Gateway integration - point to orchestrator OR single Lambda
resource "aws_apigatewayv2_integration" "search_lambda_integration" {
  api_id             = aws_apigatewayv2_api.search_api.id
  integration_type   = "AWS_PROXY"
  # CHANGED: conditional target
  integration_uri    = var.enable_search_orchestrator ? module.search_orchestrator_lambda[0].lambda_function_arn : module.search_lambda[0].lambda_function_arn
  integration_method = "POST"
  payload_format_version = "2.0"
  timeout_milliseconds   = var.api_gateway_timeout * 1000
}

# EventBridge warming - warm ALL Lambdas when orchestrator enabled
module "search_lambda_warming_schedule" {
  count  = var.enable_search_lambda_warming ? 1 : 0
  source = "./modules/eventbridge"
  
  schedule_name       = "search-lambda-warming-${var.site_id}"
  schedule_expression = var.search_lambda_warming_schedule
  # CHANGED: warm orchestrator (which will warm shards) or single Lambda
  lambda_function_arn = var.enable_search_orchestrator ? module.search_orchestrator_lambda[0].lambda_function_arn : module.search_lambda[0].lambda_function_arn
  site_id             = var.site_id
}

# IAM: Orchestrator needs permission to invoke shard Lambdas
resource "aws_iam_role_policy" "orchestrator_invoke_shards" {
  count = var.enable_search_orchestrator ? 1 : 0
  name  = "orchestrator-invoke-shards-${var.site_id}"
  role  = module.search_orchestrator_lambda[0].lambda_role_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = [for lambda in module.search_shard_lambdas : lambda.lambda_function_arn]
    }]
  })
}
```

### Example site configuration:

**Small site (default - no changes needed):**
```hcl
# sites/origin-sites/hardfork/terraform/prod.tfvars
# enable_search_orchestrator = false  # implicit default
search_lambda_memory_size = 3008
```

**Large site (orchestrator enabled):**
```hcl
# sites/origin-sites/limitedresources/terraform/prod.tfvars
enable_search_orchestrator = true
search_shard_count = 3
search_lambda_memory_size = 5120  # Per-shard memory (can be lower than before)
```

## Backward Compatibility

**Note**: Current usage is modest (~7.5k visits/quarter across all non-listenfairplay sites, no paid users). We can iterate aggressively and accept temporary breakage during development.

**Goal**: Existing sites should continue working, but we don't need to be overly defensive.

- `enable_search_orchestrator = false` (default) = current behavior
- Single search Lambda, single index file
- No orchestrator deployed
- API Gateway → Search Lambda directly

## Implementation Tasks

### Phase 1: Foundation (Estimated: 2-3 days)

#### Task 1.1: Add sharding support to constants/config
- Add `SHARD_ID` and `SHARD_COUNT` environment variable handling to `packages/constants`
- Add `getShardedSearchIndexKey(shardId)` function
- Add shard manifest types to `packages/types`

#### Task 1.2: Update Search Lambda for shard awareness
- Modify `search-indexed-transcripts.ts` to read `SHARD_ID` env var
- When `SHARD_ID` is set, load `search-index/shard-{N}/orama_index.msp` instead of `search-index/orama_index.msp`
- When `SHARD_ID` is not set (default), behave exactly as today
- **Test**: Deploy to `myfavoritemurder` with single shard, verify no regression

### Phase 2: Orchestrator Lambda (Estimated: 2-3 days)

#### Task 2.1: Create search-orchestrator-lambda package
- New package at `packages/search/search-orchestrator-lambda/`
- Handler that:
  1. Receives search request
  2. Invokes all shard Lambdas in parallel via AWS SDK
  3. Collects responses (with timeout handling)
  4. Merges results by score
  5. Returns unified response
- Include health check support for warming

#### Task 2.2: Result merging logic
- Implement over-fetch strategy: request `limit * 2` from each shard
- Merge all results, sort by score descending
- Return top `limit` results
- Handle pagination (naive approach: each shard returns `offset + limit`)

#### Task 2.3: Error handling
- If any shard times out or errors, fail the entire request (simple approach)
- Log which shard failed for debugging
- Future: add partial results support if needed

### Phase 3: Indexing Changes (Estimated: 2-3 days)

#### Task 3.1: Update indexing Lambda for sharded output
- Modify `convert-srts-indexed-search.ts` to:
  1. Read `SHARD_COUNT` from environment (default: 1 = no sharding)
  2. When `SHARD_COUNT > 1`:
     - Calculate episode ranges per shard
     - Create N separate Orama indexes
     - Save to `search-index/shard-{N}/orama_index.msp`
     - Generate `search-index/shard-manifest.json`
  3. When `SHARD_COUNT = 1` (default):
     - Behave exactly as today (single index)

#### Task 3.2: Shard manifest generation
- Create manifest with:
  - Shard count
  - Episode ranges per shard
  - Index file paths
  - Creation timestamp
  - Total episode count

### Phase 4: Terraform & Infrastructure (Estimated: 1-2 days)

#### Task 4.1: Add new terraform variables
- `enable_search_orchestrator` (bool, default: false)
- `search_shard_count` (number, default: 2)

#### Task 4.2: Conditional Lambda creation
- When `enable_search_orchestrator = true`:
  - Create orchestrator Lambda
  - Create N shard Lambdas
  - Don't create single search Lambda
- When `enable_search_orchestrator = false`:
  - Create single search Lambda (current behavior)
  - Don't create orchestrator or shards

#### Task 4.3: Update API Gateway integration
- Point to orchestrator when enabled, single Lambda when disabled

#### Task 4.4: Update EventBridge warming
- When orchestrator enabled, warm the orchestrator (which warms shards)

### Phase 5: Testing & Validation (Estimated: 2-3 days)

#### Task 5.1: Test with `myfavoritemurder` (regression)
- Deploy with `enable_search_orchestrator = false`
- Verify no changes to behavior
- Verify search still works

#### Task 5.2: Test with `limitedresources` (new functionality)
- Deploy with `enable_search_orchestrator = true`, `search_shard_count = 3`
- Run full indexing pipeline
- Verify sharded indexes created
- Verify search returns correct results
- Verify pagination works
- Test cold start behavior

#### Task 5.3: Performance validation
- Compare search latency: single Lambda vs orchestrated
- Measure cold start times
- Verify memory usage per shard is acceptable

### Summary

| Phase | Tasks | Estimate |
|-------|-------|----------|
| 1. Foundation | Constants, Search Lambda updates | 2-3 days |
| 2. Orchestrator | New Lambda, score normalization, distributed pagination | 3-4 days |
| 3. Indexing | Sharded index creation | 2-3 days |
| 4. Terraform | Infrastructure changes | 1-2 days |
| 5. Testing | Validation with real sites | 2-3 days |
| **Total** | | **10-15 days** |

## Design Decisions (Finalized)

| # | Question | Decision | Notes |
|---|----------|----------|-------|
| 1 | Shard boundary calculation | **Auto-calculate** with manual override option | Rare to need >3 shards, manual config fine when needed |
| 2 | Result merging | **Score normalization** | Build it right from the start |
| 3 | Pagination | **Proper distributed pagination** | Users will paginate to page 2, 3, 4, 5+ - results must be consistent |
| 4 | Shard failure handling | **Return partial results** | Mark response as partial, clear error logging. See task for Slack alerts. |
| 5 | API Gateway 30s limit | **Smaller shards (~7GB max)** | Keeps cold starts fast. Accept occasional timeouts, log via goatcounter. |

### Shard Size Target

To keep cold starts under 30 seconds:
- **Target max shard size: ~7GB memory** (decompressed index in RAM)
- This means ~3GB compressed index file in S3
- For `limitedresources` (~10GB+ total): 2 shards should suffice
- For future growth: auto-calculate will add shards as needed

### Error Monitoring (Related Tasks)

- **bds-kmy**: Add error monitoring infrastructure with Slack alerts
- **bds-7dq**: Log client-side search timeouts via goatcounter

---

*Document created: 2024-12-29*  
*Last updated: 2024-12-29*
