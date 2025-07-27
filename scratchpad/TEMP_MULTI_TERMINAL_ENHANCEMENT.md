# Multi-Terminal Runner - Implementation Guide

## Overview
Successfully implemented POC for running parallel processes in separate Terminal windows with centralized progress monitoring. Ready for adaptation to real use cases.

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