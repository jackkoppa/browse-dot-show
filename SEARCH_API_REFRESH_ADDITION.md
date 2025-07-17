# Search-API Lambda Refresh Addition

## ✅ Additional Enhancement Implemented

Following the main ingestion pipeline refactoring, an additional enhancement was implemented to ensure search consistency across warm Lambda instances.

## 🔧 Enhancement Details

### Problem
After the ingestion pipeline uploads new search index files to S3, any existing warm search-api Lambda instances still have the old index files cached in memory. This could lead to inconsistent search results until those instances are refreshed.

### Solution
Added automatic search-api Lambda refresh functionality that triggers after successful S3 uploads in Phase 5, using the same pattern as the SRT indexing function.

## 📋 Implementation

### 1. New Function: `triggerSearchApiLambdaRefresh()`

```typescript
async function triggerSearchApiLambdaRefresh(
  siteId: string,
  credentials: AutomationCredentials
): Promise<{ success: boolean; duration: number; error?: string }>
```

**Features**:
- Assumes the automation role for the site's AWS account
- Invokes `search-api-${siteId}` Lambda with `forceFreshDBFileDownload: true`
- Uses asynchronous invocation (Event type)
- Comprehensive error handling and logging

### 2. Integration into Phase 5

**Trigger Conditions**:
- Only after successful S3 sync
- Only for sites that actually uploaded files (`totalFilesTransferred > 0`)
- Runs immediately after S3 upload completion

**Logic Flow**:
```
S3 Upload Successful AND Files Uploaded > 0
  ↓ 
Trigger search-api Lambda refresh
  ↓
Log results and track success/failure
```

### 3. Enhanced Results Tracking

**New Fields**:
- `searchApiRefreshSuccess?: boolean`
- `searchApiRefreshDuration?: number`

**Reporting**:
- Per-site results showing refresh status
- Overall statistics with success rates
- Comprehensive error logging

## 🎯 Benefits

### 1. ✅ Search Consistency
- Ensures all Lambda instances have the latest index files
- Eliminates potential search result inconsistencies
- Immediate availability of new content in search

### 2. ✅ Automatic Operation
- No manual intervention required
- Conditional execution (only when needed)
- Integrated into existing pipeline flow

### 3. ✅ Robust Error Handling
- Graceful handling of Lambda invocation failures
- Detailed error reporting and logging
- Non-blocking (pipeline continues even if refresh fails)

## 📊 Output Examples

### Per-Site Results
```
hardfork (Hard Fork):
   Phase 1 - Pre-sync: ✅ (2.1s) - 0 files downloaded
   Phase 2 - RSS: ✅ (15.3s) - 2 new audio files
   Phase 3 - Audio: ✅ (180.5s) - 2 episodes transcribed
   Phase 4 - Local Index: ✅ (45.2s) - 1247 entries
   Phase 5 - Final Sync: ✅ (8.7s)
   S3 Upload: ✅ (8.7s) - 127 files uploaded
   Search-API Refresh: ✅ (1.2s)
   📂 Has new files: ✅
```

### Overall Statistics
```
Search-API refresh success rate: 3/3 (100.0%)
Sites with successful uploads: 3/5
```

## 🔄 Backward Compatibility

- ✅ Non-breaking change - only additive functionality
- ✅ Existing error handling preserves pipeline completion
- ✅ Optional functionality - pipeline works without it
- ✅ Follows existing automation role patterns

## 🧪 Testing

- ✅ Script compiles successfully with new functionality
- ✅ Help text and dry-run mode updated appropriately
- ✅ Conditional logic properly implemented
- ✅ Error handling verified

## 📝 Files Modified

1. **`scripts/run-ingestion-pipeline.ts`** - Added search-api Lambda refresh functionality
2. **`IMPLEMENTATION_SUMMARY.md`** - Updated to include new functionality  
3. **`SEARCH_API_REFRESH_ADDITION.md`** - This documentation

## 🎉 Enhancement Complete

The search-api Lambda refresh functionality has been successfully integrated into the ingestion pipeline, ensuring:

- ✅ Consistent search results across all Lambda instances
- ✅ Immediate availability of new content in search
- ✅ Automatic operation with robust error handling
- ✅ Seamless integration with existing pipeline flow

This enhancement complements the main refactoring by ensuring the entire search infrastructure stays synchronized after updates.