# Multi-Terminal Runner - Implementation Guide

## Overview
Successfully implemented POC for running parallel processes in separate Terminal windows with centralized progress monitoring. Ready for adaptation to real use cases.

## 🚧 CURRENT IMPLEMENTATION STATUS

### ✅ Phase 1: POC Complete
- [x] Terminal window spawning (macOS)
- [x] Progress monitoring with dual intervals (0.5s spinner, 10s data)
- [x] In-place terminal updates with progress bars
- [x] Structured logging interface design
- [x] Resource cleanup and error handling

### ✅ Phase 2: Real Transcription Integration (COMPLETE)
- [x] **Site Selection Prompt** - Interactive site picker with single-site focus
- [x] **Terminal Count Configuration** - User prompt with default of 3 terminals  
- [x] **Untranscribed Duration Calculation** - Calculate initial total from audio files missing transcripts
- [x] **Progress Tracking Enhancement** - Track against untranscribed total, not all audio
- [x] **Structured Logging Integration** - Add progress logging to process-new-audio-files-via-whisper.ts
- [x] **Package.json Script** - Replace CURSOR-TODO with working command
- [ ] **ETA Calculation** - Estimate completion time based on transcription speed (TODO: Future enhancement)

### 📋 Phase 2 Implementation Plan

1. **Create Real Runner Script** (`scripts/run-local-transcriptions-multi-terminal.ts`)
   - Site selection with existing `discoverSites()` utility
   - Terminal count prompt (default: 3)
   - Calculate untranscribed audio duration upfront
   - Launch multi-terminal runner with real transcription commands

2. **Enhance Progress Calculation**
   - Initial scan: Count audio files without corresponding transcripts
   - Duration calculation: Sum durations of untranscribed files only
   - Progress tracking: Monitor transcription completion against this baseline
   - ETA estimation: Track transcription speed and project completion time

3. **Add Structured Logging to Transcription**
   - Modify `trigger-individual-ingestion-lambda.ts` to emit progress logs
   - Log format: JSON entries with processId, progress data, file info
   - Integration points: File start, chunk completion, file completion

4. **Terminal Distribution Strategy**
   - Single site distributed across N terminals
   - Round-robin file assignment or chunk-based distribution
   - TODO: Future multi-site support framework

### 🚀 Phase 2 IMPLEMENTATION COMPLETE!

**Ready to Use:** 
```bash
pnpm run ingestion:run-local-transcriptions:multi-terminal
```

**What it does:**
1. **Interactive Setup**: Prompts for site selection and terminal count
2. **Smart Analysis**: Calculates untranscribed audio duration using ffprobe
3. **Multi-Terminal Launch**: Opens N Terminal.app windows with real transcription commands
4. **Progress Monitoring**: Live updates every 0.5s (spinner) and 10s (data)
5. **Structured Logging**: JSON progress logs from transcription process
6. **Resource Management**: Automatic cleanup on completion/interruption

**Example Session:**
```
🔧 Multi-Terminal Local Transcription Setup
==================================================
? Which site do you want to transcribe? › limitedresources (Limited Resources)
? How many terminal windows? › 3

🔍 Scanning for audio files and existing transcripts...
📊 Calculating duration for: episode-123.mp3
📊 Calculating duration for: episode-124.mp3
...

📈 Transcription Analysis:
   Total audio files: 820
   Already transcribed: 480  
   Needs transcription: 340
   Untranscribed duration: 1247 minutes (20.8 hours)

📋 Session Configuration:
   Site: Limited Resources (limitedresources)
   Files to transcribe: 340
   Total duration: 1247 minutes
   Terminal windows: 3
   Avg per terminal: ~416 minutes

? Start multi-terminal transcription? › Yes

🚀 Starting multi-terminal transcription...
✅ Launched terminal window for transcription-1
✅ Launched terminal window for transcription-2  
✅ Launched terminal window for transcription-3
✅ All 3 terminal windows launched!

⠋ Progress Update - 2:15:23 PM
⏱️  Total runtime: 45s
================================================================================
  transcription-1: 12.3% (51/416min) - Completed transcription of episode-125.mp3
  transcription-2: 8.7% (36/416min) - Completed transcription of episode-126.mp3
  transcription-3: 15.2% (63/416min) - Completed transcription of episode-127.mp3
================================================================================
🎯 OVERALL PROGRESS: 12.0% (150/1247 total minutes)
📈 Status: 0 completed, 3 active, 0 pending
📊 [██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 12.0%
```

## Adapting for Real Ingestion Lambda

### 1. Modify Process Configuration
In `createProcessConfigs()`, replace the mock script with real command:

```typescript
// Replace mock configuration with real ingestion command
configs.push({
  id: `${siteId}-${processId}`, // More descriptive naming
  command: 'pnpm',
  args: [
    'tsx', 
    'scripts/trigger-individual-ingestion-lambda.ts', 
    `--sites=${siteId}`,
    '--lambda=process-audio',
    '--env=local'
  ],
  logFile,
  env: {
    NODE_OPTIONS: '--max-old-space-size=8192',
    PROCESS_ID: processId,
    SITE_ID: siteId,
    // Add any other site-specific environment variables
    ...loadSiteEnvVars(siteId, 'local')
  }
});
```

