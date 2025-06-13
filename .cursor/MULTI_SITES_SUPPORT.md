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

1. 


2. 


3. 



## Implementation Plan




