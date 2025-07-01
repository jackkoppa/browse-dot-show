# New Local Run Scheduling Infrastructure

## 🚀 Implementation Progress

### Phase 1: Terraform Restructure ✅ COMPLETE
- [x] 1.1: Move terraform directories safely ✅
- [x] 1.2: Update script references to new paths ✅
- [x] 1.3: Create automation terraform structure ✅
- [x] 1.4: Test existing functionality still works ✅

### Phase 2: Cross-Account IAM Setup ⚠️ READY TO START
- [ ] 2.1: Create automation terraform infrastructure
- [ ] 2.2: Deploy central IAM user and policies
- [ ] 2.3: Add automation roles to each site's terraform
- [ ] 2.4: Test cross-account access

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
```json
{
  "scripts": {
    "rss-retrieval-lambda:run": "tsx scripts/run-with-site-selection.ts \"RSS retrieval\" \"pnpm --filter @browse-dot-show/rss-retrieval-lambda run\"",
    "process-audio-lambda:run": "tsx scripts/run-with-site-selection.ts \"audio processing\" \"pnpm --filter @browse-dot-show/process-audio-lambda run\"",
    "srt-indexing-lambda:run": "NODE_OPTIONS=--max-old-space-size=10240 tsx scripts/run-with-site-selection.ts \"SRT indexing\" \"pnpm --filter @browse-dot-show/srt-indexing-lambda run\"",
    "scheduled:run-ingestion-and-trigger-indexing": "tsx scripts/scheduled-run-ingestion-and-trigger-indexing.ts"
  }
}
```

#### Update run-with-site-selection.ts
Add support for `--env=prod` parameter:
```typescript
// Check for --env= parameter  
let envOverride: string | undefined;
const envArgIndex = commandArgs.findIndex(arg => arg.startsWith('--env='));

if (envArgIndex >= 0) {
    const envArg = commandArgs[envArgIndex];
    envOverride = envArg.split('=')[1];
    // Remove from commandArgs so it doesn't get passed to target command
    commandArgs.splice(envArgIndex, 1);
}

// Modify the command if prod environment requested
if (envOverride === 'prod') {
    // Replace 'run' with 'run:prod' in the command arguments
    const runIndex = commandArgs.indexOf('run');
    if (runIndex >= 0) {
        commandArgs[runIndex] = 'run:prod';
    }
}
```

### Phase 4: New Scheduled Script

