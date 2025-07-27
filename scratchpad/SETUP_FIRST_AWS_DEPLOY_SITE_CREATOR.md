# AWS Deployment Step Implementation Plan

## 🎯 Goal
Replace the current placeholder `executeAwsDeploymentStep()` with a fully automated AWS deployment flow that guides users through credential setup, prerequisites, and deployment using existing scripts.

## 📋 Current State Analysis

### Existing Infrastructure ✅
- **`scripts/deploy/site-deploy.ts`** - Full deployment script (reuse this!)
- **`scripts/deploy/bootstrap-site-state.ts`** - Terraform state setup
- **`scripts/deploy/check-prerequisites.ts`** - Prerequisites validation
- **`scripts/utils/aws-utils.ts`** - AWS credential checking functions
- **Sites expect**: `.env.aws-sso` files with `AWS_PROFILE=profile-name`

### Current Gap ❌
- `executeAwsDeploymentStep()` only opens guide, doesn't actually deploy
- No credential setup flow in site creator
- Users must manually create `.env.aws-sso` files
- No prerequisite checking in site creator flow

## 🚀 Implementation Plan

### Phase 1: AWS Credential Setup & Validation
**Goal**: Ensure user has AWS credentials configured and create `.env.aws-sso` file

**Implementation Steps**:
1. **Check AWS CLI Installation**
   - Run `aws --version` to verify installation
   - If missing: guide to AWS CLI installation docs, defer step

2. **Check Existing Configuration**
   - Look for existing `.env.aws-sso` in `sites/my-sites/{siteId}/`
   - If exists: validate the profile works, proceed if valid

3. **AWS Authentication Setup (if needed)**
   - **Option A (Preferred)**: AWS SSO Setup
     - Prompt user if they have AWS SSO access
     - Guide through `aws configure sso` process
     - Capture the profile name they create
   - **Option B (Fallback)**: Access Keys
     - Prompt for access key setup if SSO not available
     - Guide through `aws configure --profile {site-id}-deploy`

4. **Create .env.aws-sso File**
   - Write `AWS_PROFILE={profile-name}` to `sites/my-sites/{siteId}/.env.aws-sso`
   - Test credentials with `aws sts get-caller-identity --profile {profile}`

5. **Validate Access**
   - Verify credentials work
   - Check basic AWS permissions
   - Confirm ready to proceed

**Reused Functions**:
- `checkAwsCredentials()` from `aws-utils.ts`
- `checkAwsSsoLogin()` from `aws-utils.ts`
- File operations from existing site creator utilities

### Phase 2: Prerequisites & Environment Check
**Goal**: Verify all required tools and environment variables are ready

**Implementation Steps**:
1. **Check Required Tools**
   - Terraform installation (`terraform --version`)
   - Node.js and pnpm (already validated in earlier steps)

2. **Environment Variables**
   - Check `OPENAI_API_KEY` in environment
   - If missing: prompt user to add it, provide guidance
   - Validate other required environment variables

3. **Run Existing Prerequisites Script**
   - Execute `scripts/deploy/check-prerequisites.ts`
   - Handle any failures with user-friendly guidance
   - Defer step if prerequisites fail

**Reused Scripts**:
- `scripts/deploy/check-prerequisites.ts` (existing)
- Environment validation utilities

### Phase 3: Terraform State Bootstrap
**Goal**: Set up Terraform state management (one-time setup per site)

**Implementation Steps**:
1. **Check if State Already Bootstrapped**
   - Look for existing Terraform state bucket
   - Skip if already configured

2. **Run Bootstrap Script**
   - Execute `scripts/deploy/bootstrap-site-state.ts`
   - Handle any AWS permission errors
   - Provide clear feedback on progress

3. **Verify Bootstrap Success**
   - Confirm state bucket created
   - Validate Terraform backend configuration

**Reused Scripts**:
- `scripts/deploy/bootstrap-site-state.ts` (existing)

### Phase 4: Core Deployment
**Goal**: Deploy the actual site infrastructure and content

**Implementation Steps**:
1. **Pre-deployment Confirmation**
   - Show user what will be deployed
   - Confirm they want to proceed
   - Estimate time and costs

2. **Execute Main Deployment**
   - Run `scripts/deploy/site-deploy.ts` programmatically
   - Stream output to user in real-time
   - Handle common deployment errors gracefully

3. **Post-deployment Validation**
   - Verify site is accessible
   - Check that basic functionality works
   - Provide next steps for content ingestion

