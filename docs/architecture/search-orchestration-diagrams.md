# Search Orchestration - Architecture Diagrams

> Supporting diagrams for the Search Orchestration architecture (bds-a8r)

## Current Architecture (Single Lambda)

```
                                    browse.show Site (e.g., myfavoritemurder)
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                          │
│   ┌──────────┐      ┌─────────────┐      ┌──────────────────────────────────┐           │
│   │  User    │      │             │      │        Search Lambda             │           │
│   │ Browser  │─────▶│ API Gateway │─────▶│   search-api-{site_id}           │           │
│   │          │◀─────│             │◀─────│                                  │           │
│   └──────────┘      └─────────────┘      │  ┌────────────────────────────┐  │           │
│                                          │  │     Orama Index            │  │           │
│                                          │  │     (in memory)            │  │           │
│                                          │  │     ~5-10GB decompressed   │  │           │
│                                          │  └────────────────────────────┘  │           │
│                                          └──────────────┬───────────────────┘           │
│                                                         │                               │
│                                                         │ Downloads on                  │
│                                                         │ cold start                    │
│                                                         ▼                               │
│                                          ┌──────────────────────────────────┐           │
│                                          │            S3 Bucket             │           │
│                                          │   {site_id}-browse-dot-show      │           │
│                                          │                                  │           │
│                                          │   search-index/                  │           │
│                                          │     └── orama_index.msp          │           │
│                                          │         (~1-3GB compressed)      │           │
│                                          └──────────────────────────────────┘           │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘

LIMITATION: Lambda memory ceiling is 10GB. Large sites (800+ episodes) exceed this.
```

## Proposed Architecture (Orchestrated Shards)

```
                                    browse.show Site (e.g., limitedresources)
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                  │
│   ┌──────────┐      ┌─────────────┐      ┌──────────────────────────────────┐                   │
│   │  User    │      │             │      │     Search Orchestrator          │                   │
│   │ Browser  │─────▶│ API Gateway │─────▶│  search-orchestrator-{site_id}   │                   │
│   │          │◀─────│             │◀─────│                                  │                   │
│   └──────────┘      └─────────────┘      │  • Fans out to shards            │                   │
│                                          │  • Merges results                │                   │
│                                          │  • Handles pagination            │                   │
│                                          └──────────────┬───────────────────┘                   │
│                                                         │                                       │
│                              ┌───────────────────────────┼───────────────────────────┐          │
│                              │                           │                           │          │
│                              ▼                           ▼                           ▼          │
│               ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│               │    Search Lambda        │ │    Search Lambda        │ │    Search Lambda        │
│               │    Shard 1              │ │    Shard 2              │ │    Shard 3              │
│               │    (episodes 1-300)     │ │    (episodes 301-600)   │ │    (episodes 601+)      │
│               │                         │ │                         │ │                         │
│               │  ┌───────────────────┐  │ │  ┌───────────────────┐  │ │  ┌───────────────────┐  │
│               │  │  Orama Index      │  │ │  │  Orama Index      │  │ │  │  Orama Index      │  │
│               │  │  ~3GB each        │  │ │  │  ~3GB each        │  │ │  │  ~3GB each        │  │
│               │  └───────────────────┘  │ │  └───────────────────┘  │ │  └───────────────────┘  │
│               └────────────┬────────────┘ └────────────┬────────────┘ └────────────┬────────────┘
│                            │                           │                           │            │
│                            ▼                           ▼                           ▼            │
│               ┌──────────────────────────────────────────────────────────────────────────────┐  │
│               │                              S3 Bucket                                       │  │
│               │                      {site_id}-browse-dot-show                               │  │
│               │                                                                              │  │
│               │   search-index/                                                              │  │
│               │     ├── shard-manifest.json    ← Shard configuration                        │  │
│               │     ├── shard-1/                                                             │  │
│               │     │     └── orama_index.msp  ← Episodes 1-300                             │  │
│               │     ├── shard-2/                                                             │  │
│               │     │     └── orama_index.msp  ← Episodes 301-600                           │  │
│               │     └── shard-3/                                                             │  │
│               │           └── orama_index.msp  ← Episodes 601+                              │  │
│               └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

BENEFIT: Each shard stays under memory limit. Can scale to any catalog size.
```

## Search Request Flow (Orchestrated)