#### Create `scripts/scheduled-run-ingestion-and-trigger-indexing.ts`
```typescript
#!/usr/bin/env tsx

import { discoverSites, loadSiteEnvVars, Site } from './utils/site-selector.js';
import { invokeLambda } from './utils/aws-utils.js';
import { spawn } from 'child_process';

interface SiteProcessingResult {
  siteId: string;
  rssSuccess: boolean;
  audioSuccess: boolean;
  hasNewSrtFiles: boolean;
  indexingTriggered: boolean;
  errors: string[];
}

async function loadAutomationCredentials(): Promise<void> {
  const automationProfile = process.env.SCHEDULED_RUN_MAIN_AWS_PROFILE;
  if (!automationProfile) {
    throw new Error('SCHEDULED_RUN_MAIN_AWS_PROFILE environment variable is required');
  }
  
  // Validate automation credentials
  // ... implementation
}

async function runLocalIngestionForSite(siteId: string, command: string[]): Promise<boolean> {
  // Run command with site context (similar to existing runCommandWithSiteContext)
  // ... implementation
}

async function checkForNewSrtFiles(siteId: string): Promise<boolean> {
  // Check if there are new SRT files since last run
  // Could check file timestamps or maintain a state file
  // ... implementation
}

async function triggerIndexingLambda(siteId: string): Promise<boolean> {
  try {
    // Get lambda function name from terraform outputs
    const functionName = `convert-srts-indexed-search-${siteId}`;
    
    // Assume role for this site
    const roleArn = `arn:aws:iam::SITE_ACCOUNT_ID:role/browse-dot-show-automation-role`;
    
    // Invoke lambda
    await invokeLambda(functionName, {}, { 
      profile: process.env.SCHEDULED_RUN_MAIN_AWS_PROFILE,
      assumeRole: roleArn 
    });
    
    return true;
  } catch (error) {
    console.error(`Failed to trigger indexing lambda for ${siteId}:`, error);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('🤖 Scheduled Ingestion and Indexing Run');
  
  // Load automation credentials
  await loadAutomationCredentials();
  
  // Discover deployed sites only
  const sites = discoverSites().filter(site => isDeployed(site.id));
  
  const results: SiteProcessingResult[] = [];
  
  // Phase 1: RSS Retrieval
  for (const site of sites) {
    const rssSuccess = await runLocalIngestionForSite(site.id, [
      'pnpm', '--filter', '@browse-dot-show/rss-retrieval-lambda', 'run'
    ]);
    
    results.push({
      siteId: site.id,
      rssSuccess,
      audioSuccess: false,
      hasNewSrtFiles: false,
      indexingTriggered: false,
      errors: []
    });
  }
  
  // Phase 2: Audio Processing  
  for (let i = 0; i < sites.length; i++) {
    const audioSuccess = await runLocalIngestionForSite(sites[i].id, [
      'pnpm', '--filter', '@browse-dot-show/process-audio-lambda', 'run'
    ]);
    
    results[i].audioSuccess = audioSuccess;
  }
  
  // Phase 3: Check for new SRT files and trigger indexing
  for (let i = 0; i < sites.length; i++) {
    const hasNewSrtFiles = await checkForNewSrtFiles(sites[i].id);
    results[i].hasNewSrtFiles = hasNewSrtFiles;
    
    if (hasNewSrtFiles) {
      const indexingTriggered = await triggerIndexingLambda(sites[i].id);
      results[i].indexingTriggered = indexingTriggered;
    }
  }
  
  // Report results
  console.log('\n📊 Scheduled Run Summary:');
  results.forEach(result => {
    console.log(`\n${result.siteId}:`);
    console.log(`  RSS: ${result.rssSuccess ? '✅' : '❌'}`);
    console.log(`  Audio: ${result.audioSuccess ? '✅' : '❌'}`);
    console.log(`  New SRTs: ${result.hasNewSrtFiles ? '✅' : '⏭️'}`);
    console.log(`  Indexing: ${result.indexingTriggered ? '✅' : '⏭️'}`);
  });
}

function isDeployed(siteId: string): boolean {
  // Check if site has terraform state / is deployed
  // ... implementation
}

main().catch(console.error);
```

### Phase 5: Environment Setup

#### Create `.env.automation.template`
```bash
# AWS credentials for automated ingestion runs
# These credentials should have permissions to assume roles in all site accounts

# The AWS profile to use for automation (created via terraform/automation/)
SCHEDULED_RUN_MAIN_AWS_PROFILE=browse-dot-show-automation

# AWS credentials for the automation user
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_HERE
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY_HERE
AWS_REGION=us-east-1
```

#### Add to .gitignore
```
.env.automation
```

## Files to Modify/Create

### New Files to Create
- `terraform/automation/main.tf` - Cross-account IAM setup
- `terraform/automation/variables.tf` - Configuration variables  
- `terraform/automation/outputs.tf` - Credentials and role outputs
- `terraform/automation/data.tf` - Remote state data sources
- `scripts/deploy/bootstrap-automation-state.ts` - Bootstrap automation terraform state bucket
- `scripts/deploy/deploy-automation.ts` - Deploy automation infrastructure  
- `scripts/scheduled-run-ingestion-and-trigger-indexing.ts` - New automated script
- `.env.automation` - Automation credentials (gitignored)

