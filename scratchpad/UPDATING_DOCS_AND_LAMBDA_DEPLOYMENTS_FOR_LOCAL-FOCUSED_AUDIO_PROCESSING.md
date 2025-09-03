# Updating Docs and Lambda Deployments for Local-Focused Audio Processing

## Research Findings

### Current Architecture

**Current Lambda-Based Pipeline:**
1. **RSS Retrieval Lambda** (`rss-retrieval-lambda`) - Downloads podcast episodes
2. **Whisper Transcription Lambda** (`process-audio-lambda`) - Transcribes audio using OpenAI Whisper API (PAID)
3. **SRT Indexing Lambda** (`srt-indexing-lambda`) - Creates search indices

**Current Default Scheduling:**
- EventBridge schedules RSS retrieval lambda to run 3x daily: `cron(0 1,8,16 * * ? *)` (1 AM, 8 AM, 4 PM UTC)
- Lambda 1 triggers Lambda 2, which triggers Lambda 3 automatically
- This results in paid Whisper API usage for every transcription

### Local Automation System

**Local-First Pipeline:**
1. **Local Automation Manager** (`scripts/automation-management.ts`) - macOS LaunchAgent system
2. **Ingestion Pipeline** (`scripts/run-ingestion-pipeline.ts`) - Comprehensive local processing
3. **Local Whisper.cpp** - Free local transcription using whisper.cpp

**Key Benefits of Local Processing:**
- **Cost Savings**: Local whisper.cpp transcription is FREE vs OpenAI API at $0.006/minute
- **Quality**: Same accuracy as OpenAI Whisper API (same underlying model)
- **Control**: Full control over processing pipeline and timing
- **Efficiency**: Can process entire podcast archives locally without API rate limits

**Local Automation Features:**
- Runs automatically on macOS login via LaunchAgent
- Smart power management (only runs on AC power or >50% battery)
- Fast exit if already run recently (< 24 hours)
- Comprehensive logging and error tracking
- Interactive management interface

### Current Default Behavior Problem

**Issue:** Every site deployment creates EventBridge schedules that trigger costly Lambda processing by default.

**Evidence from terraform/sites/main.tf:**
```terraform
# EventBridge schedule for daily RSS processing
module "eventbridge_schedule" {
  source = "./modules/eventbridge"
  
  schedule_name        = "daily-rss-processing-${var.site_id}"
  schedule_expression  = "cron(0 1,8,16 * * ? *)"  # Run 3x daily
  lambda_function_arn  = module.rss_lambda.lambda_function_arn
  site_id              = var.site_id
}
```

**Financial Impact:**
- 40 Lambda functions currently deployed (as shown in AWS console)
- Each site with active scheduling = 3 RSS runs per day × potential episode processing
- Every new episode transcription costs ~$0.006/minute via OpenAI API
- Typical podcast episode: 60-120 minutes = $0.36-$0.72 per episode
- Multiple sites × multiple episodes = significant monthly costs

### Local Processing Commands

**Primary Local Pipeline Commands:**
- `pnpm run ingestion:run-pipeline:triggered-by-schedule` - Full automated pipeline
- `pnpm run ingestion:run-pipeline:interactive` - Interactive mode with options
- `pnpm run ingestion:automation:manage` - Manage local automation (requires sudo)

**Individual Lambda Local Execution:**
- `pnpm run ingestion:trigger-individual-lambda:interactive` - Run specific lambdas locally

**Local Transcription Setup:**
- Uses `whisper.cpp` - local C++ implementation of OpenAI Whisper
- Set via `WHISPER_API_PROVIDER=local-whisper.cpp` environment variable
- Requires one-time setup of whisper.cpp binary and model files

## Implementation Plan

### 1. Remove Default EventBridge Scheduling
- **Target:** `terraform/sites/main.tf` - make EventBridge schedule optional/disabled by default
- **Approach:** Add variable to control whether scheduling is enabled (default: false)
- **Preserve:** Keep Lambda functions deployed but unscheduled for manual/API triggering

### 2. Update Documentation
- **deployment-guide.md:** Emphasize local-first approach, mention Lambda scheduling as optional
- **README.md:** Update architecture description to reflect local processing as primary
- **Getting started guide:** Lead with local automation setup

### 3. Update AWS Architecture Diagrams
- **Primary flow:** Show local automation as main path
- **Secondary flow:** Show Lambda scheduling as optional alternative
- **Cost implications:** Highlight cost differences between local vs cloud processing

### 4. Add Configuration Options
- **Site-level setting:** Allow individual sites to opt into Lambda scheduling if needed
- **Environment variable:** Control default behavior for new sites
- **Migration guide:** Help existing users understand the change

### 5. Update CLI Help and Guidance
- **Site creator:** Default to local processing setup
- **Deployment scripts:** Mention that Lambdas are for optional use
- **Management commands:** Emphasize local automation as primary approach

## Expected Outcomes

1. **Cost Reduction:** New sites default to free local transcription instead of paid API
2. **Maintained Flexibility:** Lambda functions still available for users who prefer cloud processing
3. **Better User Experience:** Local processing is faster and more reliable for development
4. **Clearer Documentation:** Users understand the trade-offs and recommended approach
5. **Preserved Functionality:** Existing deployments continue working, users can opt-in to changes

## Implementation Summary

### ✅ Completed Changes

1. **Terraform Updates:**
   - Added `enable_rss_processing_schedule` variable (default: `false`)
   - Added `rss_processing_schedule_expression` variable (default: once daily vs 3x daily)
   - Made EventBridge schedule conditional using `count` parameter
   - Added outputs to show scheduling status

2. **Documentation Updates:**
   - Updated `deployment-guide.md` to emphasize local-first approach
   - Clarified cost implications ($0.72 per 2-hour episode for cloud processing)
   - Updated `diagrams/README.md` to show local processing as primary option
   - Added clear warnings about cloud processing costs

3. **Architecture Diagram:**
   - Created new Mermaid diagram showing both local and cloud flows
   - Clearly marked local processing as recommended approach
   - Highlighted cost implications of cloud processing

### 🔍 Technical Details

**Terraform Changes:**
- `terraform/sites/variables.tf` - Added scheduling control variables
- `terraform/sites/main.tf` - Made EventBridge schedule conditional
- `terraform/sites/outputs.tf` - Added scheduling status outputs

**Default Behavior Change:**
- **Before:** All sites deployed with 3x daily EventBridge scheduling (costly)
- **After:** All sites deploy with ingestion lambdas available but unscheduled (cost-effective)

### 📋 Next Steps for Users

1. **New Sites:** Will default to local processing - no action needed
2. **Existing Sites:** Continue working with current schedules
3. **Migration:** Users can disable scheduling by setting `enable_rss_processing_schedule = false`
4. **Cloud Processing:** Still available by setting `enable_rss_processing_schedule = true`

### 🚀 Benefits Achieved

1. **Cost Reduction:** New sites avoid expensive OpenAI API usage by default
2. **Maintained Flexibility:** Lambda functions still available for those who need them
3. **Better Defaults:** Local processing is now the default recommendation
4. **Clear Documentation:** Users understand trade-offs between local vs cloud processing
5. **Preserved Functionality:** No breaking changes to existing deployments