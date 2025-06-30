# File Consistency Checker

A comprehensive tool for validating file consistency across audio files, transcripts, search entries, and episode manifests in the Browse.show ecosystem.

## Features

- **Complete File Validation**: Checks audio, transcript, and search entry files for consistency
- **Manifest Verification**: Validates episode manifest entries against actual files
- **Multiple Version Detection**: Identifies duplicate versions of episodes with different downloadedAt timestamps
- **Orphaned File Detection**: Finds files without corresponding audio or manifest entries
- **Missing File Detection**: Identifies missing transcripts or search entries for existing audio files
- **Multiple Output Formats**: Text (human-readable) and JSON (machine-readable) output
- **Site-Specific Checking**: Check individual sites or all sites at once
- **Exit Codes**: Proper exit codes for CI/CD integration (0=success, 1=errors, 2=warnings)

## Installation

The consistency checker is part of the validation package. Ensure all dependencies are built:

```bash
cd packages/validation
pnpm install
pnpm build
```

## Usage

### Check a specific site (from anywhere in the project):
```bash
# From project root - skips site selection prompt
pnpm validate:consistency --site=naddpod

# Or from validation package directory
cd packages/validation
pnpm run check-consistency --site=naddpod
```

### Interactive site selection:
```bash
# From project root - shows site selection prompt
pnpm validate:consistency

# Or from validation package directory
cd packages/validation
pnpm run check-consistency --all
```

### JSON output for scripting:
```bash
pnpm validate:consistency --site=naddpod --format=json
# or
cd packages/validation
pnpm run check-consistency --site=naddpod --format=json
```

### Verbose logging:
```bash
pnpm validate:consistency --site=naddpod --verbose
# or
cd packages/validation
pnpm run check-consistency --site=naddpod --verbose
```

### Help:
```bash
cd packages/validation
pnpm run check-consistency --help
```

## Issue Types

### 🔴 Critical Errors (Exit Code 1)
- **Missing Files**: Audio exists but transcript/search-entry missing
- **Orphaned Manifest**: Manifest entry exists but no files found
- **Manifest Mismatch**: Files exist but not tracked in manifest
- **Parse Errors**: Invalid file key formats

### 🟡 Warnings (Exit Code 2)
- **Orphaned Files**: Transcript/search-entry exists without audio
- **Duplicate Versions**: Multiple downloadedAt timestamps for same episode

### 🔵 Info (Exit Code 0)
- **All Consistent**: No issues found

## Example Output

```
📊 FILE CONSISTENCY REPORT
==================================================

📈 SUMMARY:
  Audio Files: 397
  Transcript Files: 397
  Search Entry Files: 397
  Manifest Entries: 397
  Total Episodes: 397
  Total Issues: 0
    🔴 Errors: 0
    🟡 Warnings: 0
    🔵 Info: 0

🎉 No issues found! All files are consistent.
```

## File Structure Checked

The checker validates consistency across:

- **Audio Files**: `audio/{podcastId}/*.mp3`
- **Transcripts**: `transcripts/{podcastId}/*.srt`
- **Search Entries**: `search-entries/{podcastId}/*.json`
- **Episode Manifest**: `episode-manifest/full-episode-manifest.json`

## Implementation Details

- Built using existing @browse-dot-show packages for consistency
- Uses S3 client for file operations (works with both local and AWS storage)
- Supports both legacy and new downloadedAt file formats
- Groups files by episode using pub date + title (ignoring downloadedAt)
- Comprehensive error handling and logging

## Environment Variables

The checker respects the same environment variables as other validation tools:

- `CURRENT_SITE_ID`: Site to check (can be overridden with --site)
- `FILE_STORAGE_ENV`: Storage environment (local/aws)
- `LOG_LEVEL`: Logging level (set via --verbose flag)

## Integration with downloadedAt Implementation

This checker is part of Phase 3 of the downloadedAt implementation plan and is essential for:

1. **Pre-Migration Validation**: Verify current file state before backfill
2. **Post-Migration Verification**: Ensure migration was successful
3. **Ongoing Monitoring**: Regular consistency checks
4. **CI/CD Integration**: Automated consistency validation

## Exit Codes

- **0**: Success (no issues or info only)
- **1**: Critical errors found (requires immediate attention)
- **2**: Warnings found (should be reviewed)

Perfect for CI/CD pipelines and automated monitoring. 