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

### Phase 3: Client Application Site-Awareness

**Files to modify:**
- `packages/client/src/components/AppHeader.tsx` - Remove hardcoded Football Clichés references
- `packages/client/src/components/PlayTimeLimitDialog.tsx` - Make podcast links dynamic
- `packages/client/vite.config.ts` - Add site config injection at build time
- `packages/client/src/config/site-config.ts` - Create build-time site config loading
- `packages/client/package.json` - Update build scripts to accept site parameter

**Key tasks:**
1. Create build-time site config injection (site.config.json → environment variables → React app)
2. Replace ALL hardcoded strings with dynamic site config values
3. Add site-specific styling support (CSS files from site directories)
4. Generate separate client builds per site (each deployed to different S3 buckets)
5. Update build scripts to require site selection and load site-specific configs
6. Ensure no runtime site switching - everything baked in at build time

### Phase 4: Lambda Functions & Processing

**Files to modify:**
- `packages/ingestion/` - Make RSS processing site-aware
- `packages/search/` - Update search to work with site-specific data
- `packages/s3/` - Update S3 paths to be site-specific
- All lambda package.json scripts - Add site parameter support
- `packages/config/rss-config.ts` - Remove hardcoded config in favor of site-specific configs

**Key tasks:**
1. Update S3 path structures to include site ID (e.g., `s3://bucket-siteid/audio/` or `s3://bucket/sites/hardfork/audio/`)
2. Make RSS processing read from site-specific configs (each site's `includedPodcasts`)
3. Update search indexing to work with site-specific data and indexes
4. Ensure all lambdas receive site context through environment variables
5. Remove centralized RSS_CONFIG in favor of site.config.json files
6. Each site gets its own lambda instances (search-lambda-siteid, process-audio-lambda-siteid, etc.)

### Phase 5: Local Development & Testing

**Files to modify:**
- `scripts/trigger-ingestion-lambda.sh` - Add site parameter
- `packages/client/package.json` - Update dev scripts for site selection
- `packages/client/vite.config.ts` - Serve site-specific transcript files
- All pnpm script commands - Add site selection prompting
- `aws-local-dev/` - Create site-specific local data directories

**Key tasks:**
1. Update local dev server to serve site-specific assets from `aws-local-dev/s3/sites/{siteId}/`
2. Make transcript serving site-aware (load from site-specific directories)
3. Update ALL local development scripts to prompt for site selection
4. Create site-specific local data directories for development
5. Update all pnpm commands to load site-specific environment variables
6. Ensure local development mirrors the site isolation of production

### Phase 6: Documentation & Developer Experience

**Files to create/modify:**
- `sites/my-sites/README.md` - Instructions for users to create their own sites
- `sites/my-sites/example-site/` - Template site configuration
- Root `README.md` - Update with multi-site usage instructions
- `scripts/create-new-site.sh` - Helper script for creating new sites

**Key tasks:**
1. Create comprehensive documentation for setting up new sites
2. Provide template configurations and example sites
3. Create helper scripts for common multi-site operations
4. Add validation and error handling for site configurations

### Phase 7: Environment Simplification (Remove Dev/Prod Split)

**Files to modify:**
- `terraform/environments/` - Remove `dev.tfvars`, keep only site-specific `prod.tfvars` files
- `package.json` - Remove all `:dev-s3` script variants, keep only `:local` and `:prod`
- `scripts/deploy/deploy.sh` - Remove environment selection prompt, deploy only to prod
- All lambda package.json files - Remove `:dev-s3` scripts
- `terraform/variables.tf` - Remove environment-based variables
- `.env.dev` → `.env.prod` (rename and consolidate)

**Key tasks:**
1. 🎯 **Simplify deployment model**: Each site has only ONE deployed environment (prod)
2. 🗑️ **Remove dev/prod distinction**: No more separate dev & prod infrastructure per site  
3. 📝 **Script cleanup**: Remove all `:dev-s3` variants, keep only `:local` (development) and `:prod` (deployed)
4. 🏗️ **Terraform simplification**: Remove environment-based resource naming, use site-based only
5. 📂 **File consolidation**: Use single `.env.prod` per site instead of dev/prod variants
6. ⚡ **Faster deployment**: Sites can tolerate brief downtime instead of maintaining dual environments

**Rationale:** Site usage isn't high enough to justify separate dev/prod infrastructure. Each site becomes its own "environment" with simple local development → production deployment workflow.

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