### Files to Move & Rename ✅ COMPLETE
- `terraform/` → `terraform/sites/` ✅
- `terraform-homepage/` → `terraform/homepage/` ✅
- `scripts/deploy/bootstrap-terraform-state.ts` → `scripts/deploy/bootstrap-site-state.ts` ✅
- `scripts/deploy/deploy.ts` → `scripts/deploy/deploy-site.ts` ✅

### Existing Files to Update
- `package.json` - Update script names, add new scheduled script, add automation scripts ✅
- `.gitignore` - Add .env.automation ✅
- `packages/ingestion/*/package.json` - Update script definitions
- `scripts/run-with-site-selection.ts` - Add `--env=prod` support
- All deployment scripts - Update terraform paths ✅
- Documentation files - Update paths and instructions

## Testing Plan

### Phase 1 Testing
1. Test terraform directory restructure
2. Verify all existing scripts still work
3. Test updated package.json scripts

### Phase 2 Testing  
1. Deploy automation terraform
2. Test cross-account role assumptions
3. Verify S3 and Lambda permissions

### Phase 3 Testing
1. Test updated script commands
2. Verify `--env=prod` override works
3. Test manual runs of new scheduled script

### Phase 4 Testing
1. Test automated scheduled script end-to-end
2. Verify it only triggers indexing for sites with new SRT files
3. Test error handling and reporting
4. Set up local scheduling (cron/equivalent)


## Answers & Refined Implementation Plan

### Automation Account & Credentials ✅
- **Central automation account ID**: `297202224084` (`browse.show-0_account--root`)
- **Same account as homepage S3 bucket** - logical choice for central automation
- **TODO**: Eventually gitignore the account ID, but for now keep in non-gitignored files for simplicity

### Site Account IDs & Terraform State Access ✅
- **Current limitation**: Automation account cannot access site terraform states yet
- **Immediate solution**: Hardcode known site account IDs in automation terraform for Phase 2
- **Future enhancement**: Set up terraform state bucket read access for advanced automation (site deployments)
- **Current focus**: S3 bucket access + indexing lambda invoke permissions only

### Known Site Account IDs (for hardcoding)
- `hardfork`: TBD (will discover during implementation)
- `naddpod`: `152849157974` 
- `claretandblue`: TBD
- `listenfairplay`: TBD

### Deployment Strategy ✅
- **Start with single site**: `hardfork` as proof-of-concept
- **Temporary breakage OK**: No production users, can destroy/recreate if needed
- **Parallel modifications OK**: Comfortable with simultaneous site terraform changes
- **Testing access**: Have creds for main account + naddpod account

### Phase 2 Refined Implementation Order

#### 2.1: Update Automation Terraform Configuration
1. Set automation account ID to `297202224084`
2. Replace terraform state data sources with hardcoded site account mappings
3. Update to focus on `hardfork` site first

#### 2.2: Discover Site Account IDs  
1. Use existing site .env.aws-sso files or terraform outputs to get account IDs
2. Update automation terraform with known account IDs

#### 2.3: Deploy Central Automation Infrastructure ✅ READY
1. Bootstrap automation terraform state bucket: `pnpm automation:bootstrap-state` ✅
2. Deploy automation infrastructure: `pnpm automation:deploy`
3. Verify outputs and capture credentials (automated by deploy script)

#### 2.4: Add Automation Role to Hardfork Site
1. Add `automation_account_id` variable to site terraform
2. Add automation role resource to hardfork site terraform
3. Deploy hardfork terraform updates

#### 2.5: Test Cross-Account Access
1. Configure `.env.automation` with automation credentials
2. Test role assumption for hardfork site
3. Test S3 upload and lambda invoke permissions

#### 2.6: Roll Out to Remaining Sites
1. Add automation roles to claretandblue, listenfairplay, naddpod
2. Deploy all site terraform updates
3. Test cross-account access for all sites

### Future Enhancements (Not Phase 2)
- **Terraform state bucket read access**: For automated site deployments
- **Full site deployment automation**: Replace manual AWS SSO login process
- **Account ID gitignoring**: Move sensitive values to gitignored files 
