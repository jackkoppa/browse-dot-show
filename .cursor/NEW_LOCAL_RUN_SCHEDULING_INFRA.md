# New Local Run Scheduling Infrastructure

## 🎉 **PHASE 2 COMPLETE!** Cross-Account Automation Infrastructure ✅

**All 4 sites now have automation infrastructure deployed and tested:**
- ✅ hardfork, claretandblue, listenfairplay, naddpod
- ✅ Cross-account IAM roles and permissions working
- ✅ S3 upload, lambda invoke permissions tested for all sites
- ✅ Validation script ensures proper configuration

**Ready for Phase 3: Script Updates** 🚀

## 🚀 Implementation Progress

### Phase 1: Terraform Restructure ✅ COMPLETE
- [x] 1.1: Move terraform directories safely ✅
- [x] 1.2: Update script references to new paths ✅
- [x] 1.3: Create automation terraform structure ✅
- [x] 1.4: Test existing functionality still works ✅

### Phase 2: Cross-Account IAM Setup ✅ COMPLETE
- [x] 2.1: Create automation terraform infrastructure ✅
- [x] 2.2: Deploy central IAM user and policies ✅ 
- [x] 2.3: Deploy central automation infrastructure ✅
- [x] 2.4: Add automation roles to hardfork site terraform ✅ 
- [x] 2.5: Test cross-account access ✅ COMPLETE
- [x] 2.6: Roll out to remaining sites ✅ COMPLETE
  - [x] claretandblue ✅ COMPLETE (deployed & tested)
  - [x] listenfairplay ✅ COMPLETE (deployed & tested)
  - [x] naddpod ✅ COMPLETE (deployed & tested)
  - [x] hardfork ✅ COMPLETE (deployed & tested)

### Phase 3: Script Updates 🚀 READY TO START
- [ ] 3.1: Update individual lambda package.json files
- [ ] 3.2: Update root package.json
- [ ] 3.3: Update run-with-site-selection.ts for --env=prod support
- [ ] 3.4: Test updated script commands

### Phase 4: New Scheduled Script 🔮 FUTURE
- [ ] 4.1: Create scheduled script skeleton
- [ ] 4.2: Implement automation credential loading (use `.env.automation`)
- [ ] 4.3: Implement local ingestion execution (for all 4 sites)
- [ ] 4.4: Implement SRT file change detection
- [ ] 4.5: Implement AWS lambda triggering (using automation role ARNs)
- [ ] 4.6: Test end-to-end functionality

### Phase 5: Environment Setup ✅ COMPLETE
- [x] 5.1: Create .env.automation.template ✅ (automated by deploy script)
- [x] 5.2: Update .gitignore ✅ (already configured)
- [x] 5.3: Deploy automation infrastructure ✅ (deployed and tested)
- [x] 5.4: Configure local credentials ✅ (in `.env.automation`)
- [ ] 5.5: Set up local scheduling (future - after Phase 4 script creation)

## 🎯 Current Status & Next Steps

### ✅ COMPLETED (Phase 1 & Phase 2 - INFRASTRUCTURE COMPLETE):
1. **Terraform restructure** - All terraform moved to consistent structure ✅
2. **File naming consistency** - All deploy scripts follow same patterns ✅
3. **Automation infrastructure** - Central IAM user deployed and tested ✅
4. **All 4 sites deployed** - hardfork, claretandblue, listenfairplay, naddpod ✅
5. **Cross-account access** - Tested and working for all sites ✅
6. **Validation tooling** - Script to verify automation role configuration ✅

### ⚠️ IMPORTANT INSTRUCTION FOR FUTURE AGENTS:
**All scripts that will possibly modify AWS resources should be run by the human dev. If you ever need to test a script that will modify AWS resources (e.g. run Terraform changes), finish your work, then prompt the dev with what should be run, so they can run & report the logs back to you.**

### ⚠️ NEXT STEPS (Resume here):

**COMPLETED:** Phase 2 - Cross-Account IAM Setup ✅ 
1. ✅ **All 4 Sites Deployed:** hardfork, claretandblue, listenfairplay, naddpod
2. ✅ **Automation Roles:** Properly configured (1 creator per AWS account, others reference existing)
3. ✅ **Cross-Account Access:** All sites tested and working (role assumption, S3 access, lambda invoke)
4. ✅ **Central Automation:** IAM user with permissions to all site accounts

**INFRASTRUCTURE COMPLETE:** ✅
- **Account `152849157974`**: claretandblue (role creator), naddpod (role referencer)
- **Account `927984855345`**: hardfork (role creator), listenfairplay (role referencer)
- **Automation Account `297202224084`**: Central user with assume role permissions for all sites
- **Validation Script:** `packages/validation/validate-automation-role-config.ts` ensures proper configuration

