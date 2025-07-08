# Environment Variable Audit: SITE_ID vs CURRENT_SITE_ID

## Summary

Currently, the codebase uses both `SITE_ID` and `CURRENT_SITE_ID` (and in some cases `SELECTED_SITE_ID`) for site identification. This creates confusion and bugs, especially when functions expect `CURRENT_SITE_ID` to be available but only `SITE_ID` is set in AWS Lambda environments.

**Recommendation**: Standardize on `SITE_ID` only, since this is already configured in AWS Lambda environments via Terraform.

## ✅ COMPLETED MIGRATION

**Status**: All changes have been implemented successfully!

**Date Completed**: Today

## Previous State Analysis

### AWS Lambda Environment Variables (via Terraform)
✅ **Already using `SITE_ID`** - All Lambda functions have `SITE_ID` set via `terraform/sites/main.tf`:
- `rss-retrieval-${site_id}`: `SITE_ID = var.site_id`
- `whisper-transcription-${site_id}`: `SITE_ID = var.site_id`  
- `srt-indexing-${site_id}`: `SITE_ID = var.site_id`
- `search-api-${site_id}`: `SITE_ID = var.site_id`

## Files Requiring Changes

### 1. Package: `@browse-dot-show/constants` 
**File**: `packages/constants/index.ts`
**Current**: 
```typescript
const siteId = process.env.SITE_ID || process.env.CURRENT_SITE_ID;
if (!siteId) {
  throw new Error('SITE_ID or CURRENT_SITE_ID environment variable is required');
}
```
**Change**: Remove `CURRENT_SITE_ID` fallback, only use `SITE_ID`

### 2. Package: `@browse-dot-show/config`
**File**: `packages/config/rss-config.ts`
**Current**: Uses `process.env.CURRENT_SITE_ID`
**Change**: Switch to `process.env.SITE_ID`

### 3. Package: `@browse-dot-show/s3`
**File**: `packages/s3/client.ts`
**Current**: 
```typescript
const siteId = process.env.SITE_ID || process.env.CURRENT_SITE_ID;
```
And separately:
```typescript
const siteId = process.env.CURRENT_SITE_ID;
```
**Change**: Remove all `CURRENT_SITE_ID` usage, standardize on `SITE_ID`

### 4. Lambda Functions

#### A. Process Audio Lambda
**File**: `packages/ingestion/process-audio-lambda/process-new-audio-files-via-whisper.ts`
**Current**: Uses `process.env.CURRENT_SITE_ID`
**Change**: Switch to `process.env.SITE_ID`

#### B. RSS Retrieval Lambda  
**File**: `packages/ingestion/rss-retrieval-lambda/retrieve-rss-feeds-and-download-audio-files.ts`
**Current**: Uses `getCurrentSiteId()` from config package (which reads `CURRENT_SITE_ID`)
**Change**: Update to use `SITE_ID` (may need to call constants package instead)

#### C. SRT Indexing Lambda
**File**: `packages/ingestion/srt-indexing-lambda/convert-srts-indexed-search.ts`
✅ **Already correct** - Uses `process.env.SITE_ID`

### 5. Scripts (Update to set `SITE_ID` instead of `CURRENT_SITE_ID`)

#### A. Site Selection Wrapper
**File**: `scripts/run-with-site-selection.ts`
**Current**: Sets both `SELECTED_SITE_ID` and `CURRENT_SITE_ID`
**Change**: Remove `CURRENT_SITE_ID`, optionally keep `SELECTED_SITE_ID` for build-specific needs

#### B. Lambda Runners
**Files**: 
- `scripts/run-lambda-for-site.ts`
- `scripts/build-lambda-for-site.ts`
**Current**: Set `process.env.CURRENT_SITE_ID = siteId`
**Change**: Set `process.env.SITE_ID = siteId` instead

#### C. Batch Processing Scripts
**Files**:
- `scripts/run-all-ingestion-lambdas-for-all-sites.ts`
- `scripts/run-combined-retrieve-and-process-all-sites.ts` 
- `scripts/scheduled-run-ingestion-and-trigger-indexing.ts`
**Current**: Set both `CURRENT_SITE_ID` and other variables
**Change**: Replace with `SITE_ID`

#### D. Other Scripts
**Files**:
- `scripts/backfill-downloaded-at-timestamps.ts`
- `scripts/s3-sync.ts`
**Current**: Use fallback patterns like `process.env.CURRENT_SITE_ID || process.env.SELECTED_SITE_ID`
**Change**: Simplify to use `SITE_ID` only

### 6. Validation Package
**File**: `packages/validation/check-file-consistency.ts`
**Current**: Sets `process.env.CURRENT_SITE_ID = siteId`
**Change**: Set `process.env.SITE_ID = siteId` instead

### 7. Build Systems (Decision Needed)

#### Client Build
**File**: `packages/client/vite.config.ts`
**Current**: Uses `process.env.SELECTED_SITE_ID || process.env.SITE_ID`
**Decision**: Keep `SELECTED_SITE_ID` for build contexts, but ensure `SITE_ID` fallback works

#### Build Scripts
**Files**:
- `packages/client/build-sites.js`
- `packages/homepage/build-sites.js`
**Current**: Set both `SELECTED_SITE_ID` and `SITE_ID`
**Decision**: May keep `SELECTED_SITE_ID` for build process, ensure `SITE_ID` is also set

## Implementation Strategy

### Phase 1: Update Core Packages
1. Update `@browse-dot-show/constants` to only use `SITE_ID`
2. Update `@browse-dot-show/config` to use `SITE_ID`
3. Update `@browse-dot-show/s3` to only use `SITE_ID`

### Phase 2: Update Lambda Functions
1. Fix `process-audio-lambda` to use `SITE_ID`
2. Fix `rss-retrieval-lambda` to use `SITE_ID`
3. Verify `srt-indexing-lambda` continues working (already correct)

### Phase 3: Update Scripts
1. Update all script files to set `SITE_ID` instead of `CURRENT_SITE_ID`
2. Remove redundant environment variable setting
3. Update fallback patterns to use `SITE_ID` only

### Phase 4: Clean Up Tests
1. Update `packages/s3/client.spec.ts` to test `SITE_ID` instead of `CURRENT_SITE_ID`
2. Verify all tests pass with new environment variable usage

### Phase 5: Documentation
1. Update validation package documentation
2. Update any README files that reference `CURRENT_SITE_ID`

## Testing Strategy

1. **Local Development**: Ensure all scripts work when only `SITE_ID` is set
2. **Lambda Functions**: Test that all ingestion and search lambdas work with just `SITE_ID`
3. **Build Process**: Verify client builds work correctly
4. **Cross-environment**: Test both local and AWS environments

## Potential Issues to Watch For

1. **Build Systems**: May need to decide if `SELECTED_SITE_ID` should remain for build-specific contexts
2. **Legacy Scripts**: Some scripts may have been written assuming `CURRENT_SITE_ID` availability
3. **Environment Loading**: Scripts that load site-specific `.env.aws-sso` files may need updates

## Files That Will NOT Need Changes

- Terraform configuration (already sets `SITE_ID` correctly)
- Search lambda (already uses `SITE_ID` via constants package)
- Any files that only read environment variables and use the constants package

## Validation Checklist

- [ ] All Lambda functions work in AWS environment
- [ ] All local development scripts work 
- [ ] All build processes work
- [ ] All validation and consistency checks work
- [ ] No references to `CURRENT_SITE_ID` remain in code
- [ ] Tests pass
- [ ] Documentation updated