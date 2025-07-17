# Ingestion Pipeline Refactoring Implementation Plan

## Current Issues Identified

### Bug 1: Premature S3 Sync Consistency Check
- **Problem**: Phase 0.5 currently checks both directions of sync:
  - Files missing locally (from S3) ✅ This is correct
  - Files missing in S3 (from local) ❌ This is premature
- **Issue**: The second check should happen AFTER the ingestion pipeline runs, not before, because new files may be created during RSS download and transcription.

### Bug 2: Exclusion of Search Directories
- **Problem**: Currently excludes `search-entries` and `search-index` from S3 sync
- **Issue**: Running indexing on AWS Lambda has become expensive, so we want to:
  1. Run indexing locally 
  2. Include search directories in S3 sync
  3. Remove AWS Lambda indexing trigger

## New Phase Structure

### Phase 1: Pre-Sync Check (Fixed)
- **Purpose**: Download any files from S3 that don't exist locally
- **Action**: Only check for files missing locally from S3
- **Implementation**: Modify sync consistency checker to have two modes:
  - `pre-sync`: Only identify files missing locally
  - `post-sync`: Full bidirectional comparison

### Phase 2: RSS Download 
- **Purpose**: Download new episodes from RSS feeds for each site
- **No changes needed**

### Phase 3: Transcription
- **Purpose**: Transcribe any new audio files for each site  
- **No changes needed**

### Phase 4: Local Indexing (New/Enhanced)
- **Purpose**: Run indexing function locally for sites that have new files
- **Trigger Condition**: Only run if new files exist (from any of previous phases)
- **Implementation**: 
  - Track which sites have new files from RSS download or transcription
  - Run local indexing only for those sites
  - Include search directories in file tracking

### Phase 5: Final S3 Sync (Enhanced)
- **Purpose**: Sync all new files to S3, including search results
- **Changes**:
  - Include `search-entries` and `search-index` in sync folders
  - Perform full bidirectional consistency check at this point
  - Upload any files that exist locally but not in S3

### Removed: AWS Lambda Indexing Trigger
- **Rationale**: Cost optimization - run indexing locally instead
- **Implementation**: Remove Phase 4 cloud indexing logic entirely

## Key Implementation Changes

### 1. Update Sync Folders List
```typescript
// Add search directories to ALL_SYNC_FOLDERS
const ALL_SYNC_FOLDERS = [
  'audio',
  'transcripts', 
  'episode-manifest',
  'rss',
  'search-entries',  // ✅ Added
  'search-index'     // ✅ Added
];
```

### 2. Enhance Sync Consistency Checker
```typescript
// Add mode parameter to control checking behavior
interface SyncConsistencyMode {
  checkLocalOnly: boolean;  // Phase 1: only files missing locally
  checkBidirectional: boolean;  // Phase 5: full sync check
}
```

### 3. Track Sites with New Files
```typescript
interface SiteProcessingResult {
  // ... existing fields
  hasNewFiles: boolean;  // Track if ANY new files were created
  needsLocalIndexing: boolean;  // Derived from hasNewFiles
}
```

### 4. Conditional Local Indexing
- Only run local indexing for sites with `hasNewFiles = true`
- Update progress tracking to show which sites are being processed

### 5. Remove Cloud Indexing Phase
- Remove `triggerIndexingLambda` function usage
- Remove AWS Lambda triggering logic
- Remove related configuration options

## Implementation Steps

1. **Update constants and folder lists** - Add search directories
2. **Modify sync consistency checker** - Add mode-based checking  
3. **Update phase logic** - Split consistency checking into two phases
4. **Add file tracking** - Track which sites have new files
5. **Implement conditional indexing** - Only index sites with new files
6. **Remove cloud indexing** - Remove AWS Lambda trigger logic
7. **Update documentation** - Reflect new phase structure in help text
8. **Test end-to-end** - Verify the complete workflow

## Expected Benefits

1. **Cost Reduction**: Local indexing instead of expensive AWS Lambda calls
2. **Correctness**: Proper timing of sync consistency checks  
3. **Efficiency**: Only run indexing for sites that actually need it
4. **Completeness**: Include search results in S3 sync for consistency

## Backward Compatibility

- All existing CLI flags and options remain functional
- Phase numbering updated but core functionality preserved
- Dry-run mode will reflect new phase structure