**READY FOR:** Phase 3 - Script Updates 🚀
- All infrastructure is deployed and tested
- Cross-account access working for all 4 sites
- Foundation ready for automated ingestion scripts

**NEXT:** Phase 3 - Script Updates 🚀
**Goal:** Simplify script commands and prepare for automation

**Key Changes Needed:**
1. **Lambda package.json files** - Remove `:local` and `:prod` suffixes, default to local execution
2. **Root package.json** - Add new `scheduled:run-ingestion-and-trigger-indexing` script
3. **run-with-site-selection.ts** - Add support for `--env=prod` flag to trigger cloud lambdas
4. **New automation script** - Create script that runs local ingestion for all sites, then triggers cloud indexing for sites with new SRT files

**Infrastructure Foundation:** All automation infrastructure is ready - Phase 3 focuses on script simplification and automation workflow creation.

### 🔑 Key Information for Resuming:

**Automation Infrastructure (Phase 2 COMPLETE):**
- **Automation Account:** `297202224084` (browse.show-0_account--root)
- **Automation User:** `browse-dot-show-automation` 
- **Credentials:** Ready in `.env.automation` file (gitignored)
- **All Sites Working:** hardfork, claretandblue, listenfairplay, naddpod

**Site Account Structure:**
- **Account `152849157974`**: claretandblue (creates automation role), naddpod (references role)
- **Account `927984855345`**: hardfork (creates automation role), listenfairplay (references role)

**Key Commands:**
- **Test Cross-Account Access:** `pnpm tsx scripts/test-cross-account-access.ts --site=<site_id>`
- **Validate Automation Config:** `cd packages/validation && pnpm automation-roles`
- **Deploy Automation Updates:** `pnpm tsx scripts/deploy/deploy-automation.ts`

## 📚 Key Reference Files (for Future Agents)

### Phase 3 Architecture Understanding (Starting Point)
- `package.json` - Root package.json with current script definitions
- `scripts/run-with-site-selection.ts` - Site selection and environment loading logic
- `scripts/run-all-ingestion-lambdas-for-all-sites.ts` - Current all-sites processing script
- `scripts/trigger-ingestion-lambda.ts` - Manual lambda triggering example
- `scripts/utils/site-selector.ts` - Site discovery and environment variable loading
- `scripts/utils/aws-utils.ts` - AWS CLI operations and validation

### Site Configuration Structure
- `sites/origin-sites/*/` - Current site configurations
- `sites/origin-sites/*/site.config.json` - Site metadata
- `sites/origin-sites/*/.env.aws-sso` - Site-specific AWS profiles (gitignored)

### Terraform Infrastructure ✅ COMPLETE
- `terraform/sites/` - Site infrastructure (moved and working)
- `terraform/automation/` - Central automation infrastructure (deployed)
- `terraform/homepage/` - Homepage infrastructure (existing)
- `terraform/sites/environments/*.tfvars` - Site-specific terraform variables with automation config
- `terraform/sites/backend-configs/*.tfbackend` - Site-specific terraform backends

### Lambda Package Structure
- `packages/ingestion/rss-retrieval-lambda/package.json` - RSS retrieval scripts
- `packages/ingestion/process-audio-lambda/package.json` - Audio processing scripts  
- `packages/ingestion/srt-indexing-lambda/package.json` - SRT indexing scripts

### AWS Account Structure (Important Context)
Each site runs in a separate AWS account with the pattern:
- Account ID: Unique per site
- Profile format: `browse.show-{NUMBER}_{PERMISSIONS}-{ACCOUNT_ID}`
- Example: `browse.show-1_admin-permissions-152849157974`

## Current Understanding

### Current Script Structure
- Individual lambda scripts have `:local` and `:prod` variations
- `:local` runs against local filesystem using Whisper locally (free)
- `:prod` runs against AWS with OpenAI API calls (costs money)
- `run-all-ingestion-lambdas-for-all-sites.ts` runs all 3 lambdas for all sites locally
- `trigger-ingestion-lambda.ts` manually triggers individual AWS lambdas

### Site & AWS Structure
- Sites in either `sites/my-sites/` or `sites/origin-sites/`
- Each site has `.env.aws-sso` with AWS_PROFILE pointing to separate AWS accounts
- Example: `AWS_PROFILE=browse.show-1_admin-permissions-152849157974`
- **Current deployed sites:** claretandblue, hardfork, listenfairplay, naddpod ✅
- **Future sites:** myfavoritemurder, searchengine (can be added later using established patterns)

### Lambda Functions Per Site
- `retrieve-rss-feeds-and-download-audio-files-{site_id}`
- `process-new-audio-files-via-whisper-{site_id}`
- `convert-srts-indexed-search-{site_id}` (indexing)

