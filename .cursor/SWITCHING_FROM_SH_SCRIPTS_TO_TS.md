# Converting Shell Scripts to TypeScript

## Overview
Converting all bash scripts to TypeScript for better consistency, type safety, and code reuse. Scripts will be run directly with `tsx` and cannot depend on files outside `/scripts`.

## Current Shell Scripts Identified

### `/scripts/` directory
- [x] `run-lambda-for-site.sh` (69 lines) → `run-lambda-for-site.ts`
- [x] `trigger-ingestion-lambda.sh` (258 lines) → `trigger-ingestion-lambda.ts`
- [x] `create-new-site.sh` (237 lines) → `create-new-site.ts`
- [x] `build-lambda-for-site.sh` (62 lines) → `build-lambda-for-site.ts`
- [x] `pnpm-deploy-with-versions-fix.sh` (27 lines) → `pnpm-deploy-with-versions-fix.ts`

### `/scripts/deploy/` directory
- [x] `check-prerequisites.sh` (101 lines) → `check-prerequisites.ts`
- [x] `deploy.sh` (245 lines) → `deploy.ts`
- [x] `upload-client.sh` (113 lines) → `upload-client.ts`
- [x] `bootstrap-terraform-state.sh` (57 lines) → `bootstrap-terraform-state.ts`
- [x] `destroy.sh` (89 lines) → `destroy.ts`
- [x] `manage-tfstate.sh` (102 lines) → `manage-tfstate.ts`

### `/terraform/lambda-layers/` directory
- [x] `1-prepare-ffmpeg-layer.sh` (79 lines) → `1-prepare-ffmpeg-layer.ts`

## Phased Implementation Plan

### Phase 1: Setup & Utilities ✅ COMPLETED
1. **Create shared utilities in `/scripts/utils/`:** ✅
   - ✅ `shell-exec.ts` - Execute shell commands with proper error handling
   - ✅ `file-operations.ts` - File system operations (copy, move, create directories)
   - ✅ `env-validation.ts` - Environment variable validation and loading
   - ✅ `logging.ts` - Consistent logging utilities
   - ✅ `aws-utils.ts` - AWS CLI operations wrapper
   - ✅ `terraform-utils.ts` - Terraform command wrappers

2. **Add linter rule to prevent cross-boundary dependencies:** ✅
   - ✅ Create ESLint rule to prevent imports outside `/scripts` for script files
   - ✅ Add to `scripts/eslint.config.js`

### Phase 2: Convert Core Infrastructure Scripts ✅ COMPLETED
1. ✅ **`check-prerequisites.ts`** - Core dependency validation
2. ✅ **`pnpm-deploy-with-versions-fix.ts`** - Simple pnpm wrapper  
3. ✅ **`bootstrap-terraform-state.ts`** - Terraform state setup

### Phase 3: Convert Lambda Management Scripts ✅ COMPLETED
1. ✅ **`build-lambda-for-site.ts`** - Build lambda packages
2. ✅ **`run-lambda-for-site.ts`** - Run lambda locally with site context
3. ✅ **`trigger-ingestion-lambda.ts`** - Complex AWS lambda invocation

### Phase 4: Convert Site Management Scripts ✅ COMPLETED
1. ✅ **`create-new-site.ts`** - Interactive site creation
2. ✅ **`upload-client.ts`** - Client deployment
3. ✅ **`manage-tfstate.ts`** - Terraform state management

### Phase 5: Convert Deployment Scripts ✅ COMPLETED
1. ✅ **`destroy.ts`** - Infrastructure teardown
2. ✅ **`deploy.ts`** - Main deployment orchestration (most complex)

### Phase 6: Convert Terraform Layer Script ✅ COMPLETED
1. ✅ **`1-prepare-ffmpeg-layer.ts`** - FFmpeg layer preparation

### Phase 7: Update Package.json References ✅ COMPLETED
Update all `package.json` files that reference the converted scripts:
- ✅ Root `package.json` - deployment and site creation commands
- ✅ Lambda package.json files - build and run commands  
- ✅ Documentation files - README and guide references
- ✅ TypeScript config comment references

### Phase 8: Review for Simplification ✅ COMPLETED
1. ✅ **Consolidated promptUser function** - Moved duplicated `promptUser` function to shared utilities
2. ✅ **Added interactive mode helpers** - Created `setupInteractiveMode()` and `cleanupInteractiveMode()` utilities
3. ✅ **Verified import consistency** - All scripts use consistent utility imports
4. ✅ **Removed code duplication** - Eliminated 4 duplicate function definitions

### Phase 9: Add Linting & Validation
1. **ESLint rule for script isolation:**
   ```typescript
   // Prevent imports outside /scripts for files in /scripts
   '@typescript-eslint/no-restricted-imports': [
     'error',
     {
       patterns: ['../*', '../../*', '../../../*']
     }
   ]
   ```

2. **Validation script:**
   - Check that all shell scripts have been converted
   - Verify no remaining `.sh` references in package.json files
   - Ensure all scripts can run with `tsx`

## Dependencies & Constraints

### Key Requirements:
- ✅ All scripts run with `tsx` directly (no build step)
- ✅ No dependencies on files outside `/scripts`
- ✅ Maintain existing functionality exactly
- ✅ Use shared utilities to reduce duplication

### Common Utilities Needed:
- Shell command execution with error handling
- File operations (copy, move, create directories)
- Environment variable loading and validation
- AWS CLI wrappers
- Terraform command wrappers
- Interactive prompts
- Logging and output formatting

### TypeScript Patterns:
- Use `#!/usr/bin/env tsx` shebang
- Proper error handling with try/catch
- Type definitions for all parameters
- Exit codes matching bash script behavior

## ✅ CONVERSION COMPLETE

### Summary of Achievements:
- ✅ **All 12 shell scripts converted to TypeScript**
- ✅ **Comprehensive utility library created** (`/scripts/utils/`)
- ✅ **Type safety throughout** with proper interfaces and error handling
- ✅ **Consistent patterns** across all converted scripts
- ✅ **Package.json references updated** for seamless transition
- ✅ **Documentation updated** to reflect new TypeScript commands
- ✅ **Code duplication eliminated** with shared utilities
- ✅ **Interactive mode helpers** for better user experience

### Key Benefits Achieved:
1. **Type Safety**: All scripts now have proper TypeScript types and interfaces
2. **Error Handling**: Comprehensive error handling with user-friendly messages
3. **Code Reuse**: Shared utility functions eliminate duplication
4. **Consistency**: Uniform patterns for logging, file operations, and AWS interactions
5. **Maintainability**: Easier to extend and modify with TypeScript
6. **Developer Experience**: Better IDE support and autocomplete

### Execution Pattern:
All scripts now run with: `tsx script-name.ts` (no build step required)

## Notes:
- ✅ Existing script behavior maintained identically
- ✅ Node.js built-in modules used where possible
- ✅ Proper TypeScript types added throughout
- ✅ Executable permissions maintained
- ✅ Documentation updated after conversion