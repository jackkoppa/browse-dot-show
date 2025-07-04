# AWS Resource Name Length Limit Fix

## Problem
With 32-character site IDs, some AWS resource names exceed AWS length limits:
- IAM Role Names (64 char limit): `retrieve-rss-feeds-and-download-audio-files-${site_id}-role` = 74 chars ❌
- Lambda Function Names (64 char limit): `retrieve-rss-feeds-and-download-audio-files-${site_id}` = 68 chars ❌

## Solution
Shorten function names to fit within limits:
- `retrieve-rss-feeds-and-download-audio-files` → `rss-retrieval` (12 chars)
- `process-new-audio-files-via-whisper` → `whisper-transcription` (20 chars)
- `convert-srts-indexed-search` → `srt-indexing` (12 chars)
- `search-indexed-transcripts` → `search-api` (10 chars)

## Implementation Plan
1. **Update Terraform Configuration** - Replace function names in `terraform/sites/main.tf`
2. **Create Migration Script** - Handle renaming existing deployed resources
3. **Update EventBridge Schedules** - Match new function names
4. **Validate All Resource Names** - Ensure 32-char site IDs work

## Resource Name Calculations (32-char site ID)
- `rss-retrieval-${site_id}-role` = 49 chars ✅
- `rss-retrieval-${site_id}` = 44 chars ✅
- `whisper-transcription-${site_id}-role` = 57 chars ✅
- `srt-indexing-${site_id}-role` = 48 chars ✅
- All other resources already within limits

## Deployment Strategy
1. Update Terraform config first
2. Run migration script per site to rename resources
3. Test with `myfavoritemurder` site first
4. Apply to all 5 deployed sites