**Reused Scripts**:
- `scripts/deploy/site-deploy.ts` (main deployment script)
- Error handling utilities

### Phase 5: Error Handling & Recovery
**Goal**: Handle common AWS deployment issues gracefully

**Common Error Scenarios**:
1. **SSL Certificate Validation** - Guide DNS setup, offer retry
2. **Permission Errors** - Check IAM permissions, provide AWS docs links
3. **Resource Conflicts** - Suggest cleanup or alternative names
4. **Timeout Issues** - Offer retry with different settings

**Error Handling Strategy**:
- Catch specific error types from existing scripts
- Provide actionable guidance without requiring MD files
- Link to AWS docs for complex issues
- Always offer option to defer and try again later

## 🔧 Technical Implementation Details

### New Functions to Create
```typescript
// In step-executors.ts
async function checkAwsCliInstallation(): Promise<boolean>
async function setupAwsCredentials(siteId: string): Promise<boolean>
async function createAwsEnvFile(siteId: string, profileName: string): Promise<void>
async function runDeploymentProcess(progress: SetupProgress): Promise<StepStatus>

// Helper functions
async function promptForAwsSsoSetup(): Promise<string>
async function promptForAccessKeySetup(): Promise<string>
async function validateAwsProfile(profileName: string): Promise<boolean>
```

### Files to Modify
1. **`scripts/site-creator/step-executors.ts`**
   - Replace `executeAwsDeploymentStep()` with full implementation
   - Add credential setup functions
   - Add deployment orchestration

2. **`scripts/site-creator/types.ts`**
   - Add AWS credential configuration types if needed

3. **Error handling in deployment scripts** (minor tweaks)
   - Ensure scripts return proper exit codes
   - Improve error message formatting for site creator

### Dependency on Existing Scripts
- **Primary**: `scripts/deploy/site-deploy.ts` - handles actual deployment
- **Bootstrap**: `scripts/deploy/bootstrap-site-state.ts` - state setup
- **Validation**: `scripts/deploy/check-prerequisites.ts` - prereq checks
- **Utilities**: `scripts/utils/aws-utils.ts` - credential functions

## 📅 Implementation Phases

### Phase 1 (First) ⭐ - ✅ COMPLETED
**Focus**: AWS credential setup and `.env.aws-sso` file creation
**Deliverable**: Users can set up AWS credentials through the site creator
**Review Point**: After this phase is complete

**✅ Implementation Complete:**
- Added `setupAwsCredentials()` function with full credential setup flow
- AWS CLI installation check with helpful installation guidance
- Existing `.env.aws-sso` file detection and validation
- Interactive AWS SSO setup (preferred method)
- Interactive AWS access keys setup (fallback method)  
- Automatic `.env.aws-sso` file creation with proper profile name
- Complete credential validation with account information display
- Graceful error handling and user guidance throughout
- Integration with existing `checkAwsCredentials()` and `checkAwsSsoLogin()` utilities

**Ready for User Testing!** 🎯

### Phase 2 (Second)
**Focus**: Prerequisites checking and environment validation
**Deliverable**: Full environment readiness validation

### Phase 3 (Third)
**Focus**: Terraform bootstrap integration
**Deliverable**: Automated state management setup

### Phase 4 (Fourth)
**Focus**: Main deployment integration with `site-deploy.ts`
**Deliverable**: Full automated deployment flow

### Phase 5 (Final)
**Focus**: Error handling refinement and edge cases
**Deliverable**: Production-ready deployment step

## 🎯 Success Criteria

### User Experience Goals
- ✅ No manual file editing required
- ✅ Clear guidance for each step
- ✅ Ability to defer and resume
- ✅ Graceful error handling
- ✅ No need to read documentation files

### Technical Goals
- ✅ Reuse maximum existing code
- ✅ Maintain existing deployment script functionality
- ✅ Proper error handling and logging
- ✅ Support both AWS SSO and access key authentication

### Integration Goals
- ✅ Seamless integration with progressive setup flow
- ✅ Consistent with other setup steps
- ✅ Proper status tracking and progress saving

## 📝 Notes
- **Cannot read `.env` files** - must prompt user for required values
- **Interactive prompts only** - no automated credential extraction
- **Favor automation** but always prompt before taking actions
- **Target for deletion**: `docs/deployment-guide.md` once this is complete
- **Guided scripts over documentation** - embed all guidance in the flow