# Background

This repository, up to this point, has only deployed a single application, at a single domain: listenfairplay.com. That site currently handles indexing & searching for 2 podcast feeds:
1. `football-cliches`
2. `for-our-sins-the-cliches-pod-archive`

These are defined in `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/config/rss-config.ts`

Those 2 feeds represent the same essential podcast (one is the old feed, one the current one).
That site is working great, and has been for a few weeks.

Now, it's time to update this repository to be able to support a few more deployed "sites" (each of these for archiving & searching one podcast each). And, crucially, for other people to be able to clone this repository, and after providing their own `/Users/jackkoppa/Personal_Development/browse-dot-show/sites/my-sites/` - which includes their own AWS SSO account where the application infrastructure will be deployed - other people will be able to run/host their *own* sites, for the podcast(s) in which they're most interested.

So there's a *lot* of abstracting we're going to have to do. Most complex might be updating Terraform variable files, so that we can deploy an arbitrary number of different sites - and have all their application infrastructure tagged with the appropriate `site` `id`. Some of these `sites` may be deployed in the same AWS root account. **But many `sites` will be deployed in completely separate AWS accounts**, and that needs to be supported as well.

Similarly, there are likely a few (not too many, but some) places in the client-facing React code that are currently _Football Clichés_-specific. We'll want to update those places to use the relevant config values from `sites`.

For now, we're still not implementing CI/CD - all deploys will continue to be performed from the local CLI of whomever has cloned the repo and/or its fork. 

But that means that many different scripts will need to be updated to:
* likely provide a default .env `ENV_VARIABLE_SOME_NAME` - that is the default selected site, that commands (including existing local `pnpm` commands, and also `deploy.sh`-style commands) should apply to
* Prompt the user before running the command if they want to _switch_ to have it apply to a different `/sites` option

Especially important for deployment. But also for all the other scripts, like `pnpm client:dev` or `pnpm process-audio-lambda:run:local`

Again: currently, only `listenfairplay.com` is currently working. But we have already tested the various `pnpm` commands on 3 other `sites` in advance, so that we have all the downloaded `audio`, `transcripts`, and `search-entries` files for those, and we'll be ready to start testing each once the repo has been adjusted to support multi-sites.

Those basic config files have now already been created. See: `/Users/jackkoppa/Personal_Development/browse-dot-show/sites/origin-sites/README.md`

The task here is to carefully & deliberately plan out implementation for adding this multi-sites support. Eventually, we will implement that together.

Important: take your time going through **all** directories near the top level in this repo, to make sure you understand the full context.

Expecially important:
* `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/client/`
* `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/ingestion/`
* `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/s3/`
* `/Users/jackkoppa/Personal_Development/browse-dot-show/packages/search/`
* `/Users/jackkoppa/Personal_Development/browse-dot-show/scripts/`
* `/Users/jackkoppa/Personal_Development/browse-dot-show/sites/`
* `/Users/jackkoppa/Personal_Development/browse-dot-show/terraform/`
* `/Users/jackkoppa/Personal_Development/browse-dot-show/README.md`


--- AGENTS: DO NOT EDIT ABOVE THIS LINE. ONLY EDIT BELOW THIS LINE. ADD QUESTIONS, AND IMPLEMENTATION PLANS, BELOW. ADD PHASES THAT ARE RELEVANT, WRITE VERY SUCCINCTLY, AND LIST OUT THE MOST RELEVANT FILES FOR CONTEXT ---

## Questions for Dev (dev's answers inline)

1. **Site Selection Strategy**: How should users select which site to work with? Should we:
   - Use a default site from `.env` file (e.g., `DEFAULT_SITE_ID=listenfairplay`)?
   - Always prompt users to select from available sites in `/sites/origin-sites/` or `/sites/my-sites/`?
   - Pass site ID as a CLI argument (e.g., `pnpm client:dev --site=hardfork`)?
   - **Answer**: Always prompt users to select from available sites. We should always start with the one in `DEFAULT_SITE_ID=` (at a root .env file) as the first-selected `site`, but we should always prompt, **UNLESS** `SKIP_SITE_SELECTION_PROMPT=true`

