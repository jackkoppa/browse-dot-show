# Multi-Site Implementation Audit

## 🎯 Current Status: Issues Identified During Local Testing

**Primary Issue**: Lambda functions are not finding files in the correct site-specific directories during local execution.

**Example Error**: When running `pnpm rss-retrieval-lambda:run:local` with hardfork selected, the manifest file should be found at `aws-local-dev/s3/sites/hardfork/episode-manifest/full-episode-manifest.json` but isn't being located correctly.

---

## 📋 Audit Progress

### ✅ WORKING COMPONENTS

#### 1. Site Discovery & Selection (✅ VERIFIED)
- **Status**: Working correctly
- **Files**: `scripts/utils/site-selector.js`, `scripts/run-with-site-selection.js`
- **Verification**: Site selection prompts work, environment variables are loaded correctly
- **Evidence**: Scripts properly discover sites from `origin-sites/` and `my-sites/`, prompt works as expected

#### 2. Site Configuration Structure (✅ VERIFIED)
- **Status**: Working correctly
- **Files**: `sites/origin-sites/*/site.config.json`, `sites/origin-sites/*/.env.aws`
- **Verification**: All origin sites have proper configuration files
- **Evidence**: Sites (hardfork, listenfairplay, naddpod, claretandblue) have required config files

#### 3. Local Data Organization (✅ VERIFIED)
- **Status**: Working correctly
- **Structure**: `aws-local-dev/s3/sites/{siteId}/` contains proper subdirectories
- **Evidence**: All sites have `audio/`, `transcripts/`, `rss/`, `episode-manifest/` directories
- **Verification**: hardfork site has manifest at `aws-local-dev/s3/sites/hardfork/episode-manifest/full-episode-manifest.json`

#### 4. Package Scripts Structure (✅ VERIFIED)
- **Status**: Working correctly
- **Files**: `package.json` root scripts using `run-with-site-selection.js`
- **Evidence**: All lambda scripts properly call site selection wrapper

---

### 🚨 ISSUES IDENTIFIED

#### 1. **CRITICAL ISSUE**: Site-Aware Path Resolution in Packages (❌ BROKEN)
- **Status**: BROKEN - Files not found during local lambda execution
- **Affected Files**: 
  - `packages/s3/index.ts` - `getLocalFilePath()` function
  - `packages/constants/index.ts` - Site-specific path functions
- **Problem**: Environment variable `CURRENT_SITE_ID` may not be properly passed to lambda processes
- **Impact**: Lambda functions fail to locate site-specific files during local execution

#### 2. **CRITICAL ISSUE**: Environment Variable Propagation (❌ NEEDS INVESTIGATION)
- **Status**: NEEDS INVESTIGATION
- **Affected Files**: `scripts/run-with-site-selection.js`
- **Problem**: `CURRENT_SITE_ID` environment variable may not be reaching the lambda processes
- **Impact**: Site-aware functions in `@browse-dot-show/constants` fail

#### 3. **NEEDS TESTING**: Lambda Package Scripts (⚠️ UNTESTED)
- **Status**: UNTESTED in current multi-site context
- **Affected Scripts**: 
  - `:run:local` scripts in lambda packages
  - `:run:site` scripts in lambda packages
- **Concern**: May need to use site-specific environment loading

---

### 🔍 NEEDS INVESTIGATION

#### 1. Legacy Path Handling (⚠️ NEEDS REVIEW)
- **Files**: `packages/s3/index.ts` - Legacy bucket and path handling
- **Concern**: Mix of legacy and site-aware paths may cause conflicts
- **Status**: NEEDS INVESTIGATION

#### 2. Build-Time vs Runtime Configuration (⚠️ NEEDS TESTING)
- **Files**: Lambda build scripts, rolldown configurations
- **Concern**: `CURRENT_SITE_ID` needs proper injection during builds
- **Status**: NEEDS TESTING

#### 3. Database Path Resolution (⚠️ NEEDS TESTING)
- **Files**: `packages/constants/index.ts` - `getLocalDbPath()`
- **Concern**: Temporary file paths for each site may conflict
- **Status**: NEEDS TESTING

---

## 🛠️ IMMEDIATE FIXES NEEDED

### Fix 1: Debug Environment Variable Propagation
**Priority**: CRITICAL
**Issue**: `CURRENT_SITE_ID` not reaching lambda processes
**Action**: Add debugging to verify environment variable propagation

### Fix 2: Enhance Logging in Path Resolution
**Priority**: HIGH
**Issue**: Unable to see where path resolution is failing
**Action**: Add comprehensive logging to `packages/s3/index.ts` and `packages/constants/index.ts`

### Fix 3: Review Lambda Script Environment Loading
**Priority**: HIGH
**Issue**: Lambda scripts may need site-specific environment loading
**Action**: Verify environment loading in individual lambda packages

---

## 🧪 RECOMMENDED TESTING SCRIPTS

