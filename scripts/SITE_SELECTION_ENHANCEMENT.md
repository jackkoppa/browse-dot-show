# Site Selection Enhancement

## Overview

Enhanced the `run-with-site-selection.ts` script to support skipping the interactive site selection prompt by passing a `--site=` parameter.

## What Changed

### 1. Enhanced `scripts/run-with-site-selection.ts`

**New Features:**
- ✅ Supports `--site=<siteId>` parameter to skip interactive prompt
- ✅ Automatically passes site selection to underlying commands
- ✅ Maintains backward compatibility with existing usage
- ✅ Added helpful usage documentation

**Usage Examples:**
```bash
# Skip site selection prompt
pnpm validate:consistency --site=naddpod

# Still shows interactive prompt when no --site provided
pnpm validate:consistency
```

### 2. Updated `packages/validation/package.json`

**New Script:**
- ✅ Added `validate:consistency` script that uses `$CURRENT_SITE_ID` environment variable
- ✅ Integrates seamlessly with site selection system

### 3. Enhanced Root Package Scripts

**Existing Integration:**
- ✅ `validate:consistency` script already exists in root `package.json`
- ✅ Now works with `--site=` parameter for non-interactive usage

## How It Works

1. **Parse Arguments**: `run-with-site-selection.ts` checks for `--site=` in command args
2. **Extract Site ID**: Extracts site ID and removes `--site=` from args passed to target command
3. **Skip Prompt**: Passes `defaultSiteId` and `skipPrompt: true` to `selectSite()`
4. **Set Environment**: Sets `CURRENT_SITE_ID` environment variable
5. **Run Command**: Executes target command with site context

## Benefits

- **Faster CI/CD**: No interactive prompts in automated scripts
- **Developer Experience**: Quick site switching with `--site=` parameter
- **Backward Compatible**: Existing usage patterns continue to work
- **Consistent**: Same pattern works across all site-aware scripts

## Usage Pattern

```bash
# Interactive (existing behavior)
pnpm validate:consistency
pnpm client:dev
pnpm s3:sync

# Non-interactive (new capability)
pnpm validate:consistency --site=naddpod
pnpm client:dev --site=hardfork
pnpm s3:sync --site=claretandblue
```

## Implementation Details

- Uses existing `selectSite()` function from `scripts/utils/site-selector.ts`
- Leverages `defaultSiteId` and `skipPrompt` options that already existed
- Properly validates site IDs before proceeding
- Maintains all existing error handling and validation logic

## Environment Variable Cleanup

**✅ Removed Legacy Approach:**
- ❌ Removed `DEFAULT_SITE_ID` environment variable usage
- ❌ Removed `SKIP_SITE_SELECTION_PROMPT` environment variable usage
- ✅ Replaced with cleaner `--site=` parameter approach
- ✅ Updated all documentation to reflect new usage pattern

**Files Updated:**
- `scripts/utils/site-selector.ts` - Removed environment variable defaults
- `scripts/trigger-ingestion-lambda.ts` - Removed DEFAULT_SITE_ID usage  
- `docs/GETTING_STARTED.md` - Updated documentation
- `sites/my-sites/README.md` - Updated usage instructions

**Benefits of Cleanup:**
- **Simpler**: No need to set environment variables
- **Explicit**: Site selection is clear from command line
- **Consistent**: Same pattern across all commands
- **Self-Documenting**: `--site=` makes intent obvious 