2. **AWS Account Separation**: For sites deployed to different AWS accounts, how should we handle:
   - Terraform state files (separate `.tfstate` per site/account)?
   - AWS profile management (should each site config specify its AWS profile)?
   - S3 bucket naming (should bucket names include site ID to avoid conflicts)?
   - **Answer**: 
        * Terraform state files - **yes** - separate `.tfstate` per site
        *  AWS profile management - **yes** - each site config should specify its AWS profile
        * S3 bucket naming - **yes** - even though each site will _possibly_ be deployed to separate AWS accounts, some **could** be deployed to the same AWS account. Thus, their infrastructure (including S3 bucket names) should include their site id. To avoid conflicts.
        Note: this also applies to the Lambdas - each `site` will have its own search Lambda, its own process-audio-lambda, its own rss-retrieval-lambda, and its own srt-indexign-lambda

3. **Build-time vs Runtime Configuration**: The React client currently has hardcoded Football Clichés references. Should we:
   - Generate separate client builds per site (build-time config)?
   - Use a single client that loads site config at runtime via API?
   - Hybrid approach (some config at build-time, some at runtime)?
   - **Answer**: Absolutely these need to be different build-time configs. The static files for each site are going to be deployed to completely different S3 buckets, and as such, any site-specific values need to be set at build time

4. **Site Discovery**: How should scripts discover available sites? Should we:
   - Always check both `/sites/origin-sites/` and `/sites/my-sites/` directories?
   - Use the sites package's `index.ts` to export available sites?
   - Have each site register itself in a central registry?
   - **Answer**:  You can have sites package's `index.ts` export the correct sites. And that can be handled at build time, such that elsewhere in the application, we just import from `@browse-dot-show/sites`. The behavior is: always export only the sites from `/sites/my-sites/`, **UNLESS* there are no sites there. Then export the sites from `/sites/origin-sites/`. See their respective README.md files for that info

5. **Backwards Compatibility**: For the existing `listenfairplay.com` deployment, should we:
   - Maintain current behavior if no site is specified (defaulting to listenfairplay)?
   - Require explicit site selection for all operations going forward?
   - Gradually migrate existing scripts to be site-aware?
   - **Answer**: Require explicit site selection for all operations going forward. Going forward, it should be treated like all other `/sites`. Note that that domain does exist already, so we should try to have minimal impact on it. But we also already have the Terraform state for that domain specifically, so hopefully can update/deploy with limited downtime.

6. **Environment Variables**: Should site-specific env vars be:
   - Stored in each site's directory (e.g., `sites/origin-sites/listenfairplay/.env`)?
   - Merged into root `.env.dev`/`.env.prod` with site prefixes?
   - Passed through command-line arguments?
   - **Answer**: Stored in each site's directory. Plan is for these to be called `sites/origin-sites/{siteID}/.env.aws`. The root `.env` file can still have values that are shared across all sites - good example is `LOG_LEVEL=` and `WHISPER_API_PROVIDER=` and `OPENAI_API_KEY=`

   For reference: see `/Users/jackkoppa/Personal_Development/browse-dot-show/.cursor/EXAMPLES_OF_ENV_FILES.md` for what current .env files do.

## Implementation Plan

## ✅ COMPLETED PHASES (1-5)

**Multi-site support is now fully operational!** The repository successfully supports multiple sites with complete isolation in production and local development. Here's what's been achieved:

### Summary of Completed Work
- **🏗️ Complete Infrastructure**: Site-specific AWS resources, Terraform state management, deployment scripts
- **⚙️ Lambda Processing**: Site-aware RSS processing, search indexing, and audio processing with isolated data
- **🖥️ Client Applications**: Site-specific builds with dynamic configuration injection
- **🛠️ Local Development**: Site-aware development server, asset serving, and local data organization
- **📋 Site Management**: Comprehensive site selection, validation, and configuration system

All scripts now prompt for site selection, all data is isolated by site, and the system supports deployment to multiple AWS accounts.

### 🚀 Quick Start Examples

