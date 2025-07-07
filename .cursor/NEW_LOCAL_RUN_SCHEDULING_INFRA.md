# New Local Run Scheduling Infrastructure

## 🎉 **PHASE 2 COMPLETE!** Cross-Account Automation Infrastructure ✅

**All 6 sites now have automation infrastructure deployed and tested:**
- ✅ All sites from origin-sites/ (claretandblue, hardfork, listenfairplay, myfavoritemurder, naddpod, searchengine)
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
  - [x] searchengine ✅ COMPLETE (deployed & tested)
  - [x] myfavoritemurder ✅ COMPLETE (deployed & tested)

### Phase 3: New Scheduled Script ✅ COMPLETE
- [x] 3.1: Create scheduled script skeleton - `scripts/scheduled-run-ingestion-and-trigger-indexing.ts` ✅
- [x] 3.2: Implement automation credential loading (use `.env.automation`) ✅
- [x] 3.3: Implement local ingestion execution (for all 6 sites) ✅
- [x] 3.4: Implement SRT file change detection ✅
- [x] 3.5: Implement S3 sync for new transcripts before cloud indexing ✅
- [x] 3.6: Implement AWS lambda triggering (using automation role ARNs) ✅
- [x] 3.7: Integration complete 🔄 READY FOR TESTING

### Phase 4: Scheduled Script Improvements 🔄 IN PROGRESS
- [ ] 4.1: Implement S3-to-local pre-sync for existing files
- [ ] 4.2: Enhance file consistency detection using validation tools
- [ ] 4.3: Implement comprehensive local-to-S3 sync for all missing files
- [ ] 4.4: Update sync logic to trigger indexing for any S3 uploads (not just new files)
- [ ] 4.5: Test improved workflow end-to-end

### Phase 5: Script Updates 🔮 FUTURE
- [ ] 5.1: Update individual lambda package.json files
- [ ] 5.2: Update root package.json
- [ ] 5.3: Update run-with-site-selection.ts for --env=prod support
- [ ] 5.4: Test updated script commands

### Phase 6: Environment Setup ✅ COMPLETE
- [x] 6.1: Create .env.automation.template ✅ (automated by deploy script)
- [x] 6.2: Update .gitignore ✅ (already configured)
- [x] 6.3: Deploy automation infrastructure ✅ (deployed and tested)
- [x] 6.4: Configure local credentials ✅ (in `.env.automation`)
- [ ] 6.5: Set up local scheduling (future - after Phase 5 script creation)

## 🎯 Current Status & Next Steps

### ✅ COMPLETED (Phase 1 & Phase 2 - INFRASTRUCTURE COMPLETE):
1. **Terraform restructure** - All terraform moved to consistent structure ✅
2. **File naming consistency** - All deploy scripts follow same patterns ✅
3. **Automation infrastructure** - Central IAM user deployed and tested ✅
4. **All 6 sites deployed** - All sites from origin-sites/ ✅
5. **Cross-account access** - Tested and working for all sites ✅
6. **Validation tooling** - Script to verify automation role configuration ✅

### ⚠️ IMPORTANT INSTRUCTION FOR FUTURE AGENTS:
**All scripts that will possibly modify AWS resources should be run by the human dev. If you ever need to test a script that will modify AWS resources (e.g. run Terraform changes), finish your work, then prompt the dev with what should be run, so they can run & report the logs back to you.**

### ⚠️ NEXT STEPS (Resume here):

**COMPLETED:** Phase 2 - Cross-Account IAM Setup ✅ 
1. ✅ **All 6 Sites Deployed:** All sites from origin-sites/
2. ✅ **Automation Roles:** Properly configured (1 creator per AWS account, others reference existing)
3. ✅ **Cross-Account Access:** All sites tested and working (role assumption, S3 access, lambda invoke)
4. ✅ **Central Automation:** IAM user with permissions to all site accounts

**INFRASTRUCTURE COMPLETE:** ✅
- **Account `152849157974`**: claretandblue (role creator), naddpod (role referencer)
- **Account `927984855345`**: hardfork (role creator), listenfairplay (role referencer)
- **Automation Account `297202224084`**: Central user with assume role permissions for all sites
- **Validation Script:** `packages/validation/validate-automation-role-config.ts` ensures proper configuration

