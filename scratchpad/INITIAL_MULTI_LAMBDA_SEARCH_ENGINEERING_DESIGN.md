# Multi-Lambda Search Engineering Design Document

## Overview

This document outlines the engineering design for implementing sharded Orama indexes across multiple Lambda functions for sites with large transcript volumes (~900+ hours, approaching 200MB compressed index files). The current architecture uses single Lambda functions for both search indexing and search API operations, which is hitting the 10,240 MB Lambda memory hard cap.

## Current Architecture

### Ingestion Pipeline
1. **RSS Retrieval Lambda** (`rss-retrieval-${site_id}`) - Downloads new audio files to S3
2. **Whisper Transcription Lambda** (`whisper-audio-${site_id}`) - Transcribes audio using OpenAI Whisper, saves `.srt` files to S3
3. **SRT Indexing Lambda** (`srt-indexing-${site_id}`) - Converts SRT files into a single Orama index, saves compressed `.msp` file to S3

### Search Architecture
- **Search API Lambda** (`search-api-${site_id}`) - Loads single Orama index from S3, handles search requests from API Gateway
- **API Gateway v2** - HTTP API endpoint for client search requests
- **Client Application** - React app making HTTP POST requests to search API

### Current File Structure (per site)
```
S3: sites/{site_id}/
├── audio/
│   └── {podcast_name}/
│       └── *.mp3 files
├── transcripts/
│   └── {podcast_name}/
│       └── *.srt files
├── search-index/
│   └── orama_index.msp (single compressed index file)
└── search-entries/
    └── {podcast_name}/
        └── *.json files (intermediate processing)
```

## Proposed Sharded Architecture

### Key Design Decisions

#### 1. Sharding Strategy
- **Temporal-based sharding**: Split transcripts by time periods (e.g., by year or by configurable episode count)
- **Predictable shard boundaries**: Use episode publish dates for deterministic sharding
- **Configurable shard size**: Sites can specify max episodes per shard or time-based boundaries

#### 2. Orchestration Pattern
Replace single Lambdas with orchestration + worker pattern:
- **Orchestration Lambdas**: Coordinate work across multiple worker Lambdas
- **Worker Lambdas**: Process individual shards (indexing or search)
- **Result Aggregation**: Orchestration Lambdas combine results from workers

### New Architecture Components

#### Indexing Pipeline (Sharded Sites)
1. **RSS Retrieval Lambda** - *(unchanged)*
2. **Whisper Transcription Lambda** - *(unchanged)*
3. **SRT Indexing Orchestration Lambda** (`srt-indexing-orchestrator-${site_id}`)
   - Determines sharding strategy from site config
   - Lists all SRT files and groups them into shards
   - Invokes multiple SRT Indexing Worker Lambdas in parallel
   - Coordinates completion and triggers search API refresh
4. **SRT Indexing Worker Lambda** (`srt-indexing-worker-${site_id}`)
   - Processes a specific shard of SRT files
   - Creates partial Orama index for assigned transcripts
   - Saves shard-specific index file to S3

#### Search API Pipeline (Sharded Sites)
1. **Search API Orchestration Lambda** (`search-api-orchestrator-${site_id}`)
   - Determines active shards from S3 index files
   - Invokes multiple Search API Worker Lambdas in parallel
   - Aggregates and sorts results by relevance score
   - Returns unified response to client
2. **Search API Worker Lambda** (`search-api-worker-${site_id}`)
   - Loads and caches a single shard's Orama index
   - Processes search query against its shard
   - Returns scored results to orchestrator

### Updated File Structure (Sharded Sites)
```
S3: sites/{site_id}/
├── audio/ (unchanged)
├── transcripts/ (unchanged)
├── search-index/
│   ├── shard-metadata.json (contains shard info)
│   ├── shard-0/
│   │   └── orama_index.msp
│   ├── shard-1/
│   │   └── orama_index.msp
│   └── shard-N/
│       └── orama_index.msp
└── search-entries/ (unchanged)
```

### Site Configuration Changes

Add optional sharding configuration to `site.config.json`:

```json
{
  "id": "limitedresources",
  // ... existing config ...
  "searchIndexing": {
    "enableSharding": true,
    "shardingStrategy": "temporal",
    "maxEpisodesPerShard": 500,
    "temporalShardBoundaries": ["2020-01-01", "2022-01-01", "2024-01-01"]
  }
}
```

## Implementation Plan

### Phase 1: Infrastructure Setup
- [ ] Create new Lambda module for orchestration pattern
- [ ] Update Terraform to conditionally deploy sharded vs single Lambda architecture
- [ ] Add site config validation for sharding options
- [ ] Create worker Lambda templates for both indexing and search

### Phase 2: Indexing Implementation
- [ ] Implement SRT Indexing Orchestration Lambda
- [ ] Implement SRT Indexing Worker Lambda
- [ ] Add shard metadata management
- [ ] Update constants package for sharded file paths
- [ ] Test with limitedresources site

### Phase 3: Search Implementation
- [ ] Implement Search API Orchestration Lambda
- [ ] Implement Search API Worker Lambda
- [ ] Add result aggregation and scoring logic
- [ ] Update API Gateway integration
- [ ] Test end-to-end search functionality