```bash
# Set up local development for any site
pnpm setup:site-directories      # Create site-specific local directories
pnpm client:dev                  # Start development server (prompts for site)
pnpm rss-retrieval-lambda:run:local  # Run RSS ingestion locally

# Deploy a site to production  
pnpm all:deploy                  # Deploy site infrastructure (prompts for site)

# Build and run site-specific lambdas
cd packages/ingestion/rss-retrieval-lambda
pnpm build:site listenfairplay   # Build lambda for specific site
pnpm run:site listenfairplay     # Run lambda for specific site

# Trigger production lambdas
pnpm trigger:ingestion-lambda    # Trigger deployed lambdas (prompts for site)
```

---

### Phase 1: Core Infrastructure & Site Management ✅

**Files to modify:**
- ✅ `sites/index.ts` - Create site discovery logic (prioritize `my-sites/`, fallback to `origin-sites/`)
- ✅ `sites/types.ts` - Export interfaces for TypeScript support
- ✅ `package.json` - Add site selection prompting to all pnpm scripts
- ✅ `scripts/deploy/deploy.sh` - Add site parameter handling with prompting
- ✅ Root `.env.local`/`.env.dev` - Add `DEFAULT_SITE_ID` and `SKIP_SITE_SELECTION_PROMPT` (handled by user)
- ✅ `scripts/utils/site-selector.js` - Create reusable site selection utility
- ✅ `scripts/run-with-site-selection.js` - Site-aware wrapper script

**Key tasks:**
1. ✅ Create site discovery service that prioritizes `/sites/my-sites/` over `/sites/origin-sites/`
2. ✅ Add CLI prompting for site selection in all scripts (with DEFAULT_SITE_ID pre-selected)
3. ✅ Support `SKIP_SITE_SELECTION_PROMPT=true` to bypass prompting
4. ✅ Create site validation (ensure site config exists, `.env.aws` exists, AWS profile is valid)
5. ✅ Create reusable site selection utility for consistent UX across all scripts

### Phase 2: Terraform Multi-Site Support ✅

**Files to modify:**
- ✅ `terraform/variables.tf` - Add `site_id` variable, make all resource names site-specific
- ✅ `terraform/main.tf` - Use site-specific resource naming and tagging for complete isolation
- ✅ `terraform/modules/s3/` - Update S3 module to use site_id instead of environment
- ✅ `terraform/modules/cloudfront/` - Update CloudFront module for site-specific naming
- ✅ `terraform/modules/lambda/` - Update Lambda module for site-specific functions
- ✅ `terraform/modules/eventbridge/` - Update EventBridge module for site-specific schedules
- ✅ `scripts/deploy/deploy.sh` - Use site-specific terraform state files (`.tfstate` per site)
- ✅ `terraform/environments/listenfairplay-prod.tfvars` - Create site-specific `.tfvars` files

**Key tasks:**
1. ✅ Make ALL AWS resources site-specific: S3 buckets, Lambda names (search, process-audio, rss-retrieval, srt-indexing), CloudFront distributions
2. ✅ Implement site-specific Terraform state management (separate `.tfstate` files per site)
3. ✅ Add site tagging to all AWS resources for cost tracking and organization
4. ✅ Support multiple AWS profiles/accounts through site-specific `.env.aws` files
5. ✅ Ensure complete infrastructure isolation between sites (even in same AWS account)
6. ✅ Remove dev/prod environment distinction in favor of site-specific deployments

### Phase 3: Client Application Site-Awareness ✅

**Files Modified:**
- ✅ `packages/client/src/components/AppHeader.tsx` - Replaced hardcoded Football Clichés references with dynamic site config
- ✅ `packages/client/src/components/PlayTimeLimitDialog.tsx` - Made podcast links dynamic using site config
- ✅ `packages/client/vite.config.ts` - Added site config injection at build time via `loadSiteConfig()`
- ✅ `packages/client/src/config/site-config.ts` - Created build-time site config loading system
- ✅ `packages/client/package.json` - Updated build scripts to require `SITE_ID` parameter