### 2. Site Distribution Strategy
For multiple sites across N processes:

```typescript
// Option A: Round-robin site distribution
const sites = discoverSites();
const sitesPerProcess = Math.ceil(sites.length / numProcesses);

for (let i = 0; i < numProcesses; i++) {
  const processSites = sites.slice(i * sitesPerProcess, (i + 1) * sitesPerProcess);
  if (processSites.length > 0) {
    // Create config for sites: processSites.map(s => s.id).join(',')
  }
}

// Option B: User-specified site assignment
// Allow --site-groups="site1,site2|site3,site4|site5" format
```

### 3. Integrate Structured Logging

Add to `trigger-individual-ingestion-lambda.ts`:

```typescript
interface ProgressLogEntry {
  processId: string;
  timestamp: string;
  type: 'START' | 'PROGRESS' | 'COMPLETE' | 'ERROR';
  message: string;
  data?: {
    totalMinutes?: number;
    completedMinutes?: number;
    percentComplete?: number;
    currentFile?: string;
    siteId?: string;
  };
}

function logProgress(type: string, message: string, data: any = {}) {
  const entry: ProgressLogEntry = {
    processId: process.env.PROCESS_ID || 'unknown',
    timestamp: new Date().toISOString(),
    type,
    message,
    data: {
      siteId: process.env.SITE_ID,
      ...data
    }
  };
  
  // Write structured log to both stdout and file (if LOG_FILE is set)
  const logLine = JSON.stringify(entry);
  console.log(logLine);
  
  if (process.env.LOG_FILE) {
    fs.appendFileSync(process.env.LOG_FILE, logLine + '\n');
  }
}

// Usage examples in the lambda script:
logProgress('START', `Starting transcription for ${siteId}`, {
  totalMinutes: calculatedTotalDuration,
  completedMinutes: 0,
  percentComplete: 0
});

logProgress('PROGRESS', `Transcribed: ${filename}`, {
  totalMinutes: calculatedTotalDuration,
  completedMinutes: currentProgress,
  percentComplete: (currentProgress / calculatedTotalDuration) * 100,
  currentFile: filename
});

logProgress('COMPLETE', `Transcription completed for ${siteId}`, {
  totalMinutes: calculatedTotalDuration,
  completedMinutes: calculatedTotalDuration,
  percentComplete: 100
});
```

### 4. Calculate Total Audio Duration
Before starting, the script should calculate total duration:

```typescript
// In trigger-individual-ingestion-lambda.ts
function calculateTotalAudioDuration(siteIds: string[]): number {
  let totalMinutes = 0;
  for (const siteId of siteIds) {
    // Read episode manifests or audio files to calculate duration
    const audioFiles = getAudioFilesForSite(siteId);
    totalMinutes += audioFiles.reduce((sum, file) => sum + file.durationMinutes, 0);
  }
  return totalMinutes;
}
```

## Future Extensibility

### 1. Supporting Other Parallel Scripts
The runner can be extended for any script that:
- Can report progress via structured logging
- Can be run with site-specific environment variables
- Benefits from parallel execution

Examples:
- RSS retrieval: `--lambda=rss-retrieval`
- Search indexing: `--lambda=srt-indexing`
- Content validation: `scripts/validation/check-file-consistency.ts`

### 2. Configuration-Driven Approach
Create a command registry:

```typescript
interface ParallelCommand {
  name: string;
  command: string;
  args: (siteId: string, options: any) => string[];
  env?: (siteId: string) => Record<string, string>;
  progressExtractor?: (logs: string[]) => ProgressData;
}

const PARALLEL_COMMANDS: Record<string, ParallelCommand> = {
  'process-audio': {
    name: 'Audio Processing',
    command: 'pnpm',
    args: (siteId, opts) => ['tsx', 'scripts/trigger-individual-ingestion-lambda.ts', `--sites=${siteId}`, '--lambda=process-audio', `--env=${opts.env}`],
    env: (siteId) => ({ NODE_OPTIONS: '--max-old-space-size=8192', ...loadSiteEnvVars(siteId, 'local') })
  },
  // Add more commands...
};
```

### 3. CLI Enhancement
Enhance the runner with more options:

```bash
# Current
tsx scripts/utils/multi-terminal-runner.ts --processes=3 --interval=10

# Enhanced
tsx scripts/utils/multi-terminal-runner.ts \
  --command=process-audio \
  --sites="site1,site2,site3" \
  --processes=3 \
  --interval=5 \
  --env=local \
  --distribution=round-robin
```

## Implementation Priority

1. **Phase 1**: Adapt for single command (process-audio)
2. **Phase 2**: Add site distribution strategies  
3. **Phase 3**: Integrate structured logging in existing scripts
4. **Phase 4**: Configuration-driven command registry
5. **Phase 5**: Enhanced CLI with multiple command support

## Notes
- Terminal window management works great on macOS
- Log file aggregation is reliable and performant
- Progress bar visualization is clear and informative
- Cleanup handled automatically on completion or interruption
- Ready for Linux/Windows support via platform detection