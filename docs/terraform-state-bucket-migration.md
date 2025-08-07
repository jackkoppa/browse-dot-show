# Terraform State Bucket Migration Guide

## Overview

This document outlines the migration process from the old Terraform state bucket naming pattern to the new one to avoid naming conflicts and improve consistency.

**Migration Details:**
- **From:** `{siteId}-terraform-state`
- **To:** `{siteId}-browse-dot-show-tf-state`
- **Reason:** The old pattern was too generic and caused conflicts (e.g., "eggplant-terraform-state" already exists globally)

## Pre-Migration Checklist

### 1. AWS Authentication
Ensure you have active AWS SSO sessions for both accounts:

```bash
# Account 1 (Sites: hardfork, listenfairplay, searchengine, pickleballstudio, limitedresources, hiddenbrain, spoutlore)
aws sso login --profile browse.show-2_admin-permissions-927984855345

# Account 2 (Sites: claretandblue, naddpod, myfavoritemurder, lordsoflimited, screenrot, fromtherookeryend, drivetowork, luckypaper)
aws sso login --profile browse.show-1_admin-permissions-152849157974
```

### 2. Backup Current State
Before starting the migration, ensure you have a backup of your current infrastructure state. The migration script will copy all state files, but it's good practice to have manual backups.

### 3. Site Status
Verify all sites are in a stable state before migration. Avoid running the migration during active deployments.

## Migration Process

### Step 1: Run the Migration Script

```bash
# Navigate to the project root
cd /path/to/browse-dot-show

# Run the migration script (interactive mode)
tsx scripts/deploy/migrate-terraform-state-buckets.ts

# Or run in non-interactive mode (auto-approve)
tsx scripts/deploy/migrate-terraform-state-buckets.ts --yes
```

The script will:
1. Load site account mappings from `.site-account-mappings.json`
2. For each site:
   - Check if old bucket exists
   - Create new bucket with proper configuration (versioning, encryption, public access blocking)
   - Copy all state files from old bucket to new bucket
   - Update backend configuration files (`sites/origin-sites/{siteId}/terraform/backend.tfbackend`)
3. Validate that state files were copied correctly

### Step 2: Test Deployment of Existing Sites

After migration, test a couple of existing sites to ensure they work correctly:

```bash
# Test with a small site first
pnpm site:deploy
# Select a site like "hardfork" or "claretandblue"

# Test with another site from a different AWS account
pnpm site:deploy
# Select a site from the other account
```

### Step 3: Deploy the Eggplant Site

Once you've verified existing sites work, deploy the new eggplant site:

```bash
pnpm site:deploy
# Select "Eggplant: The Secret Lives of Games (eggplant.browse.show)"
```

### Step 4: Clean Up Old Buckets (Optional)

After confirming everything works correctly, you can clean up the old buckets:

```bash
# This will prompt for confirmation before deleting old buckets
tsx scripts/deploy/migrate-terraform-state-buckets.ts --cleanup

# Or auto-approve the cleanup
tsx scripts/deploy/migrate-terraform-state-buckets.ts --cleanup --yes
```

## Rollback Procedure

If you need to rollback the migration:

### Option 1: Manual Rollback (Recommended)

1. **Revert backend configuration files:**
   ```bash
   # For each site, change the bucket name back in backend.tfbackend
   # From: bucket = "{siteId}-browse-dot-show-tf-state"
   # To:   bucket = "{siteId}-terraform-state"
   ```

2. **Copy state back to old buckets:**
   ```bash
   # For each site, copy state from new bucket back to old bucket
   aws s3 sync s3://{siteId}-browse-dot-show-tf-state s3://{siteId}-terraform-state --profile {aws-profile}
   ```

### Option 2: Git Rollback + Manual State Copy

1. **Revert code changes:**
   ```bash
   git checkout HEAD~1 scripts/deploy/bootstrap-site-state.ts
   git checkout HEAD~1 sites/template-site/terraform/backend.tfbackend
   git checkout HEAD~1 scripts/deploy/site-destroy.ts
   git checkout HEAD~1 terraform/sites/main.tf
   git checkout HEAD~1 terraform/sites/outputs.tf
   git checkout HEAD~1 scripts/site-creator/step-executors.ts
   ```

2. **Copy state files back** (same as Option 1, step 2)

## Files Modified by Migration

The migration updates the following files to use the new bucket naming pattern:

- `scripts/deploy/bootstrap-site-state.ts` - Bucket creation logic
- `sites/template-site/terraform/backend.tfbackend` - Template backend config
- `scripts/deploy/site-destroy.ts` - Expected bucket name logging
- `terraform/sites/main.tf` - Documentation comment
- `terraform/sites/outputs.tf` - Documentation comment
- `scripts/site-creator/step-executors.ts` - Bucket name checks
- All site-specific `sites/origin-sites/{siteId}/terraform/backend.tfbackend` files

## Affected Sites and Accounts

### Account 927984855345 (browse.show-2_admin-permissions-927984855345)
- hardfork
- listenfairplay
- searchengine
- pickleballstudio
- limitedresources
- hiddenbrain
- spoutlore

### Account 152849157974 (browse.show-1_admin-permissions-152849157974)
- claretandblue
- naddpod
- myfavoritemurder
- lordsoflimited
- screenrot
- fromtherookeryend
- drivetowork
- luckypaper

### New Site (Not Yet Deployed)
- eggplant (will use new naming pattern from the start)

## Troubleshooting

### Migration Script Fails
- **Check AWS credentials:** Ensure both AWS SSO profiles are active
- **Check permissions:** Verify you have S3 admin permissions in both accounts
- **Check bucket conflicts:** The script will report if new buckets already exist

### Deployment Fails After Migration
- **Check backend config:** Verify `backend.tfbackend` files were updated correctly
- **Re-run terraform init:** You may need to run `terraform init -reconfigure` in the terraform/sites directory
- **Check state file exists:** Verify the state file exists in the new bucket

### State File Not Found
- **Check bucket contents:** Use AWS console or CLI to verify state files were copied
- **Validate bucket name:** Ensure you're using the correct bucket name pattern
- **Check AWS region:** All buckets are in us-east-1

## Verification Commands

```bash
# Check if old bucket exists
aws s3api head-bucket --bucket {siteId}-terraform-state --profile {aws-profile}

# Check if new bucket exists
aws s3api head-bucket --bucket {siteId}-browse-dot-show-tf-state --profile {aws-profile}

# List contents of new bucket
aws s3 ls s3://{siteId}-browse-dot-show-tf-state --profile {aws-profile}

# Check backend config file
cat sites/origin-sites/{siteId}/terraform/backend.tfbackend
```

## Migration Script Usage

```bash
# Show migration plan and migrate
tsx scripts/deploy/migrate-terraform-state-buckets.ts

# Auto-approve migration
tsx scripts/deploy/migrate-terraform-state-buckets.ts --yes

# Clean up old buckets after successful migration
tsx scripts/deploy/migrate-terraform-state-buckets.ts --cleanup

# Auto-approve cleanup
tsx scripts/deploy/migrate-terraform-state-buckets.ts --cleanup --yes
```