**Key Implementation Details:**
- ✅ **Build-time Config Injection**: Site configuration loaded from `site.config.json` → environment variables → React app
- ✅ **Dynamic Site Values**: All hardcoded strings replaced with `VITE_SITE_*` environment variables
- ✅ **Site-Specific Builds**: Each site generates separate client build with baked-in configuration
- ✅ **Error Handling**: Build scripts enforce site selection - no default fallback
- ✅ **TypeScript Support**: Full type safety for site configuration throughout client code

### Phase 4: Lambda Functions & Processing ✅

**Files Modified:**
- ✅ `packages/config/rss-config.ts` - Added site-aware functions: `getRSSConfigForSite()`, `getCurrentSiteId()`, `getCurrentSiteRSSConfig()`
- ✅ `packages/s3/index.ts` - Updated S3 paths for site-specific buckets and local storage
- ✅ `packages/constants/index.ts` - Added site-aware path functions: `getEpisodeManifestKey()`, `getSearchIndexKey()`, `getLocalDbPath()`
- ✅ All lambda `package.json` files - Added site-specific scripts: `build:site`, `run:site`, `dev:site`, `test:site`
- ✅ `packages/ingestion/rss-retrieval-lambda/` - Updated to use site-specific RSS config and S3 paths
- ✅ `scripts/build-lambda-for-site.sh` - New script for building lambdas for specific sites
- ✅ `scripts/run-lambda-for-site.sh` - New script for running lambdas for specific sites

**Key Implementation Details:**
- ✅ **Site-Specific S3 Structure**: Production buckets: `browse-dot-show-{siteId}-s3-prod`, Local: `aws-local-dev/s3/sites/{siteId}/`
- ✅ **RSS Configuration**: Each site reads from its own `site.config.json` instead of hardcoded values
- ✅ **Lambda Isolation**: Each site gets its own lambda instances with site-specific naming
- ✅ **Environment Variables**: `CURRENT_SITE_ID` passed to all lambdas for site context
- ✅ **Backwards Compatibility**: Legacy exports and paths maintained for existing deployments
- ✅ **Data Isolation**: Complete separation of processing data between sites

### Phase 5: Local Development & Testing ✅

**Files Modified:**
- ✅ `scripts/trigger-ingestion-lambda.sh` - Added site selection and site-specific lambda invocation
- ✅ `packages/client/package.json` - Updated to use site-aware asset serving script
- ✅ `packages/client/vite.config.ts` - Already serving site-specific transcript files (confirmed working)
- ✅ `package.json` - Updated all pnpm scripts with site selection and removed `:dev-s3` variants
- ✅ `scripts/serve-site-assets.js` - New script for serving site-specific assets
- ✅ `scripts/setup-site-local-directories.js` - New script for creating site-specific local directories

**Key Implementation Details:**
- ✅ **Site-Specific Local Structure**: `aws-local-dev/s3/sites/{siteId}/` with full directory hierarchy (audio, transcripts, search-entries, etc.)
- ✅ **Asset Serving**: Dynamic asset serving from site-specific directories with legacy fallback
- ✅ **Lambda Triggering**: Site selection + site-specific lambda names (e.g., `retrieve-rss-feeds-{siteId}`)
- ✅ **Environment Loading**: Combines shared `.env.local` with site-specific `.env.aws` files
- ✅ **Legacy Migration**: Automated migration of existing data to site-specific structure
- ✅ **Complete Isolation**: Local development mirrors production site isolation perfectly

## ✅ COMPLETED PHASES (1-6)

### Phase 6: Documentation & Developer Experience ✅

**Files created/modified:**
- ✅ `sites/my-sites/README.md` - Comprehensive instructions for users to create their own sites
- ✅ `sites/my-sites/example-site/` - Complete template site configuration with all required files
- ✅ Root `README.md` - Updated with comprehensive multi-site usage instructions
- ✅ `scripts/create-new-site.sh` - Interactive helper script for creating new sites
- ✅ `package.json` - Added `pnpm create:site` command

**Key accomplishments:**
1. ✅ **Comprehensive Documentation**: Created detailed guides for setting up new sites with examples, troubleshooting, and best practices
2. ✅ **Template Configuration**: Provided complete example site with `site.config.json`, `aws.config.template`, and `index.css`
3. ✅ **Interactive Site Creation**: Built guided script with validation for site IDs, domains, RSS URLs, and AWS profiles
4. ✅ **Error Handling & Validation**: Added comprehensive validation for all user inputs and configuration files
5. ✅ **Developer Experience**: Created clear workflows from site creation to deployment with helpful error messages

