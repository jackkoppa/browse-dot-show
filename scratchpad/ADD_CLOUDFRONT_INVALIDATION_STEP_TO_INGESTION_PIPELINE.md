# CloudFront Invalidation Step for Ingestion Pipeline

## Current State Analysis

### CloudFront Invalidation Already Exists
- ✅ `invalidateCloudFrontWithCredentials()` function exists in `scripts/utils/client-deployment.ts`
- ✅ Pattern for automation role assumption already implemented in `scripts/upload-all-client-sites.ts`
- ✅ Method to get terraform outputs with temp credentials exists: `getTerraformOutputsWithCredentials()`

### Current Ingestion Pipeline Flow
1. Pre-sync: Download missing files from S3
2. RSS Retrieval: Download new episodes
3. Audio Processing: Transcribe new audio files
4. Local Indexing: Update search indices locally  
5. S3 Sync: Upload all new files (including search indices)
6. Search API Refresh: Trigger Lambda to reload search index

## Implementation Plan

### Phase 1: Fix Existing Bug
**Bug Found:** `scripts/upload-all-client-sites.ts` has incorrect references to `SITE_ACCOUNT_MAPPINGS[siteId]` on lines 139 and 179. Should use `getSiteAccountMapping(siteId)` instead.

### Phase 2: Add CloudFront Invalidation to Ingestion Pipeline

#### 2.1 Location in Pipeline
Add **Phase 6: CloudFront Cache Invalidation** as the final step, after search API refresh, for sites that:
- Had successful uploads to S3 (`s3SyncTotalFilesUploaded > 0`)
- Had successful search API refresh

#### 2.2 Implementation Approach
1. **Reuse existing pattern** from `upload-all-client-sites.ts`
2. **Move shared functions** to utils if needed for better organization
3. **Add to SiteProcessingResult interface**:
   ```typescript
   cloudfrontInvalidationSuccess?: boolean;
   cloudfrontInvalidationDuration?: number;
   ```

#### 2.3 Required Functions
- **Reuse:** `invalidateCloudFrontWithCredentials()` from `client-deployment.ts`
- **Reuse:** Role assumption pattern from `upload-all-client-sites.ts`
- **Create:** New function `invalidateCloudFrontForSite()` in `run-ingestion-pipeline.ts`

