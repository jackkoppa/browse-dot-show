# 04: All-Sites Parallel Transcription

## Goal

The pipeline transcribes new episodes for **all sites in parallel**, with no window juggling, so it works unattended (see [03](./03-mac-automation.md)). The multi-terminal view has been nice for watching progress manually, so keep it as an optional display mode if it's cheap. It's not required.

## Where things are today

- **Pipeline Phase 3** (`scripts/run-ingestion-pipeline.ts`, around "Phase 3: Audio Processing for all sites") loops over sites **serially**. For each site it runs `pnpm --filter @browse-dot-show/process-audio-lambda run run:local` with that site's env.
- **`scripts/run-local-transcriptions-multi-terminal.ts`** + **`scripts/utils/multi-terminal-runner.ts`** handle parallel runs, macOS Terminal.app only. Branch `jackkoppa/multi-terminal-all-sites` adds an "All sites" option. The runner:
  1. finds untranscribed `.mp3` files by checking whether a matching `.srt` exists
  2. measures each file's duration with `ffprobe`
  3. assigns files to N terminals, balanced by duration (longest first)
  4. writes a bash script per terminal that calls `trigger-individual-ingestion-lambda.ts --lambda=process-audio --env=local` once per site, passing:
     - `SITE_ID`
     - `TERMINAL_FILE_LIST_PATH` (that site's file list)
     - `TERMINAL_TOTAL_MINUTES`
     - `PROCESS_ID`
     - `LOG_FILE`
  5. parses JSON progress lines (`START` / `PROGRESS` / `COMPLETE`, tagged with `siteId`) from each terminal's log to show combined progress and an ETA.
- **The process-audio lambda** (`packages/ingestion/process-audio-lambda/process-new-audio-files-via-whisper.ts`) handles one `SITE_ID` per run. It filters its file list by `TERMINAL_FILE_LIST_PATH` and uses a lockfile so concurrent runs skip files that are already being processed.

## Proposed design

1. **One planning function** (pure and unit-tested): given the selected sites, return the untranscribed files with durations, assigned to N workers. Move this out of the multi-terminal script.
2. **Workers are child processes, not threads.** Each worker runs its assigned (site, files) jobs in sequence through the shared "run lambda locally" module. That module takes a typed list of files directly, replacing the `TERMINAL_*` env-var protocol. Child processes keep memory isolated, and a whisper.cpp crash only takes down one worker.
3. **Progress:** workers report structured events. Either keep the JSON-lines log, or use IPC with `fork()`. Choose one channel; today each line is written twice (stdout→`tee` and `appendFileSync`, and the latter uses `require('fs')` inside an ESM module, so it probably fails silently).
4. **Display modes:**
   - default: a single-terminal combined progress view (TTY), or plain periodic log lines (non-TTY / scheduled)
   - `--windows`: the existing Terminal.app windows, kept only if it's simple to support on top of the same workers
5. **Integration:** pipeline Phase 3 calls the parallel runner with `--parallel=N`. With `--parallel=1` it behaves like today's serial loop. Delete the standalone multi-terminal command and its `package.json` entry.
6. **Choosing N:** whisper.cpp uses the GPU (Metal), so N parallel processes share it. Benchmark N = 1..4 on the target machine (M1 vs M4 will differ), measuring audio-minutes transcribed per wall-clock minute, and pick a default. Allow overriding it in a config file and via the flag. Watch memory: each process loads its own copy of the model.

## Known issues in the current runner (fix or drop while reworking)

- If a worker crashes before logging `COMPLETE`, the monitor never finishes. Detect process exit, e.g. from the exit code.
- In each full data refresh, "Estimated completion" is computed before the totals are summed, so it always shows "Calculating…". Only the spinner frames show a real ETA.
- The lambda reports `completedMinutes` as `processedFiles × averageDuration`, even though each file's duration is known. Report actual durations.
- The lambda still accepts a legacy `TERMINAL_FILE_LIST` env var fallback, which can be removed.
- The lambda returns early with "No audio files found" after logging `START` without ever logging `COMPLETE`.
- `multi-terminal-runner.ts` still contains its proof-of-concept `main()` and generated mock script.
- macOS-only (AppleScript). That's fine given the Apple-silicon-only scope, but the headless mode shouldn't depend on it.

## Acceptance

- `bds ingest --all-sites --parallel=3` on a TTY shows combined progress for every site and finishes with a per-site summary. Each site's indexing and S3 upload run only after that site's transcription is done.
- The same command run from the scheduler (no TTY) produces readable logs and the correct exit code.
- Interrupting with Ctrl+C stops all workers and clears their lockfile entries.
