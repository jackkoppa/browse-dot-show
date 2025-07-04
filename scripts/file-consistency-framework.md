# File Consistency Checker Framework

This document outlines the file consistency checks that should be performed for the downloadedAt implementation.

## Overview

The file consistency checker should scan all files (audio, transcripts, search entries) and the episode manifest to identify inconsistencies, missing files, and version conflicts.

## Files to Check

### 1. Audio Files
- **Location**: `audio/{podcastId}/*.mp3`
- **Format**: `{YYYY-MM-DD}_{sanitized-title}[--{unix-timestamp}].mp3`
- **Examples**: 
  - `2024-07-25_Simple_Episode_Title.mp3` (old format)
  - `2024-07-25_Simple_Episode_Title--1721921400000.mp3` (new format)

### 2. Transcript Files  
- **Location**: `transcripts/{podcastId}/*.srt`
- **Format**: Same as audio files but with `.srt` extension
- **Should match**: Corresponding audio file exactly

### 3. Search Entry Files
- **Location**: `search-entries/{podcastId}/*.json`
- **Format**: Same as audio files but with `.json` extension  
- **Should match**: Corresponding audio file exactly

### 4. Episode Manifest
- **Location**: `episode-manifest.json`
- **Contains**: Array of episode metadata with `downloadedAt` field

## Consistency Checks

### 🔴 Critical Errors (Exit Code 1)

#### Missing Files
- **Audio exists, transcript missing**: Processing failure in audio lambda
- **Audio exists, search entry missing**: Processing failure in SRT indexing lambda
- **Manifest entry has no files**: Orphaned manifest entry

#### Parse Errors
- **File names that don't match expected format**: Manual review needed
- **Corrupt manifest**: Cannot parse JSON

#### Manifest Mismatches
- **Files exist but not in manifest**: Manifest update needed
- **Manifest downloadedAt doesn't match any file version**: Data inconsistency

### 🟡 Warnings (Exit Code 2)

#### Orphaned Files
- **Transcript exists, no audio**: Can usually be safely deleted
- **Search entry exists, no audio**: Can usually be safely deleted

#### Duplicate Versions
- **Same episode with multiple downloadedAt timestamps**: Cleanup needed
- **Example**: Both `episode--1721921400000.mp3` and `episode--1721925000000.mp3` exist

### 🔵 Info (Exit Code 0)
- **No issues found**: All files are consistent

## Implementation Strategy

### ✅ Chosen Approach: Standalone Script in packages/validation
**Decision**: Implement as a local script in `packages/validation/` that can be run manually

```bash
# Implementation location
cd packages/validation
touch check-file-consistency.ts
# Implement using existing @browse-dot-show packages
```

**Benefits**:
- Access to all existing `@browse-dot-show` package imports
- No module resolution issues
- Can be run locally for validation before migrations
- No need for Lambda deployment complexity

### Alternative Options (Not Chosen)
- **Option 2: Lambda Integration** - Add consistency check to existing lambdas
- **Option 3: Separate Validation Package** - Create dedicated consistency checker

## Sample Report Format

```
📊 FILE CONSISTENCY REPORT
==================================================

📈 SUMMARY:
  Audio Files: 1,250
  Transcript Files: 1,245
  Search Entry Files: 1,240
  Manifest Entries: 1,250
  Total Episodes: 1,250
  Total Issues: 15
    🔴 Errors: 5
    🟡 Warnings: 10
    🔵 Info: 0

🔍 DETAILED ISSUES:
--------------------------------------------------

MISSING FILE (5 issues):
  🔴 Missing transcript for "Episode 123" (2024-12-26T10:00:00.000Z) in podcast "naddpod"
    📁 audio/naddpod/2024-12-26_Episode_123--1735207200000.mp3
  🔴 Missing search entry for "Episode 124" (2024-12-26T11:00:00.000Z) in podcast "naddpod"
    📁 audio/naddpod/2024-12-26_Episode_124--1735210800000.mp3

DUPLICATE VERSIONS (8 issues):
  🟡 Episode "Episode 120" in podcast "naddpod" has 2 versions
    ℹ️  {"versions":["2024-12-25T10:00:00.000Z","2024-12-26T10:00:00.000Z"]}

ORPHANED FILE (2 issues):
  🟡 Orphaned transcript for "Episode 119" in podcast "naddpod" - no audio file
    📁 transcripts/naddpod/2024-12-24_Episode_119--1735120800000.srt

💡 RECOMMENDATIONS:
--------------------------------------------------
🔴 ERRORS need immediate attention:
  - Missing files should be regenerated by running appropriate lambdas
  - Parse errors indicate file naming issues that need manual review
  - Manifest mismatches may require manifest updates

🟡 WARNINGS should be reviewed:
  - Duplicate versions can be cleaned up by running cleanup scripts
  - Orphaned files can be safely deleted if not needed
```

## Integration with Phase 3

This consistency checker supports Phase 3 goals:

### 3.1 File Cleanup Logic ✅ **COMPLETED**
- Enhanced lambdas to actually delete older versions
- RSS, Process Audio, and SRT Indexing lambdas now support real deletion

### 3.2 File Consistency Checking ✅ **FRAMEWORK READY**
- Comprehensive framework for identifying all consistency issues
- Ready for implementation in validation package
- Supports both local and S3 file operations

## Commands to Run

After implementing the consistency checker:

```bash
# Check specific site
cd packages/validation
pnpm run check-consistency --site=naddpod

# Check all sites  
pnpm run check-consistency --all

# Generate JSON report
pnpm run check-consistency --site=naddpod --format=json > consistency-report.json

# Fix issues automatically (if implemented)
pnpm run check-consistency --site=naddpod --fix
```

## Next Steps for User

1. **Review this framework**
2. **Choose implementation location** (packages/validation recommended)
3. **Implement using existing @browse-dot-show packages**
4. **Test on a single site first**
5. **Run consistency check before Phase 4 migration**

## Implementation Decision

**✅ DECIDED**: Implement as a local script in `packages/validation/` that can be run manually before migrations. No need for Lambda deployment complexity.