#### 2.4 Permissions Required
The automation role (`browse-dot-show-automation-role`) needs CloudFront permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow", 
      "Action": [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation"
      ],
      "Resource": "*"
    }
  ]
}
```

#### 2.5 Process Flow
For each site with successful uploads:
1. Use automation credentials to assume site-specific role
2. Get terraform outputs (including `cloudfrontId`) with temp credentials
3. Call `invalidateCloudFrontWithCredentials()` with CloudFront distribution ID
4. Update results tracking and logging

### Phase 3: Testing Strategy
1. **Fix the bug** in `upload-all-client-sites.ts` first
2. **Test the fix** by running upload-all-client-sites for one site
3. **Implement ingestion pipeline changes**
4. **Test with one site** during ingestion pipeline run
5. **Verify invalidation** by checking CloudFront console/logs

### Phase 4: Implementation Details

#### 4.1 Add to run-ingestion-pipeline.ts after search API refresh:
```typescript
// Phase 6: CloudFront Cache Invalidation for sites with successful uploads
if (config.phases.cloudfrontInvalidation) {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 Phase 6: CloudFront Cache Invalidation');
  console.log('='.repeat(60));
  
  const sitesWithUploads = results.filter(r => 
    (r.s3SyncTotalFilesUploaded || 0) > 0 && r.s3SyncSuccess
  );
  
  for (const result of sitesWithUploads) {
    const invalidationResult = await invalidateCloudFrontForSite(result.siteId, credentials);
    // Update results...
  }
}
```

#### 4.2 Configuration Options
- Add `cloudfrontInvalidation: boolean` to phases config (default: true)
- Add `--skip-cloudfront-invalidation` CLI flag
- Include in interactive configuration

## Expected Benefits
- ✅ Immediately updated content visible to users after ingestion pipeline
- ✅ No manual invalidation needed after content updates
- ✅ Consistent with deployment pipeline behavior
- ✅ Automated cache management for all sites

## Files to Modify
1. `scripts/upload-all-client-sites.ts` - Fix bugs (lines 139, 179)
2. `scripts/run-ingestion-pipeline.ts` - Add Phase 6 CloudFront invalidation
3. `terraform/automation/` - Add CloudFront permissions to automation role (manual step)

## Next Steps
1. ✅ **Fix bug in upload-all-client-sites.ts** - COMPLETED
2. ✅ **Implement Phase 6 in ingestion pipeline** - COMPLETED  
3. ✅ **Add CloudFront permissions to automation role** - COMPLETED (needs deploy)
4. ⏳ **Deploy Terraform changes** (requires manual Terraform apply)
5. ⏳ **Test upload-all-client-sites fix** (requires manual testing)
6. ⏳ **Test Phase 6 CloudFront invalidation** (requires manual testing)

## Implementation Summary

### ✅ Completed Changes

#### 1. Fixed Bug in upload-all-client-sites.ts
- Fixed lines 139 and 179: `SITE_ACCOUNT_MAPPINGS[siteId]` → `getSiteAccountMapping(siteId)`

#### 2. Added CloudFront Permissions to Automation Role
- Added CloudFront permissions to `terraform/sites/main.tf`
- Added `cloudfront:CreateInvalidation` and `cloudfront:GetInvalidation` permissions
- Permissions apply to all CloudFront distributions (`Resource = "*"`)

#### 3. Added CloudFront Invalidation to Ingestion Pipeline
- ✅ Added `cloudfrontInvalidation: boolean` to phases config (default: true)
- ✅ Added `--skip-cloudfront-invalidation` CLI flag
- ✅ Added to interactive configuration options
- ✅ Added Phase 6 description in help text
- ✅ Added `cloudfrontInvalidationSuccess` and `cloudfrontInvalidationDuration` to `SiteProcessingResult` interface
- ✅ Imported required functions: `invalidateCloudFrontWithCredentials`, `getTerraformOutputsWithCredentials`
- ✅ Created `invalidateCloudFrontForSite()` function using automation role pattern
- ✅ Added Phase 6 execution logic after search API refresh
- ✅ Added CloudFront invalidation results to per-site summary
- ✅ Added CloudFront invalidation statistics to overall summary
- ✅ Integrated with dry-run mode

#### 4. Implementation Details
**Location:** Added as Phase 6 at the end of the pipeline  
**Trigger:** Only runs for sites with successful S3 uploads (`s3SyncTotalFilesUploaded > 0` && `s3SyncSuccess`)  
**Pattern:** Reuses automation role assumption pattern from existing code  
**Logging:** Full integration with existing logging and progress tracking  

### ⏳ Remaining Tasks

#### 1. Deploy Terraform Changes
The CloudFront permissions have been added to `terraform/sites/main.tf` but need to be deployed:
```bash
# Navigate to terraform/sites directory
cd terraform/sites

# Apply changes for each site that needs the permissions
terraform apply -var-file=../../sites/origin-sites/SITE_ID/terraform/prod.tfvars
```

#### 2. Testing Strategy
1. **Test upload-all-client-sites fix:** Run for one site to verify the bug fix works
2. **Deploy CloudFront permissions:** Apply Terraform changes to add CloudFront permissions to automation role
3. **Test CloudFront invalidation:** Run ingestion pipeline for one site and verify CloudFront invalidation works
4. **Verify cache behavior:** Check that content updates are immediately visible

## Ready for Testing
The implementation is complete and ready for testing. The next step is to:
1. Deploy the CloudFront permissions via Terraform
2. Test with a single site to verify functionality