### IMMEDIATE: Test Environment Propagation with Debug Script
```bash
# Test environment variable propagation (NEW DEBUG SCRIPT)
CURRENT_SITE_ID=hardfork FILE_STORAGE_ENV=local node debug-site-env.js
```

### HIGH PRIORITY: Test Lambda with Site Selection
```bash
# Test full site-selection workflow with debug output
pnpm rss-retrieval-lambda:run:local
# Select 'hardfork' when prompted - should now show detailed debug info
```

### MEDIUM: Test with Environment Overrides
```bash
# Test bypassing site selection prompt
SKIP_SITE_SELECTION_PROMPT=true DEFAULT_SITE_ID=hardfork pnpm rss-retrieval-lambda:run:local
```

### MEDIUM: Test Direct Lambda Execution
```bash
# Test lambda directly with environment (should work now)
cd packages/ingestion/rss-retrieval-lambda
CURRENT_SITE_ID=hardfork FILE_STORAGE_ENV=local tsx retrieve-rss-feeds-and-download-audio-files.ts
```

### LOW: Test Other Lambda Functions
```bash
# Test process-audio lambda
pnpm process-audio-lambda:run:local

# Test srt-indexing lambda  
pnpm srt-indexing-lambda:run:local
```

---

## 🔧 FIXES APPLIED

### [2024-12-19 17:45] - Enhanced Debugging for Environment Variable Propagation
- **Issue**: `CURRENT_SITE_ID` environment variable not reaching lambda processes, causing site-aware path resolution to fail
- **Solution**: Added comprehensive debugging to `getSiteId()` function in `packages/constants/index.ts`
- **Files Modified**: `packages/constants/index.ts`
- **Test Result**: READY FOR TESTING - will show detailed env var info in console

### [2024-12-19 17:50] - Enhanced Path Resolution Debugging
- **Issue**: Unable to see where path resolution is failing in `getLocalFilePath()`
- **Solution**: Added detailed debugging to path resolution including file existence checks
- **Files Modified**: `packages/s3/index.ts`
- **Test Result**: READY FOR TESTING - will show comprehensive path resolution debug info

### [2024-12-19 17:55] - Fixed Environment Loading Logic
- **Issue**: Site selection script calling `loadSiteEnvVars(siteId, 'dev')` but no `.env.dev` file exists, should use `.env.local`
- **Solution**: Changed environment loading to use 'local' for development instead of 'dev'
- **Files Modified**: `scripts/run-with-site-selection.js`, `scripts/utils/site-selector.js`
- **Test Result**: READY FOR TESTING - should now properly load `.env.local` file

### [2024-12-19 18:00] - Added Module-Level Path Debugging
- **Issue**: Need to verify LOCAL_S3_PATH is computed correctly at module load time
- **Solution**: Added debug logging to show computed LOCAL_S3_PATH when S3 module loads
- **Files Modified**: `packages/s3/index.ts`
- **Test Result**: READY FOR TESTING - will show computed path on module load

### [2024-12-19 18:10] - CRITICAL BUG FIX: Environment Parsing
- **Issue**: Environment file parsing was including comment lines as environment variables (e.g., treating `# Defined here: https://...` as a variable name)
- **Solution**: Fixed both root `.env.local` and site-specific `.env.aws` parsing to skip comments and empty lines
- **Files Modified**: `scripts/utils/site-selector.js` 
- **Test Result**: READY FOR TESTING - should now parse environment files correctly

### [2024-12-19 18:12] - Enhanced Environment Variable Debugging
- **Issue**: Need to verify CURRENT_SITE_ID is properly set in final environment
- **Solution**: Added debugging to show final environment variables before command execution
- **Files Modified**: `scripts/run-with-site-selection.js`
- **Test Result**: READY FOR TESTING - will show CURRENT_SITE_ID, SELECTED_SITE_ID, FILE_STORAGE_ENV values 

---

## 📊 TESTING RESULTS

### Local Lambda Execution Tests
- **RSS Retrieval Lambda**: ❌ FAILING - Files not found
- **Process Audio Lambda**: ❌ FAILING - Files not found  
- **SRT Indexing Lambda**: ⚠️ UNTESTED
- **Search Lambda**: ⚠️ UNTESTED

### Site-Specific Path Tests
- **Hardfork Manifest**: ❌ FAILING - Should find `aws-local-dev/s3/sites/hardfork/episode-manifest/full-episode-manifest.json`
- **Other Sites**: ⚠️ UNTESTED

---

## 🎯 NEXT STEPS

1. **IMMEDIATE**: Add debugging to environment variable propagation
2. **IMMEDIATE**: Add comprehensive logging to path resolution functions  
3. **HIGH**: Test lambda script environment loading
4. **HIGH**: Test all lambda functions locally
5. **MEDIUM**: Test production deployments
6. **MEDIUM**: Test client builds and deployments

---

## 📝 NOTES

- All site configuration and data structure appears correct
- Issue seems to be in the connection between site selection and lambda execution
- Environment variable propagation is the most likely culprit
- Path resolution logic looks correct but needs debugging output 