**COMPLETED:** Phase 3 - New Scheduled Script ✅
- All infrastructure is deployed and tested
- Cross-account access working for all 6 sites
- Automated ingestion script created and integrated

**NEEDS FIXES:** Phase 3 workflow has critical sync issues ⚠️
- S3 sync permissions fixed, but workflow logic needs improvement
- Current script can waste time re-processing existing S3 files
- Missing files from previous runs may not be uploaded

**READY FOR:** Phase 4 - Scheduled Script Improvements 🔧
**Goal:** Fix sync issues and make the workflow more robust and efficient

**Completed Changes:**
1. ✅ **New automation script** - Created `scripts/scheduled-run-ingestion-and-trigger-indexing.ts` with complete 4-phase workflow:
   - **Phase 1:** RSS retrieval for all 6 sites (local)
   - **Phase 2:** Audio processing/transcription for all 6 sites (local, free Whisper)
   - **Phase 3:** S3 sync of new transcripts to cloud (for sites with new SRT files)
   - **Phase 4:** Cloud indexing trigger (for sites with successfully synced SRT files)
2. ✅ **Root package.json** - Added new `scheduled:run-ingestion-and-trigger-indexing` script
3. ✅ **S3 Sync Integration** - Extracted core sync functionality from `s3-sync.ts` for non-interactive use

**Remaining Changes (Phase 5):**
4. **Lambda package.json files** - Remove `:local` and `:prod` suffixes, default to local execution (Phase 5)
5. **run-with-site-selection.ts** - Add support for `--env=prod` flag to trigger cloud lambdas (Phase 5)

**Implementation Complete:** Automated ingestion workflow with S3 sync is ready for testing!

## 🔧 Phase 4: Scheduled Script Improvements - Detailed Analysis

### 🚨 Current Issues with Scheduled Script

Based on analysis of `scripts/scheduled-run-ingestion-and-trigger-indexing.ts` and related files, several critical issues need addressing:

#### Issue 1: Missing S3-to-Local Pre-Sync
**Problem:** The script starts with local RSS retrieval and audio processing without first syncing existing S3 files to local storage. This can result in:
- Re-downloading audio files that already exist on S3
- Re-transcribing episodes that already have transcripts on S3
- Waste of time and resources processing files unnecessarily

**Current Workflow:**
```
Phase 1: RSS Retrieval (local) → might download existing S3 audio
Phase 2: Audio Processing (local) → might re-transcribe existing S3 transcripts
Phase 3: S3 Sync (only new files)
Phase 4: Cloud Indexing (only if new files)
```

#### Issue 2: Inadequate Upload Detection
**Problem:** Current script only uploads files if there are newly created SRT files from Phase 2. However:
- Previous script runs might have created local files that failed to upload
- Local files might exist from manual operations or debugging
- Only syncing "new" files misses files that should be on S3 but aren't

**Current Logic (lines 615-625):**
```typescript
const sitesWithNewSrtsForSync = results.filter(result => 
  result.hasNewSrtFiles && result.audioProcessingSuccess
);
```

#### Issue 3: Incomplete File Consistency Checking
**Problem:** No validation that local and S3 files are properly synchronized before starting the workflow.

### 🎯 Proposed Phase 4 Improvements

#### 4.1: Implement S3-to-Local Pre-Sync for Existing Files

**Goals:**
- Before any local processing, sync all existing S3 files to local storage
- Prevent redundant downloads and transcriptions
- Ensure local storage is current with S3 state

**Implementation Approach:**
1. **Pre-Phase 0: S3-to-Local Sync**
   - For each site, sync all S3 content to local directories
   - Use existing `s3-sync.ts` functionality with `direction: 's3-to-local'`
   - Apply `conflictResolution: 'overwrite-if-newer'` to get latest S3 versions
   - Sync all folders: `audio/`, `transcripts/`, `search-entries/`, `episode-manifest/`

**Key Files to Examine:**
- `scripts/s3-sync.ts` (lines 59-74: SyncOptions interface, 75-102: executeS3Sync function)
- Current sync functionality in `scheduled-run-ingestion-and-trigger-indexing.ts` (lines 334-415)

