# Improving Gitignore and File Deduping for Sites

## Overview
This document outlines the plan to centralize all site-specific content into individual site directories or gitignored files, eliminating duplication and ensuring site-specific information lives only in the appropriate locations.

## Current Issues Identified

### 1. Terraform Files in Wrong Locations (High Priority)
**Problem**: Site-specific terraform files are in `/terraform/sites/` instead of individual site directories.

**Files to Move**:
```
FROM: /terraform/sites/environments/
- claretandblue-prod.tfvars
- hardfork-prod.tfvars  
- listenfairplay-prod.tfvars
- lordsoflimited-prod.tfvars
- myfavoritemurder-prod.tfvars
- naddpod-prod.tfvars
- searchengine-prod.tfvars

FROM: /terraform/sites/backend-configs/
- claretandblue.tfbackend
- hardfork.tfbackend
- listenfairplay.tfbackend
- lordsoflimited.tfbackend
- myfavoritemurder.tfbackend
- naddpod.tfbackend
- searchengine.tfbackend

TO: /sites/origin-sites/{site-id}/terraform/
```

**Plan**:
1. Create `terraform/` subdirectory in each site directory
2. Move `{site-id}-prod.tfvars` → `{site-id}/terraform/prod.tfvars`
3. Move `{site-id}.tfbackend` → `{site-id}/terraform/backend.tfbackend`
4. Update terraform deployment scripts to look for files in new locations
5. Update `/terraform/sites/README.md` to explain new structure and point to site-specific terraform files

### 2. Duplicated Site Account Mappings (High Priority)
**Problem**: `SITE_ACCOUNT_MAPPINGS` object is duplicated across multiple files with hardcoded account IDs and bucket names.

**Files Containing Duplication**:
- `scripts/run-ingestion-pipeline.ts` (lines 471-499)
- `scripts/upload-all-client-sites.ts` (lines 26-50)
- `scripts/deploy/upload-all-client-sites.ts` (lines 24-52)
- `scripts/test-cross-account-access.ts` (lines 19-36)
- `scripts/deploy/deploy-automation.ts` (lines 298-308 - account mappings in comments)

**Plan**:
1. Create `.gitignore`d file: `/.site-account-mappings.json` with structure:
   ```json
   {
     "hardfork": {
       "accountId": "927984855345",
       "bucketName": "hardfork-browse-dot-show"
     },
     "claretandblue": {
       "accountId": "152849157974", 
       "bucketName": "claretandblue-browse-dot-show"
     }
     // ... etc
   }
   ```

2. Create utility function in `scripts/utils/site-account-mappings.ts`:
   ```typescript
   export function loadSiteAccountMappings(): SiteAccountMapping {
     // Load from .site-account-mappings.json
   }
   ```

3. Replace all hardcoded `SITE_ACCOUNT_MAPPINGS` with calls to this utility
4. Add `.site-account-mappings.json` to `.gitignore`
5. Document in README how to create this file for new repositories

### 3. Hardcoded Deployed Sites List (Medium Priority)
**Problem**: `terraform/automation/variables.tf` has hardcoded `deployed_sites` list.

**Current**:
```hcl
variable "deployed_sites" {
  description = "List of site IDs that are deployed and need automation access"
  type        = list(string)
  default     = ["claretandblue", "hardfork", "listenfairplay", "naddpod", "searchengine", "myfavoritemurder"]
}
```

**Plan**:
1. Investigate if this can be dynamically generated from discovered sites
2. If not possible (due to terraform limitations), move to gitignored `.deployed-sites.json`
3. Create terraform data source or locals to read from file
4. Update automation deployment to generate this file from discovered sites

### 4. Homepage Site Configuration (Medium Priority)
**Problem**: `packages/homepage/deployed-sites.config.jsonc` contains hardcoded site-specific configurations.

**Plan**:
1. Create build-time script that generates this file from site configurations
2. Move file to `packages/homepage/deployed-sites.config.generated.jsonc`
3. Add generated file to `.gitignore`
4. Update homepage build process to generate config from site directories
5. Keep template version for reference

### 5. Scattered Site References (Low Priority)
**Problem**: Various files contain hardcoded site IDs in examples, tests, and documentation.

**Files with Hardcoded Site References**:
- `packages/validation/FILE_CONSISTENCY_CHECKER.md` - examples use `naddpod`
- `packages/client/build-sites.js` - example uses `hardfork`
- `packages/validation/check-file-consistency.ts` - examples use `naddpod`, `hardfork`
- `scripts/update-terraform-resource-names.ts` - example uses `myfavoritemurder`
- `packages/s3/client.spec.ts` - tests hardcode `hardfork`
- Various other scripts in examples and help text

**Plan**:
1. Replace hardcoded site IDs in examples with placeholder like `{site-id}` or `example-site`
2. Update test files to use dynamic site IDs or mock data
3. Document standard example site ID for consistency

### 6. AWS Account Mappings in Comments (Low Priority)
**Problem**: Several files have AWS account mappings in comments that will become outdated.

**Files**:
- `scripts/deploy/deploy-automation.ts` (lines 298-308)
- `terraform/automation/outputs.tf` (lines 58-64)

**Plan**:
1. Remove or update these comment blocks to reference the centralized mapping file
2. Add documentation about where to find current account mappings

## Implementation Order

### Phase 1: Site Account Mappings Centralization
1. Create `.site-account-mappings.json` (gitignored)
2. Create `scripts/utils/site-account-mappings.ts` utility
3. Update all scripts that use `SITE_ACCOUNT_MAPPINGS`
4. Test all affected scripts

### Phase 2: Terraform File Reorganization  
1. Create terraform subdirectories in each site
2. Move tfvars and tfbackend files
3. Update deployment scripts
4. Update terraform README
5. Test terraform deployments

### Phase 3: Dynamic Site Lists
1. Investigate terraform options for dynamic site lists
2. Implement solution (file-based or dynamic)
3. Update automation terraform

### Phase 4: Generated Configurations
1. Create homepage config generation script
2. Update homepage build process
3. Add generated files to gitignore

### Phase 5: Cleanup and Documentation
1. Replace hardcoded examples
2. Update test files
3. Remove outdated comments
4. Update documentation

## Files That Need .gitignore Updates

Add to `.gitignore`:
```
# Generated site configurations
/.site-account-mappings.json
/.deployed-sites.json
/packages/homepage/deployed-sites.config.generated.jsonc
```

## Import Updates Required

After moving utilities, these imports will need updating:
- All scripts importing from moved terraform files
- All scripts importing `SITE_ACCOUNT_MAPPINGS` → `loadSiteAccountMappings()`
- Homepage build scripts for new config location

## Testing Strategy

1. **Terraform Testing**: Deploy one site end-to-end after file moves
2. **Script Testing**: Run ingestion and deployment scripts for test site
3. **Build Testing**: Verify homepage and client builds work with generated configs
4. **Integration Testing**: Full workflow test from site creation to deployment

## Notes

- Keep backup copies of original files during migration
- Coordinate with any ongoing site deployments
- Consider creating migration script for easy reverting if needed
- Document new file locations and utilities for future developers