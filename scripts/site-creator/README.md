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
- **Deduplication**: Reuses existing utilities from `../utils/`
- **Maintainability**: Each file is under 500 lines for readability
- **Backwards Compatibility**: The original `../create-site.ts` still works

## Dependencies

The site creator modules depend on shared utilities:
- `../utils/shell-exec.ts` - Shell command execution
- `../utils/file-operations.ts` - File system operations
- `../utils/logging.ts` - Logging and output formatting

## Usage

The tool can be used either through the original entry point:
```bash
pnpm tsx scripts/create-site.ts
```

Or directly through the new main module:
```bash
pnpm tsx scripts/site-creator/main.ts
```

See [Getting Started guide](../../docs/GETTING_STARTED.md) for full documentation.