### Current Package.json Commands
- `run:local` → Direct execution via `tsx {script}.ts`
- `run:site` → Execution via `scripts/run-lambda-for-site.ts` (triggers actual AWS lambdas)

## Required Changes

### 1. Package.json Script Updates
- **Remove**: `:local` and `:prod` suffixes from all ingestion lambda scripts
- **Default**: All scripts run locally (free transcription)
- **Hidden option**: Allow `--env=prod` override (not documented in script names)
- **New script**: `scheduled:run-ingestion-and-trigger-indexing`

### 2. New Scheduled Script Behavior
1. Run RSS retrieval for all sites (local)
2. Run transcription for all sites (local) 
3. For any sites with new SRT files → trigger AWS indexing lambda for that site
4. Use `SCHEDULED_RUN_MAIN_AWS_PROFILE` environment variable
5. Use terraform outputs to get lambda function names
6. Must work without user interaction (automated)

### 3. New Terraform Structure ✅ COMPLETE
```
terraform/
├── sites/     ✅ Site infrastructure (deployed for all 4 sites)
├── homepage/  ✅ Homepage infrastructure (existing)
└── automation/ ✅ Cross-account automation (deployed and tested)
```

### 4. Cross-Account IAM Setup ✅ COMPLETE
- ✅ Central automation user with long-lived credentials created
- ✅ Permissions deployed for all sites:
  - S3 upload to all site buckets: `{site_id}-browse-dot-show`
  - Lambda invoke for indexing functions: `convert-srts-indexed-search-{site_id}`
- ✅ Credentials stored in gitignored `.env.automation` file
- ✅ Validation script ensures proper role configuration

## Final Recommendations

### Q1: Cross-Account Architecture ✅
**DECISION: Option A - Central account with role that assumes roles in each site account**

**Rationale:**
- Most secure and follows AWS best practices
- Centralized credential management 
- Each site account only needs to trust one central role
- Easier to audit and manage permissions
- Can easily add/remove sites without changing central credentials

### Q2: Credential Type ✅
**DECISION: Option A - IAM user with permanent access keys**

**Rationale:**
- Simple and reliable for automation scripts running on a single machine
- No session expiration issues that could break automated runs
- Easy to manage locally in gitignored `.env.automation` file
- SSO profiles require manual re-authentication which defeats automation purpose

### Q3: Permission Strategy ✅
**DECISION: Option B - AssumeRole chain to access each site's resources**

**Rationale:**
- Most secure - central user only has permission to assume roles, not direct resource access
- Each site controls what the automation role can do via IAM policies
- Follows principle of least privilege
- Can easily grant/revoke access per site

### Q4: Terraform State Access ✅
**DECISION: Option A - Remote state data sources to read site terraform outputs**

**Rationale:**
- Clean separation - automation terraform reads outputs from site terraform
- No need to store outputs in shared locations
- Leverages existing terraform state infrastructure
- Can dynamically discover deployed sites vs configured sites

### Q5: Site Discovery ✅
**DECISION: Option A - Use existing site discovery logic with terraform state validation**

**Rationale:**
- Maintains consistency with existing patterns
- Can filter to only sites that are actually deployed (have terraform state)
- No need to maintain separate configuration files

## Detailed Implementation Plan

### Phase 1: Terraform Restructure
1. **Move existing terraform directories:**
   ```bash
   mv terraform terraform-sites-temp
   mv terraform-homepage terraform-homepage-temp
   mkdir terraform
   mv terraform-sites-temp terraform/sites
   mv terraform-homepage-temp terraform/homepage
   ```

2. **Update all references:**
   - Update script paths that reference `terraform/` → `terraform/sites/`
   - Update script paths that reference `terraform-homepage/` → `terraform/homepage/`
   - Update package.json scripts
   - Update documentation

3. **Create automation terraform:**
   ```
   terraform/automation/
   ├── main.tf              # Central IAM user + cross-account roles
   ├── variables.tf         # Configuration variables
   ├── outputs.tf           # User credentials, role ARNs
   ├── data.tf              # Remote state data sources for all sites
   └── terraform.tfvars     # Environment-specific config
   ```

### Phase 2: Cross-Account IAM Setup

#### Central Automation Account Setup
1. **Create IAM user in a central account:**
   ```hcl
   resource "aws_iam_user" "automation_user" {
     name = "browse-dot-show-automation"
   }
   
   resource "aws_iam_access_key" "automation_key" {
     user = aws_iam_user.automation_user.name
   }
   ```

2. **Grant assume role permissions:**
   ```hcl
   resource "aws_iam_user_policy" "assume_site_roles" {
     user = aws_iam_user.automation_user.name
     policy = jsonencode({
       Version = "2012-10-17"
       Statement = [
         {
           Effect = "Allow"
           Action = "sts:AssumeRole"
           Resource = [for site in var.deployed_sites : 
             "arn:aws:iam::${data.terraform_remote_state.sites[site].outputs.account_id}:role/browse-dot-show-automation-role"
           ]
         }
       ]
     })
   }
   ```

