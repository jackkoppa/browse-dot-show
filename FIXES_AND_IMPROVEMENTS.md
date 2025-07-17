# Fixes and Improvements Based on Testing Feedback

## ✅ Issues Addressed

Based on the successful local testing run, three issues were identified and addressed:

## 🔧 Issue 1: Search Lambda Permissions

**Problem**: The search-api Lambda refresh failed with `AccessDeniedException`:
```
User: arn:aws:sts::152849157974:assumed-role/browse-dot-show-automation-role/automation-search-refresh-lordsoflimited-1752786552058 is not authorized to perform: lambda:InvokeFunction on resource: arn:aws:lambda:us-east-1:152849157974:function:search-api-lordsoflimited
```

**Solution Required**: Update the automation role's IAM policy to include:
```json
{
    "Effect": "Allow", 
    "Action": "lambda:InvokeFunction",
    "Resource": "arn:aws:lambda:*:*:function:search-api-*"
}
```

**Status**: ⚠️ Requires AWS IAM policy update (outside of code changes)

## 🔧 Issue 2: Phase 5 Should Only Upload (Local→S3)

**Problem**: Phase 5 was doing bidirectional sync checking, which could potentially download files from S3→local. This shouldn't happen since Phase 1 already handles S3→local downloads.

**Solution Implemented**: 
- Changed Phase 5 to only check for files to upload (local→S3)
- Updated from `SYNC_MODES.FULL_SYNC` to `SYNC_MODES.UPLOAD_ONLY`
- Updated all related logging and documentation

**Code Changes**:
```typescript
// Before: Bidirectional check
const postSyncReport = await generateSyncConsistencyReport(
  site.id, bucketName, tempCredentials, SYNC_MODES.FULL_SYNC
);

// After: Upload-only check  
const uploadReport = await generateSyncConsistencyReport(
  site.id, bucketName, tempCredentials, SYNC_MODES.UPLOAD_ONLY
);
```

**Status**: ✅ Fixed in code

## 🔧 Issue 3: Unexpected Search-Entries Upload Volume

**Problem**: 450 search-entry files were uploaded when only 1 new episode was processed. This suggests either:
1. Search entries are being regenerated unnecessarily during local indexing
2. File timestamps/checksums causing AWS CLI to think files need re-uploading  
3. Search-entries directory structure changes affecting sync detection

**Solution Implemented**: Added comprehensive TODO comment for investigation:
```typescript
// TODO: Investigate why search-entries folder may be uploading more files than expected.
// We've seen cases where 450+ search-entry files get uploaded when only 1 new episode was processed.
// This could indicate:
// 1. Search entries are being regenerated unnecessarily during local indexing
// 2. File timestamps/checksums causing AWS CLI to think files need re-uploading
// 3. Search-entries directory structure changes affecting sync detection
// Monitor this in future runs, especially multi-site runs.
```

**Status**: ⏸️ Monitoring for future investigation

## 📊 Updated Behavior

### Phase 1: Pre-sync Check (S3→Local Only)
- ✅ Downloads files missing locally from S3
- ✅ Never uploads anything

### Phase 5: Upload Check (Local→S3 Only)  
- ✅ Identifies files to upload from local to S3
- ✅ Uploads new/changed files only
- ✅ Never downloads anything
- ✅ Triggers search-api Lambda refresh after successful uploads

## 🎯 Key Improvements

1. **Clearer Phase Separation**: Phase 1 = download, Phase 5 = upload
2. **More Accurate Logging**: Updated all messages to reflect upload-only behavior
3. **Better Documentation**: Help text and docs now correctly describe the flow
4. **Investigation Support**: Added TODO for monitoring search-entries behavior

## 🧪 Testing Results

- ✅ Script compiles successfully with changes
- ✅ Help text reflects updated Phase 5 behavior
- ✅ Dry-run mode shows correct intentions
- ✅ Ready for next production run to validate fixes

## 📝 Files Modified

1. **`scripts/run-ingestion-pipeline.ts`** - Fixed Phase 5 sync mode
2. **`scripts/utils/sync-consistency-checker.ts`** - Added UPLOAD_ONLY mode
3. **`IMPLEMENTATION_SUMMARY.md`** - Updated documentation
4. **`FIXES_AND_IMPROVEMENTS.md`** - This summary

## 🎉 Ready for Production

The pipeline is now correctly implementing:
- **Phase 1**: Only download missing files (S3→local)
- **Phase 5**: Only upload new files (local→S3) + search-api refresh

The only remaining action item is updating the AWS IAM policy for the automation role to allow Lambda invocation permissions.