### Phase 4: Migration & Optimization
- [ ] Create migration script for existing sites
- [ ] Add monitoring and observability
- [ ] Performance testing and optimization
- [ ] Documentation and runbook creation

## Technical Details

### Sharding Logic
```typescript
interface ShardMetadata {
  shardId: string;
  episodeCount: number;
  dateRange: {
    start: string; // ISO date
    end: string;   // ISO date
  };
  indexFileKey: string;
  lastUpdated: string;
}

interface ShardingConfig {
  enableSharding: boolean;
  strategy: 'temporal' | 'episode-count';
  maxEpisodesPerShard?: number;
  temporalBoundaries?: string[]; // ISO dates
}
```

### Worker Lambda Communication
- **Async invocation** for indexing workers (fire-and-forget)
- **Sync invocation** for search workers (need results)
- **Payload size limits**: Use S3 for large data transfer if needed
- **Error handling**: Orchestrator handles worker failures gracefully

### Result Aggregation Strategy
1. Collect results from all search workers
2. Merge and sort by Orama relevance score
3. Apply pagination at orchestrator level
4. Maintain response format compatibility with current client

## Key Questions for User

### 1. Sharding Strategy Preferences
- **Q1**: Do you prefer time-based sharding (e.g., by year) or episode-count-based sharding (e.g., 500 episodes per shard)?
- **Q2**: Should shard boundaries be configurable per site, or use a standard strategy across all sharded sites?
- **Q3**: How important is it to maintain chronological order within search results across shards?

### 2. Migration and Rollout
- **Q4**: Should the sharded architecture be opt-in for specific sites, or eventually replace the single-Lambda architecture for all sites?
- **Q5**: Do you want to maintain backward compatibility with existing index files during migration?
- **Q6**: What's your preferred rollout order for the 3 target sites (limitedresources, myfavoritemurder, naddpod)?

### 3. Performance and Cost Trade-offs
- **Q7**: Are you comfortable with increased Lambda invocation costs (multiple workers per search) in exchange for memory efficiency?
- **Q8**: What's your target search response time for sharded sites? (Current single-Lambda sites aim for <500ms warm)
- **Q9**: Should worker Lambdas have configurable memory sizes, or use a standard size across all workers?

### 4. Operational Considerations
- **Q10**: Do you want the orchestration Lambdas to have retry logic for failed workers, or fail fast?
- **Q11**: Should partial search results be returned if some shards fail, or should the entire search fail?
- **Q12**: How should we handle Lambda concurrency limits if many sites are searching simultaneously?

## Major Risks and Concerns

### 1. Search Result Quality
- **Risk**: Search relevance might be impacted by splitting indexes across shards
- **Mitigation**: Orama's scoring should work consistently across shards, but cross-shard relevance comparison needs testing

### 2. Complexity Increase
- **Risk**: Significant increase in deployment and operational complexity
- **Mitigation**: Comprehensive testing, monitoring, and gradual rollout

### 3. Latency Impact
- **Risk**: Network overhead from orchestrator → worker → orchestrator communication might increase search latency
- **Mitigation**: Use parallel invocations and optimize worker response payloads

### 4. Cost Implications
- **Risk**: Multiple Lambda invocations per search could significantly increase costs
- **Mitigation**: Cost analysis and comparison with current single-Lambda costs

### 5. Synchronization Challenges
- **Risk**: Ensuring all shards are updated consistently during reindexing
- **Mitigation**: Atomic shard metadata updates and proper error handling

### 6. Edge Cases in Sharding Logic
- **Risk**: Episodes spanning shard boundaries, timezone handling, podcast hiatus periods
- **Mitigation**: Robust date parsing and boundary condition testing

### 7. Lambda Concurrency Limits
- **Risk**: AWS Lambda concurrency limits could throttle worker functions under load
- **Mitigation**: Reserved concurrency configuration and graceful degradation

### 8. Cold Start Amplification
- **Risk**: Each worker Lambda cold start adds to overall search latency
- **Mitigation**: Lambda warming strategies and smaller worker function sizes

## Success Criteria

1. **Memory Efficiency**: Sharded sites stay well below 10,240 MB Lambda memory limit
2. **Search Performance**: Sharded search latency remains comparable to current single-Lambda performance
3. **Result Quality**: Search results maintain same relevance and accuracy as current implementation
4. **Operational Stability**: Zero-downtime deployment and reliable error handling
5. **Cost Efficiency**: Per-search costs remain reasonable compared to current architecture

## Open Technical Questions

1. **Shard Discovery**: How should orchestration Lambdas efficiently discover available shards?
2. **Index Versioning**: How do we handle partial shard updates during reindexing?
3. **Worker Lambda Sizing**: What's the optimal memory allocation for worker Lambdas?
4. **Caching Strategy**: Should worker Lambdas cache indexes across invocations, or reload each time?
5. **Error Recovery**: How should the system handle scenarios where some shards are unavailable?

---

*This document will be updated as we gather answers to the questions above and begin implementation.*