#### Per-Site Role Setup
3. **Add to each site's terraform:**
   ```hcl
   resource "aws_iam_role" "automation_role" {
     name = "browse-dot-show-automation-role"
     assume_role_policy = jsonencode({
       Version = "2012-10-17"
       Statement = [
         {
           Effect = "Allow"
           Principal = {
             AWS = "arn:aws:iam::${var.automation_account_id}:user/browse-dot-show-automation"
           }
           Action = "sts:AssumeRole"
         }
       ]
     })
   }
   
   resource "aws_iam_role_policy" "automation_permissions" {
     role = aws_iam_role.automation_role.id
     policy = jsonencode({
       Version = "2012-10-17"
       Statement = [
         {
           Effect = "Allow"
           Action = [
             "s3:PutObject",
             "s3:PutObjectAcl"
           ]
           Resource = "${module.s3_bucket.bucket_arn}/*"
         },
         {
           Effect = "Allow"
           Action = "lambda:InvokeFunction"
           Resource = module.indexing_lambda.lambda_function_arn
         }
       ]
     })
   }
   ```

### Phase 3: Script Updates

#### Update Individual Lambda Package.json Files
1. **RSS Retrieval Lambda** (`packages/ingestion/rss-retrieval-lambda/package.json`):
   ```json
   {
     "scripts": {
       "run": "tsx retrieve-rss-feeds-and-download-audio-files.ts",
       "run:prod": "tsx ../../../scripts/run-lambda-for-site.ts @browse-dot-show/rss-retrieval-lambda retrieve-rss-feeds-and-download-audio-files.ts"
     }
   }
   ```

2. **Audio Processing Lambda** (`packages/ingestion/process-audio-lambda/package.json`):
   ```json
   {
     "scripts": {
       "run": "tsx process-new-audio-files-via-whisper.ts",
       "run:prod": "tsx ../../../scripts/run-lambda-for-site.ts @browse-dot-show/process-audio-lambda process-new-audio-files-via-whisper.ts"
     }
   }
   ```

3. **SRT Indexing Lambda** (`packages/ingestion/srt-indexing-lambda/package.json`):
   ```json
   {
     "scripts": {
       "run": "tsx convert-srts-indexed-search.ts",
       "run:prod": "tsx ../../../scripts/run-lambda-for-site.ts @browse-dot-show/srt-indexing-lambda convert-srts-indexed-search.ts"
     }
   }
   ```

#### Update Root Package.json
```
```

**Results:**
- IAM user created: `browse-dot-show-automation` 
- Access key: `AKIAUKMVCBPKN67ZN7UV`
- User ARN: `arn:aws:iam::297202224084:user/automation/browse-dot-show-automation`
- `.env.automation` file created with credentials ✅
- Cross-account policies configured for hardfork account (`927984855345`)

#### 2.4: Add Automation Role to Hardfork Site ✅ COMPLETE
1. ✅ Add `automation_account_id` variable to site terraform variables.tf - COMPLETE
2. ✅ Add automation role resource to hardfork site terraform main.tf - COMPLETE  
3. ✅ Deploy hardfork terraform updates using existing `pnpm deploy:site` command - COMPLETE

#### 2.5: Test Cross-Account Access ✅ COMPLETE
**Test Results (hardfork site):**
1. ✅ **Role Assumption:** Successfully assumed `browse-dot-show-automation-role` in hardfork account
2. ✅ **S3 Upload:** Successfully uploaded test files to `hardfork-browse-dot-show` bucket  
3. ✅ **S3 Delete:** Successfully deleted test files (cleanup operations working)
4. ✅ **Lambda Invoke:** Successfully tested invoke permissions for `convert-srts-indexed-search-hardfork`

**Test Results (All Sites):** ✅ COMPLETE
All 4 sites successfully tested for cross-account automation access:
1. ✅ **Role Assumption:** Successfully assumed `browse-dot-show-automation-role` in all site accounts
2. ✅ **S3 Access:** Successfully uploaded/deleted test files in all site buckets
3. ✅ **Lambda Invoke:** Successfully tested invoke permissions for all site indexing lambdas

**Permissions Deployed:**
- `s3:PutObject` - ✅ Working
- `s3:PutObjectAcl` - ✅ Working  
- `s3:DeleteObject` - ✅ Working (added for cleanup operations)
- `lambda:InvokeFunction` - ✅ Working

**Test Command:** `tsx scripts/test-cross-account-access.ts --site=<site_id>`
**Status:** All sites tested and automation infrastructure complete.