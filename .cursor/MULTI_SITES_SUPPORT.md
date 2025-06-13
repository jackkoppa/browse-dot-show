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

### Phase 1: Core Infrastructure & Site Management

**Files to modify:**
- `sites/index.ts` - Create site discovery and validation logic
- `package.json` - Add site selection to all pnpm scripts
- `scripts/deploy/deploy.sh` - Add site parameter handling
- Root `.env.dev`/`.env.prod` - Add DEFAULT_SITE_ID

**Key tasks:**
1. Create site discovery service that reads from both `origin-sites/` and `my-sites/`
2. Add CLI prompting for site selection in all scripts
3. Update root package.json scripts to accept `--site` parameter
4. Create site validation (ensure site config exists, AWS profile is valid, etc.)

### Phase 2: Terraform Multi-Site Support

**Files to modify:**
- `terraform/variables.tf` - Add site_id variable, make bucket names site-specific
- `terraform/main.tf` - Use site-specific resource naming and tagging
- `terraform/modules/` - Update all modules to accept site context
- `scripts/deploy/deploy.sh` - Update to use site-specific terraform state

**Key tasks:**
1. Make all AWS resources site-specific (S3 buckets, Lambda names, CloudFront distributions)
2. Implement site-specific Terraform state management (separate .tfstate files)
3. Add site tagging to all AWS resources for cost tracking and organization
4. Support multiple AWS profiles/accounts through site configs

### Phase 3: Client Application Site-Awareness

**Files to modify:**
- `packages/client/src/components/AppHeader.tsx` - Remove hardcoded Football Clichés references
- `packages/client/src/components/PlayTimeLimitDialog.tsx` - Make podcast links dynamic
- `packages/client/vite.config.ts` - Add site config injection at build time
- `packages/client/src/config/` - Create runtime site config loading

**Key tasks:**
1. Create site config loader that merges site.config.json with default values
2. Replace hardcoded strings with dynamic site config values
3. Add site-specific styling support (CSS files from site directories)
4. Generate site-specific client builds with appropriate configs

### Phase 4: Lambda Functions & Processing

**Files to modify:**
- `packages/ingestion/` - Make RSS processing site-aware
- `packages/search/` - Update search to work with site-specific data
- `packages/s3/` - Update S3 paths to be site-specific
- All lambda package.json scripts - Add site parameter support

**Key tasks:**
1. Update S3 path structures to include site ID (e.g., `s3://bucket/sites/hardfork/audio/`)
2. Make RSS processing read from site-specific configs
3. Update search indexing to work with site-specific data
4. Ensure all lambdas receive site context through environment variables

### Phase 5: Local Development & Testing

**Files to modify:**
- `scripts/trigger-ingestion-lambda.sh` - Add site parameter
- `packages/client/package.json` - Update dev scripts for site selection
- Development middleware in vite.config.ts - Serve site-specific transcript files

**Key tasks:**
1. Update local dev server to serve site-specific assets
2. Make transcript serving site-aware
3. Update all local development scripts to prompt for site selection
4. Create site-specific local data directories

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

### Critical Implementation Notes:

1. **Gradual Migration**: Each phase should maintain backwards compatibility with existing `listenfairplay.com` deployment
2. **Site Isolation**: Ensure complete isolation between sites (separate S3 paths, separate terraform state, etc.)
3. **Error Handling**: Robust validation at each step to prevent cross-site contamination
4. **AWS Profile Management**: Proper handling of different AWS accounts through profile switching
5. **State Management**: Careful handling of terraform state files to prevent conflicts

### Most Relevant Files for Context:

- `sites/origin-sites/listenfairplay/site.config.json` - Current site structure
- `packages/config/rss-config.ts` - Current RSS configuration
- `terraform/main.tf` - Current infrastructure setup
- `scripts/deploy/deploy.sh` - Current deployment process
- `packages/client/src/components/AppHeader.tsx` - Hardcoded site content
- `packages/client/vite.config.ts` - Build configuration
- `terraform/variables.tf` - Infrastructure variables




