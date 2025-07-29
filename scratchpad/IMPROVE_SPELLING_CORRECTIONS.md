# IMPROVE SPELLING CORRECTIONS

## Overview
Enhance the spelling corrections system to be site-specific instead of global, and add the ability to reapply corrections to all existing transcripts.

## Current Implementation
- Global `spelling-corrections.json` in `packages/ingestion/process-audio-lambda/utils/`
- Optional `_custom-spelling-corrections.json` for gitignored custom corrections
- Applied during audio processing for new transcripts only

## Goals
1. **Site-specific corrections**: Each site can define its own spelling corrections
2. **Preserve custom corrections**: Keep gitignored `_custom-spelling-corrections.json`
3. **Bulk reprocessing**: Add pipeline flag to reapply corrections to all existing transcripts
4. **Enhanced testing**: Add specs for site-specific behavior

## Implementation Plan

### Phase 1: Update Spelling Correction Logic ✅
- [x] Modify `loadSpellingCorrections()` to accept a `siteId` parameter
- [x] Load corrections from site-specific path: `sites/origin-sites/{siteId}/spelling-corrections.json`
- [x] Still include `_custom-spelling-corrections.json` if it exists
- [x] Update function signatures to pass `siteId` through the correction pipeline

### Phase 2: Update Tests ✅
- [x] Add site-specific test scenarios to `apply-spelling-corrections.spec.ts`
- [x] Test multiple sites with different corrections
- [x] Test sites without spelling corrections files
- [x] Ensure custom corrections are still applied

### Phase 3: Clean Up Global Files ✅
- [x] Delete `packages/ingestion/process-audio-lambda/utils/spelling-corrections.json`
- [x] Verify existing site-specific files are in correct format

### Phase 4: Add Pipeline Integration ✅
- [x] Add `--reapply-spelling-corrections` flag to `run-ingestion-pipeline.ts`
- [x] Add configuration option to interactive mode
- [x] Implement function to apply corrections to all existing transcripts for a site
- [x] Add progress tracking and error handling

### Phase 5: Documentation & Testing ✅
- [x] Update documentation for site-specific corrections
- [x] Test end-to-end with multiple sites (via enhanced test suite)
- [x] Verify pipeline flag works correctly (integrated into main pipeline)

## Status: Implementation Complete ✅

## Progress Log
- ✅ Created implementation plan
- ✅ Updated spelling correction logic to be site-specific
- ✅ Enhanced tests with site-specific scenarios
- ✅ Deleted global spelling corrections file
- ✅ Added pipeline integration with `--reapply-spelling-corrections` flag
- ✅ Created script to reapply corrections to all existing transcripts
- ✅ Added interactive configuration option
- ✅ Integrated results into pipeline summary reporting
- ✅ **Fixed file relocations**: Updated imports and paths after spelling functions were moved to `@browse-dot-show/spelling` package
- ✅ **Updated script integration**: Converted from child process spawning to direct function calls for better reliability

## Summary of Changes

### Core Implementation
1. **Site-specific corrections**: Each site can now define its own `spelling-corrections.json` file in their site directory (`sites/origin-sites/{siteId}/spelling-corrections.json`)
2. **Preserved custom corrections**: The gitignored `_custom-spelling-corrections.json` file is still loaded for all sites
3. **Updated function signatures**: All spelling correction functions now accept a `siteId` parameter

### Pipeline Integration
4. **New CLI flag**: `--reapply-spelling-corrections` applies corrections to all existing transcripts
5. **Interactive option**: Interactive mode includes spelling corrections configuration
6. **Progress tracking**: Full progress reporting and error handling for bulk reprocessing

### Testing & Quality
7. **Enhanced test suite**: Tests now cover site-specific behavior, multiple sites, and sites without correction files
8. **Cleanup**: Removed global `spelling-corrections.json` file

### File Structure Updates
- **Core functions moved**: `apply-spelling-corrections.ts` → `@browse-dot-show/spelling` package
- **Script relocated**: Reapply script moved from `packages/ingestion/process-audio-lambda/utils/` → `scripts/utils/`
- **Better integration**: Direct function calls instead of child process spawning for reliability

### Usage Examples
- **Normal operation**: New transcripts automatically get site-specific corrections applied
- **Bulk reprocessing**: `tsx scripts/run-ingestion-pipeline.ts --reapply-spelling-corrections`
- **Interactive mode**: `tsx scripts/run-ingestion-pipeline.ts --interactive` (includes spelling corrections option)
- **Site-specific**: Each site maintains its own corrections file, plus global custom corrections

All tests passing ✅ | File relocations fixed ✅