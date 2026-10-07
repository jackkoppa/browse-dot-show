# Site Creator

This directory contains the modular site creation tool for browse.show podcast sites.

## Architecture

The site creator is broken down into focused modules:

### Core Modules

- **`main.ts`** - Main orchestration and flow control (~300 lines)
- **`types.ts`** - TypeScript type definitions for all modules (~100 lines)

### Functionality Modules

- **`setup-steps.ts`** - Step definitions and progress management (~200 lines)
- **`platform-support.ts`** - Platform compatibility checking (~200 lines)
- **`podcast-search.ts`** - RSS feed searching and configuration (~200 lines)
- **`site-operations.ts`** - Site creation and file operations (~200 lines)
- **`step-executors.ts`** - Individual step execution functions (~400 lines)
- **`step-executors-advanced.ts`** - Complex step functions like complete transcriptions (~500 lines)

## Design Principles

- **Modularity**: Each file focuses on a specific concern
- **Deduplication**: Reuses shared modules from `../lib/`
- **Maintainability**: Each file is under 500 lines for readability

## Dependencies

The site creator modules depend on shared utilities:
- `../lib/shell-exec.ts` - Shell command execution
- `../lib/file-operations.ts` - File system operations
- `../lib/logging.ts` - Logging and output formatting
- `../lib/lambda.ts` - Running ingestion lambdas locally
- `../ingestion/transcription.ts` - Parallel transcription

## Usage

```bash
pnpm bds site create            # start or continue setup
pnpm bds site create --review   # progress for every site
```

See [Getting Started guide](../../docs/GETTING_STARTED.md) for full documentation.