```
┌─────────┐                                                                              
│ Client  │                                                                              
└────┬────┘                                                                              
     │                                                                                   
     │ POST /search { query: "murder", limit: 10 }                                       
     ▼                                                                                   
┌─────────────┐                                                                          
│ API Gateway │                                                                          
└─────┬───────┘                                                                          
      │                                                                                  
      ▼                                                                                  
┌──────────────────┐                                                                     
│   Orchestrator   │                                                                     
│                  │                                                                     
│  1. Parse request│                                                                     
│  2. Fan out      │─────────────────┬─────────────────┬─────────────────┐              
│                  │                 │                 │                 │              
└────────┬─────────┘                 │                 │                 │              
         │                           ▼                 ▼                 ▼              
         │                    ┌───────────┐     ┌───────────┐     ┌───────────┐        
         │                    │  Shard 1  │     │  Shard 2  │     │  Shard 3  │        
         │                    │           │     │           │     │           │        
         │                    │ Returns:  │     │ Returns:  │     │ Returns:  │        
         │                    │ 15 hits   │     │ 8 hits    │     │ 12 hits   │        
         │                    │ score:    │     │ score:    │     │ score:    │        
         │                    │ 0.9-0.3   │     │ 0.7-0.2   │     │ 0.8-0.25  │        
         │                    └─────┬─────┘     └─────┬─────┘     └─────┬─────┘        
         │                          │                 │                 │              
         │                          └─────────────────┴─────────────────┘              
         │                                            │                                
         ▼                                            ▼                                
┌──────────────────┐                                                                   
│   Orchestrator   │◀─────────────────────────────────┘                                
│                  │                                                                   
│  3. Merge results│  Combined: 35 hits                                                
│  4. Sort by score│  Sorted by relevancy                                              
│  5. Apply limit  │  Return top 10                                                    
│                  │                                                                   
└────────┬─────────┘                                                                   
         │                                                                             
         ▼                                                                             
┌─────────────┐                                                                        
│ API Gateway │                                                                        
└─────┬───────┘                                                                        
      │                                                                                
      │ { hits: [...], totalHits: 35, processingTimeMs: 450 }                          
      ▼                                                                                
┌─────────┐                                                                            
│ Client  │                                                                            
└─────────┘                                                                            
```

## Indexing Flow (Sharded)

```
                          Indexing Lambda (srt-indexing-{site_id})
                          ─────────────────────────────────────────
                                            │
                                            │ 1. Load episode manifest
                                            │ 2. Load shard configuration
                                            ▼
                          ┌─────────────────────────────────────────┐
                          │         Episode Manifest                │
                          │                                         │
                          │  episodes: [                            │
                          │    { id: 1, fileKey: "2015-01-01_..." },│
                          │    { id: 2, fileKey: "2015-01-08_..." },│
                          │    ...                                  │
                          │    { id: 823, fileKey: "2024-12-15_..."}│
                          │  ]                                      │
                          └─────────────────────────────────────────┘
                                            │
                                            │ 3. Partition episodes by shard
                                            ▼
              ┌─────────────────────────────┼─────────────────────────────┐
              │                             │                             │
              ▼                             ▼                             ▼
    ┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
    │ Shard 1: ep 1-300   │     │ Shard 2: ep 301-600 │     │ Shard 3: ep 601-823 │
    │                     │     │                     │     │                     │
    │ Load search entries │     │ Load search entries │     │ Load search entries │
    │ Build Orama index   │     │ Build Orama index   │     │ Build Orama index   │
    │ Compress (zstd)     │     │ Compress (zstd)     │     │ Compress (zstd)     │
    └──────────┬──────────┘     └──────────┬──────────┘     └──────────┬──────────┘
               │                           │                           │
               │                           │                           │
               ▼                           ▼                           ▼
    ┌─────────────────────────────────────────────────────────────────────────────┐
    │                                    S3                                       │
    │                                                                             │
    │   search-index/                                                             │
    │     ├── shard-manifest.json                                                 │
    │     ├── shard-1/orama_index.msp                                             │
    │     ├── shard-2/orama_index.msp                                             │
    │     └── shard-3/orama_index.msp                                             │
    │                                                                             │
    └─────────────────────────────────────────────────────────────────────────────┘
```

## Configuration Flow

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         Site Configuration                                │
│                                                                           │
│  sites/origin-sites/limitedresources/terraform/prod.tfvars               │
│  ──────────────────────────────────────────────────────────               │
│                                                                           │
│  # Enable orchestration for large site                                    │
│  enable_search_orchestrator = true                                        │
│  search_shard_count = 3                                                   │
│                                                                           │
│  # Memory per shard (optional, can be lower than single-lambda config)    │
│  search_lambda_memory_size = 4096                                         │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ terraform apply
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         AWS Resources Created                             │
│                                                                           │
│  When enable_search_orchestrator = true:                                  │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Lambda Functions:                                                   │  │
│  │   • search-orchestrator-limitedresources                            │  │
│  │   • search-api-limitedresources-shard-1                             │  │
│  │   • search-api-limitedresources-shard-2                             │  │
│  │   • search-api-limitedresources-shard-3                             │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ API Gateway:                                                        │  │
│  │   • Route: / → search-orchestrator-limitedresources                 │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ EventBridge (warming):                                              │  │
│  │   • Warms orchestrator + all shards every 5 minutes                 │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────┐
│                         Default Configuration                             │
│                                                                           │
│  sites/origin-sites/hardfork/terraform/prod.tfvars                       │
│  ──────────────────────────────────────────────────                       │
│                                                                           │
│  # Small site - no orchestration needed (default)                         │
│  # enable_search_orchestrator = false  (implicit default)                 │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ terraform apply
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         AWS Resources Created                             │
│                                                                           │
│  When enable_search_orchestrator = false (default):                       │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Lambda Functions:                                                   │  │
│  │   • search-api-hardfork  (single Lambda, unchanged from today)      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ API Gateway:                                                        │  │
│  │   • Route: / → search-api-hardfork                                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  No changes from current architecture!                                    │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

*These diagrams accompany the main architecture document at `docs/architecture/search-orchestration.md`*
