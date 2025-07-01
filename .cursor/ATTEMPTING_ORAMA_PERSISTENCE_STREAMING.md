# Orama Streaming Persistence Implementation

## Problem
- Orama's built-in persistence plugin has a 512MB limit due to JavaScript string length limits
- Current approach fails with "Invalid string length" error when serializing large indexes
- Our index has 380K+ search entries (~5GB in memory) which exceeds the string limit

## Solution: Streaming Persistence with MsgPack
Based on prototype from: https://github.com/oramasearch/orama/issues/851#issuecomment-2888461388

### Implementation Plan

#### Phase 1: Setup Dependencies ✅
- ✅ Checked @msgpack/msgpack availability (v3.1.2 installed)
- ✅ Added compression support (gzip only - zstd requires external package)

#### Phase 2: Create Streaming Persistence Functions ✅
- ✅ `persistToFileStreaming()` - replaces `serializeOramaIndex()`
- ✅ `restoreFromFileStreaming()` - for reading back the index
- ✅ Support compression options: none, gzip (zstd removed due to Node.js limitations)

#### Phase 3: Update Database Module ✅
- ✅ Replace `serializeOramaIndex()` with streaming approach
- ✅ Use Orama's `save()` function instead of `persist()`
- ✅ Return file path instead of Buffer
- ✅ Export new functions and types

#### Phase 4: Update SRT Indexing Lambda ✅
- ✅ Modify to use new streaming persistence
- ✅ Update file handling logic for S3 upload
- ✅ Build completed successfully

#### Phase 5: Testing (IN PROGRESS)
- ✅ **myfavoritemurder dataset (380K entries)**: SUCCESS! 
  - Persisted 152.20 MB compressed file
  - Memory peaked at ~5GB but stayed well under limits
  - No string length errors
  - S3 upload successful
- ❌ **claretandblue dataset (206K entries)**: FAILED with MsgPack depth limit
  - Error: "Too deep objects in depth 101"
  - MsgPack encoder hits maximum object depth (100 levels)
  - Memory usage was reasonable (~2.7GB)
  - Same search entry structure as myfavoritemurder

#### Phase 6: Handle Search Lambda Integration
- 🔄 Test that persisted files work with `search-indexed-transcripts.ts`
- 🔄 Update search lambda to use `restoreFromFileStreaming()`
- 🔄 Verify compressed files decompress correctly

## Edge Case Analysis: MsgPack Depth Limit

**Problem**: MsgPack has a default maximum object depth of 100 levels. For some reason, claretandblue's Orama index structure exceeds this depth while myfavoritemurder (which is larger) does not.

**Potential Causes**:
- Different internal Orama tree structures based on data patterns
- Text content/length variations affecting indexing depth  
- B-tree or trie depth varies with data distribution

**Potential Solutions**:
1. **Increase MsgPack depth limit** using `maxDepth` option
2. **Fallback to JSON serialization** for problematic cases
3. **Alternative chunking approach** for deep structures
4. **Investigate Orama index differences** between sites

## Key Benefits
- No string length limits (streaming approach)
- Better compression (MsgPack + gzip/zstd)
- Lower memory usage during serialization
- Proven to work with large datasets

## Implementation Notes
- Using MsgPack for binary serialization (more efficient than JSON)
- Streaming prevents large string creation
- Compression reduces final file size significantly
- zstd offers best compression ratio + speed balance