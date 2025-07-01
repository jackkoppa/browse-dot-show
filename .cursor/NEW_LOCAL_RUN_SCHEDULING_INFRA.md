# New Local Run Scheduling Infrastructure

## 🚀 Implementation Progress

### Phase 1: Terraform Restructure ✅ COMPLETE
- [x] 1.1: Move terraform directories safely ✅
- [x] 1.2: Update script references to new paths ✅
- [x] 1.3: Create automation terraform structure ✅
- [x] 1.4: Test existing functionality still works ✅

### Phase 2: Cross-Account IAM Setup ⚠️ IN PROGRESS
- [x] 2.1: Create automation terraform infrastructure ✅
- [x] 2.2: Deploy central IAM user and policies ✅ 
- [x] 2.3: Deploy central automation infrastructure ✅
- [x] 2.4: Add automation roles to hardfork site terraform ✅ READY FOR DEPLOYMENT
- [ ] 2.5: Test cross-account access

### Phase 3: Script Updates
- [ ] 3.1: Update individual lambda package.json files
- [ ] 3.2: Update root package.json
- [ ] 3.3: Update run-with-site-selection.ts for --env=prod support
- [ ] 3.4: Test updated script commands

### Phase 4: New Scheduled Script
- [ ] 4.1: Create scheduled script skeleton
- [ ] 4.2: Implement automation credential loading
- [ ] 4.3: Implement local ingestion execution
- [ ] 4.4: Implement SRT file change detection
- [ ] 4.5: Implement AWS lambda triggering
- [ ] 4.6: Test end-to-end functionality

### Phase 5: Environment Setup
- [ ] 5.1: Create .env.automation.template
- [ ] 5.2: Update .gitignore
- [ ] 5.3: Deploy automation infrastructure
- [ ] 5.4: Configure local credentials
- [ ] 5.5: Set up local scheduling

## 🎯 Current Status & Next Steps

### ✅ COMPLETED (Phase 1 & Phase 2.1-2.3):
1. **Terraform restructure** - All terraform moved to consistent structure
2. **File naming consistency** - All deploy scripts follow same patterns  
3. **Automation infrastructure** - Central IAM user deployed and ready
4. **Credentials configured** - `.env.automation` file created with working credentials
5. **Cross-account policies** - Automation user can assume roles in site accounts

### ⚠️ IMPORTANT INSTRUCTION FOR FUTURE AGENTS:
**All scripts that will possibly modify AWS resources should be run by the human dev. If you ever need to test a script that will modify AWS resources (e.g. run Terraform changes), finish your work, then prompt the dev with what should be run, so they can run & report the logs back to you.**

### ⚠️ NEXT STEPS (Resume here):

**Immediate:** Phase 2.4 - READY FOR DEPLOYMENT
1. ✅ Update `terraform/sites/variables.tf` with `automation_account_id` variable - COMPLETE
2. ✅ Update `terraform/sites/main.tf` with automation role resources - COMPLETE
3. 🚀 Deploy hardfork site: Run `pnpm deploy:site` and select hardfork - WAITING FOR DEV

**Then:** Phase 2.5 - Test cross-account access
1. Test role assumption from automation account to hardfork
2. Verify S3 and Lambda permissions work

**Finally:** Phase 2.6 - Roll out to all sites
1. Update automation terraform to include all sites
2. Add automation roles to all remaining sites
3. Test all cross-account access

### 🔑 Key Information for Resuming:
- **Automation Account:** `297202224084` (browse.show-0_account--root)
- **Automation User:** `browse-dot-show-automation` 
- **Access Key:** REQUEST_THIS_FROM_DEV - SAVED_OUTSIDE_OF_GIT
- **Test Target:** `hardfork` site in account `927984855345`
- **Credentials:** Ready in `.env.automation` file

## 📚 Key Reference Files (for Future Agents)

### Current Architecture Understanding
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

### Terraform Infrastructure
- `terraform/main.tf` - Current site infrastructure (TO BE MOVED)
- `terraform/outputs.tf` - Current terraform outputs (TO BE MOVED)
- `terraform/variables.tf` - Site configuration variables (TO BE MOVED)
- `terraform/environments/*.tfvars` - Site-specific terraform variables (TO BE MOVED)
- `terraform/backend-configs/*.tfbackend` - Site-specific terraform backends (TO BE MOVED)

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
- Current deployed sites: claretandblue, hardfork, listenfairplay, naddpod
- Upcoming sites: myfavoritemurder, searchengine

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

### 3. New Terraform Structure
```
terraform/
├── sites/     (current terraform/ renamed)
├── homepage/  (current terraform-homepage/ moved)
└── automation/ (NEW - manages cross-account role & permissions)
```

### 4. Cross-Account IAM Setup
- Create role/user with long-lived credentials
- Permissions needed:
  - S3 upload to all site buckets: `{site_id}-browse-dot-show`
  - Lambda invoke for indexing functions: `convert-srts-indexed-search-{site_id}`
- Store credentials in gitignored `.env.automation` file

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