**Implementation Decisions:**
- ✅ Sync all folders with smart file comparison (compare names, download only what's needed)
- ✅ S3 wins for pre-sync conflicts (overwrite-if-newer)
- ✅ Run every time (not optional) - usually no S3 files missing locally anyway
- ✅ Basic validation sufficient

#### 4.2: Enhance File Consistency Detection Using Validation Tools

**Goals:**
- Leverage existing `packages/validation/check-file-consistency.ts` to identify sync gaps
- Create local vs S3 comparison functionality
- Detect files that exist locally but not on S3, and vice versa

**Implementation Approach:**
1. **Adapt File Consistency Checker**
   - Extract core file scanning logic from `check-file-consistency.ts`
   - Create dual-environment version that scans both local and S3
   - Report files missing from either location

2. **Create Local vs S3 Comparison Function**
   ```typescript
   interface SyncGapReport {
     localOnly: string[];      // Files that exist locally but not on S3
     s3Only: string[];         // Files that exist on S3 but not locally  
     consistent: string[];     // Files that exist in both locations
     conflicts: ConflictFile[]; // Files with different versions/timestamps
   }
   ```

**Key Files to Examine:**
- `packages/validation/check-file-consistency.ts` (lines 150-170: scanPodcastFiles function)
- `packages/validation/check-file-consistency.ts` (lines 190-230: groupFilesByEpisode function)
- Current S3 operations in `@browse-dot-show/s3` package

**Implementation Decisions:**
- ✅ Create new validation script (adapt existing check-file-consistency.ts)
- ✅ File-level comparison with smart name matching
- ✅ Run before every scheduled execution (Phase 0.5)
- ✅ Use log.info() for key results, log.debug() for detailed comparison data

#### 4.3: Implement Comprehensive Local-to-S3 Sync for All Missing Files

**Goals:**
- Upload ANY files that exist locally but not on S3 (not just newly created)
- Ensure complete synchronization regardless of when files were created
- Handle partial upload failures from previous runs

**Implementation Approach:**
1. **Replace Current Sync Logic**
   - Current: Only sync sites with `hasNewSrtFiles: true`
   - Proposed: Sync ALL files identified as missing from S3 by consistency checker

2. **Enhanced Sync Strategy**
   ```typescript
   interface ComprehensiveSyncResult {
     siteId: string;
     audioFilesSynced: number;
     transcriptFilesSynced: number;
     searchEntryFilesSynced: number;
     manifestFilesSynced: number;
     totalFilesSynced: number;
     hadPreviousFiles: boolean; // Were there files from previous runs?
   }
   ```

**Implementation Decisions:**
- ✅ Sync all file types (audio, transcripts, search-entries, manifests)
- ✅ No throttling needed (100MB max files, 30-100 MB/s bandwidth)
- ✅ Verify upload success with basic retry logic
- ✅ Log errors but continue processing (proceed to next site/steps)

#### 4.4: Update Sync Logic to Trigger Indexing for Any S3 Uploads

**Goals:**
- Trigger cloud indexing whenever ANY files are uploaded to S3 (not just new files)
- Ensure search indexes are updated even for previously missed uploads
- Make indexing more reliable and comprehensive

**Implementation Approach:**
1. **New Trigger Logic**
   ```typescript
   // Current logic (line 635):
   const sitesWithSuccessfulSync = results.filter(result => 
     result.hasNewSrtFiles && result.audioProcessingSuccess && 
     (result.s3SyncSuccess !== false)
   );
   
   // Proposed logic:
   const sitesRequiringIndexing = results.filter(result => 
     result.totalFilesSynced > 0 || result.s3SyncSuccess === true
   );
   ```

2. **Enhanced Result Tracking**
   - Track all uploaded files, not just newly created ones
   - Report historical vs new file uploads
   - Better failure reporting and retry logic

**Implementation Decisions:**
- ✅ Always trigger indexing if ANY sync occurs
- ✅ Per-site retry for indexing failures (log errors, continue processing)
- ✅ Individual site indexing (better error handling than batching)

#### 4.5: Test Improved Workflow End-to-End

**Goals:**
- Verify new workflow handles all edge cases
- Test performance impact of additional sync operations
- Validate that no files are missed or duplicated

**Test Scenarios:**
1. **Clean Slate Test:** Empty local, populated S3 → should download all, no uploads, indexing only if needed
2. **Local Backlog Test:** Populated local, empty S3 → should upload all, trigger indexing
3. **Mixed State Test:** Partial overlap → should sync differences both ways, trigger indexing
4. **Failure Recovery Test:** Simulate partial failures → should complete remaining operations
5. **Performance Test:** Large file count → should complete within reasonable time

### 🔄 Proposed New Workflow

```
Pre-Phase: S3-to-Local Sync (NEW)
├── Sync all S3 content to local (overwrite-if-newer)
├── Report downloaded file counts
└── Ensure local is current with S3

Phase 0.5: File Consistency Check (NEW)  
├── Compare local vs S3 file states
├── Identify files missing from either location
└── Generate sync plan

Phase 1: RSS Retrieval (EXISTING)
├── Download new episodes from RSS feeds
└── Skip episodes that already exist locally (now more accurate)

Phase 2: Audio Processing (EXISTING)
├── Transcribe new audio files
└── Skip files that already have transcripts (now more accurate)

Phase 3: Comprehensive S3 Sync (ENHANCED)
├── Upload ALL files missing from S3 (not just new ones)
├── Include audio, transcripts, search-entries, manifests
└── Report total sync counts (new + historical)

Phase 4: Cloud Indexing (ENHANCED)
├── Trigger indexing for ANY site with S3 uploads
├── Include sites with historical file uploads
└── Better retry logic for failures
```

### 🧰 Implementation Files and Considerations

**Files to Modify:**
1. `scripts/scheduled-run-ingestion-and-trigger-indexing.ts` - Main workflow updates
2. New file: `scripts/utils/sync-consistency-checker.ts` - Local vs S3 comparison
3. `scripts/s3-sync.ts` - Possibly extract reusable functions

**Files to Reference:**
1. `packages/validation/check-file-consistency.ts` - File scanning and grouping logic
2. `@browse-dot-show/s3` package - S3 operations
3. `@browse-dot-show/constants` package - File path logic

**🔑 Critical Implementation Requirements:**

1. **Idempotency (ESSENTIAL):** Script must remain completely idempotent - running multiple times should produce same result without side effects

2. **Site Selection:** Add optional `--sites=hardfork,listenfairplay` parameter for subset testing (rarely needed but good for initial testing)

3. **Logging Strategy:**
   - `log.info()` for operations users always need to see
   - `log.debug()` for detailed information needed only for debugging failures
   - Log final error summary at end, but continue processing between sites/phases

4. **Error Handling:** Process continues through failures - log errors but proceed to next site or next phase

**Key Questions for Implementation:**

(answers added by dev, with `A:`)
1. **Performance:** How much will pre-sync add to execution time? Should it be optional?
  A: It's fine - let's make sure we're being smart about listing out files, and just comparing file names, and only downloading what we really need. But there should *usually* be no files on S3 that are not already on local, so it's worth doing the sync every time. Not optional.

2. **Storage:** Will syncing all S3 content require significant local disk space?
  A: Nope, we already have almost all the files locally, and we would have generated these files locally during the script anyway. We have 500 GB locally to work with, so space isn't a concern

3. **Bandwidth:** Should we implement bandwidth throttling for large syncs?
  A: The biggest individual files that would be fetched during this sync will be 100 MB, and will be generally run with 30 - 100 MB/s internet speed.

4. **Error Handling:** How to handle partial failures in multi-phase operations?
  A: Up to you. I think as long as we log out any error states at the very end, we can usually proceed (for example, to the next site for processing, or the next steps for a given site)

5. **Logging:** What level of detail needed for debugging sync issues?
  A: Use the log.info() for things we always want to see, and log.debug() for things that we may only need to see on re-runs to debug failures. Keep in mind: it's extremely important for this script to stay idempotent, the way it is currently

6. **Testing:** Should we create a dry-run mode for testing without actual uploads?
  A: Nope, not important. Just provide an optional way to run for only a subset of sites, maybe `--sites=hardfork,listenfairplay` - we'll almost never need that, but it's good to have that option initially

### 🎯 Expected Benefits of Phase 4 Improvements

After implementing Phase 4, the scheduled script will be:

1. **More Efficient:** 
   - No redundant downloads or transcriptions of existing S3 files
   - Local storage always starts in sync with S3 state
   - Skips already-processed files more accurately

2. **More Reliable:**
   - Catches and uploads files missed in previous runs
   - Comprehensive sync ensures no files are left behind
   - Better error recovery and retry logic

3. **More Comprehensive:**
   - Syncs ALL file types (audio, transcripts, search-entries, manifests)
   - Triggers indexing for any uploads, not just new files
   - Maintains complete local/S3 synchronization

4. **Better Visibility:**
   - Clear reporting of sync operations and file counts
   - Distinguishes between new files and historical backlog
   - Detailed logging for debugging sync issues

5. **Cost Optimized:**
   - Reduces unnecessary OpenAI API calls by avoiding re-transcription
   - Minimizes bandwidth usage through better sync logic
   - Faster execution through skipping already-processed content

**Result:** A robust, efficient, and reliable automated ingestion pipeline that handles edge cases and maintains perfect sync between local and cloud storage.

### 🔑 Key Information for Resuming:

**Automation Infrastructure (Phase 2 COMPLETE):**
- **Automation Account:** `297202224084` (browse.show-0_account--root)
- **Automation User:** `browse-dot-show-automation` 
- **Credentials:** Ready in `.env.automation` file (gitignored)
- **All Sites Working:** All sites from origin-sites/

**Site Account Structure:**
- **Account `152849157974`**: claretandblue (creates automation role), naddpod (references role), myfavoritemurder (references role)
- **Account `927984855345`**: hardfork (creates automation role), listenfairplay (references role), searchengine (references role)

**Key Commands:**
- **Test Cross-Account Access:** `pnpm tsx scripts/test-cross-account-access.ts --site=<site_id>`
- **Validate Automation Config:** `cd packages/validation && pnpm automation-roles`
- **Deploy Automation Updates:** `pnpm tsx scripts/deploy/deploy-automation.ts`

## 📚 Key Reference Files (for Future Agents)

### Current Infrastructure (Phase 4 Starting Point)
- **Main Script:** `scripts/scheduled-run-ingestion-and-trigger-indexing.ts` - Current automated ingestion workflow
- **S3 Sync:** `scripts/s3-sync.ts` - S3 synchronization functionality  
- **File Validation:** `packages/validation/check-file-consistency.ts` - File scanning and grouping logic
- **AWS Utils:** `scripts/utils/aws-utils.ts` - AWS CLI operations and validation
- **Site Discovery:** `scripts/utils/site-selector.ts` - Site discovery and environment loading

### Site Configuration Structure
- **Site Configs:** `sites/origin-sites/*/` - All 6 deployed site configurations
- **Site Metadata:** `sites/origin-sites/*/site.config.json` - Site metadata
- **AWS Profiles:** `sites/origin-sites/*/.env.aws-sso` - Site-specific AWS profiles (gitignored)

### Lambda Package Structure  
- **RSS Retrieval:** `packages/ingestion/rss-retrieval-lambda/package.json` - RSS retrieval scripts
- **Audio Processing:** `packages/ingestion/process-audio-lambda/package.json` - Audio processing scripts
- **SRT Indexing:** `packages/ingestion/srt-indexing-lambda/package.json` - SRT indexing scripts

### Terraform Infrastructure (All Deployed ✅)
- **Site Infrastructure:** `terraform/sites/` - All 6 sites deployed and working
- **Automation Infrastructure:** `terraform/automation/` - Cross-account automation deployed  
- **Environment Configs:** `terraform/sites/environments/*.tfvars` - Site terraform variables with automation config

### AWS Account Structure
- **All 6 sites** run in separate AWS accounts with automation roles configured ✅
- **Central automation account** with user `browse-dot-show-automation` ✅
- **Credentials** stored in `.env.automation` (gitignored) ✅

## 🎯 Next Steps for Phase 4

**Ready to implement Phase 4 improvements with answers provided above.**

For Phase 5 (future): Update package.json scripts to remove `:local`/`:prod` suffixes and add `--env=prod` support to `run-with-site-selection.ts`.