**Usage Examples:**
```bash
# Create new site with guided setup
pnpm create:site

# Copy example template manually  
cp -r sites/my-sites/example-site sites/my-sites/my-podcast

# Comprehensive documentation
cat sites/my-sites/README.md
cat README.md
```

## ✅ COMPLETED PHASES (1-7)

### Phase 7: Environment Simplification (Remove Dev/Prod Split) ✅

**Files Modified:**
- ✅ `terraform/environments/dev.tfvars` - Removed dev environment file
- ✅ `terraform/environments/prod.tfvars` - Removed generic prod environment file (keep only site-specific)
- ✅ `.env.dev` → `.env.prod` - Renamed root environment file
- ✅ `package.json` - Updated to use `all:build:prod` instead of `all:build:dev`
- ✅ `scripts/deploy/deploy.sh` - Removed environment selection prompt, deploy only to prod
- ✅ `scripts/deploy/check-prerequisites.sh` - Updated to use `.env.prod`
- ✅ `scripts/deploy/destroy.sh` - Updated to use `.env.prod` and site-specific tfvars
- ✅ `scripts/deploy/upload-client.sh` - Updated to use `.env.prod` and site-specific builds
- ✅ `scripts/TEMP-download-all-bucket-objects-to-local.sh` - Updated to use `.env.prod`
- ✅ All lambda package.json files - Removed `:dev-s3` scripts, kept `:local` and `:prod`

**Key Accomplishments:**
1. ✅ **Simplified deployment model**: Each site has only ONE deployed environment (prod)
2. ✅ **Removed dev/prod distinction**: No more separate dev & prod infrastructure per site  
3. ✅ **Script cleanup**: Removed all `:dev-s3` variants, kept only `:local` (development) and `:prod` (deployed)
4. ✅ **Environment file consolidation**: Use single `.env.prod` instead of dev/prod variants
5. ✅ **Faster deployment**: Sites can tolerate brief downtime instead of maintaining dual environments
6. ✅ **Updated all scripts**: All deployment and utility scripts now use the simplified model

**Final Architecture:**
- **Local Development**: `:local` scripts use `.env.local` + site-specific local directories
- **Production Deployment**: `:prod` scripts use `.env.prod` + site-specific terraform configs
- **Site Isolation**: Each site deploys to its own prod infrastructure using `{siteId}-prod.tfvars`

## 🎯 PROJECT COMPLETE

### Critical Implementation Notes:

1. **No Backwards Compatibility**: ALL operations require explicit site selection going forward - treat listenfairplay like any other site
2. **Complete Site Isolation**: Ensure total isolation between sites (separate S3 buckets, terraform state, lambda instances, data paths)
3. **Environment Variable Strategy**: Site-specific `.env.aws` files + shared root `.env` for common values (LOG_LEVEL, OPENAI_API_KEY, etc.)
4. **Build-time Configuration**: All client builds are site-specific with config baked in at build time
5. **AWS Profile Management**: Each site specifies its AWS profile in `.env.aws` for multi-account support
6. **Site Discovery Logic**: Prioritize `/sites/my-sites/` over `/sites/origin-sites/` (allows overriding origin sites)
7. **Minimal Downtime**: Existing listenfairplay.com should continue working during migration with careful terraform state management
8. **🆕 Single Environment Per Site**: Each site deploys only to prod - no dev/prod infrastructure split

### Most Relevant Files for Context:

- `sites/origin-sites/listenfairplay/site.config.json` - Current site structure
- `packages/config/rss-config.ts` - Current RSS configuration
- `terraform/main.tf` - Current infrastructure setup
- `scripts/deploy/deploy.sh` - Current deployment process
- `packages/client/src/components/AppHeader.tsx` - Hardcoded site content
- `packages/client/vite.config.ts` - Build configuration
- `terraform/variables.tf` - Infrastructure variables




