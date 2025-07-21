# Implementation Plan: Setup First Transcriptions Phase

## Overview
Implement a new phase in `create-site.ts` that sets up local transcriptions for the first 2 episodes of a podcast, allowing users to see a working searchable site quickly without requiring AWS setup.

## Important Notes
- **Agent cannot read `.env` or `.env.local` files** - these are gitignored and not accessible to the agent
- The agent will work with the environment files by reading/writing them as text files during the setup process
- User has confirmed both `.env` and `.env.local` exist in the project root

## Implementation Steps

### 1. Add `--max-episodes` Parameter to `run-ingestion-pipeline.ts`
- Add `maxEpisodes?: number` to `WorkflowConfig` interface
- Add command line argument parsing for `--max-episodes=N`
- Pass this parameter down to the RSS retrieval and audio processing phases
- Ensure it's NOT included in interactive prompts (only used programmatically)

### 2. Update Environment Setup in `create-site.ts`
- During the `generate-site-files` step, copy `.env` to `.env.local` if `.env.local` doesn't exist
- This provides a template for local environment configuration

### 3. Implement Whisper.cpp Setup Phase
Create a new function `executeFirstTranscriptionsStep()` that:

#### 3.1 Check Existing Setup
- Ask user: "Do you already have whisper.cpp configured locally on your machine?"
- If yes: prompt for path to whisper.cpp repo directory
- If no: proceed to setup guidance

#### 3.2 Setup Guidance (if needed)
- Direct user to https://github.com/ggml-org/whisper.cpp?tab=readme-ov-file#quick-start
- Explain the setup steps they need to complete
- Wait for user confirmation that setup is complete
- Prompt for whisper.cpp repo path

#### 3.3 Model Configuration
- Ask user about whisper model preference (default: `large-v3-turbo`)
- Update `.env.local` with:
  ```
  FILE_STORAGE_ENV=local
  WHISPER_API_PROVIDER=local-whisper.cpp
  WHISPER_CPP_PATH="<user_provided_path>"
  WHISPER_CPP_MODEL="large-v3-turbo"
  ```

#### 3.4 Test Installation
- Run a test transcription using the provided whisper.cpp setup
- Use the existing `transcribeWithLocalWhisperCpp` function for testing
- If errors occur, direct user back to whisper.cpp documentation
- Only proceed when test transcription succeeds

### 4. Run Ingestion Pipeline
- Execute `run-ingestion-pipeline.ts` with specific parameters:
  - `--max-episodes=2`
  - `--sites=<the_new_site>`
  - `--skip-s3-sync`
- Pipe stdout/stderr from ingestion pipeline to create-site terminal
- Show progress updates and estimated time (5-10 minutes)
- Handle any errors gracefully

### 5. Test Final Result
- Prompt user to run `pnpm client:dev --filter <site_id>`
- Generate a test search URL with actual content from transcribed episodes
- Format: `http://localhost:5173/?q=<term_from_transcript>`
- Ask user to confirm search functionality works
- Mark step as complete only after successful search test

## Code Changes Required

### Files to Modify:
1. `scripts/run-ingestion-pipeline.ts` - Add max-episodes parameter ✅
2. `scripts/create-site.ts` - Implement new transcription phase ✅ (needs WHISPER_API_PROVIDER fix)
3. Update `.env` copying logic in site generation ✅

### New Dependencies:
- Need to import and use transcription testing functionality
- Need to spawn child process for running ingestion pipeline
- Need to parse transcript content to generate meaningful search terms

## Error Handling
- Graceful handling of whisper.cpp setup failures
- Clear error messages pointing to documentation
- Ability to retry steps without losing progress
- Timeout handling for long-running transcription processes

## User Experience Considerations
- Clear time expectations (5-10 minutes for transcription)
- Progress indicators during long operations
- Helpful error messages with next steps
- Option to defer this step if user encounters issues

## Missing Implementation Items
- ⚠️ **Critical Fix Needed**: Add `WHISPER_API_PROVIDER=local-whisper.cpp` to environment updates
- 🔧 **Enhancement**: Implement actual whisper.cpp installation test (currently placeholder)
- 📊 **Enhancement**: Parse transcript content to generate meaningful search terms for testing