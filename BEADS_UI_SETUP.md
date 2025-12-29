# Beads UI Setup Guide

## Installation ✅

Beads UI has been installed globally via pnpm:
```bash
pnpm add -g beads-ui
```

## Starting the UI

Since the binary may not be directly in your PATH, use one of these methods:

### Method 1: Using pnpm exec (Recommended)
```bash
cd /Users/jackkoppa/Personal_Development/browse-dot-show
pnpm exec bdui start --open
```

### Method 2: Add to PATH (Optional)
If you want to use `bdui` directly, you can add pnpm's global bin directory to your PATH:
```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="$HOME/Library/pnpm:$PATH"
```

Then you can use:
```bash
bdui start --open
```

## Usage

### Start the UI Server
```bash
# Start and open browser automatically
pnpm exec bdui start --open

# Start without opening browser
pnpm exec bdui start

# Start on custom port
pnpm exec bdui start --port 8080

# Start and bind to all interfaces
pnpm exec bdui start --host 0.0.0.0
```

### Stop the Server
```bash
pnpm exec bdui stop
```

### Restart the Server
```bash
pnpm exec bdui restart --open
```

## Features

The Beads UI provides:

1. **Issues View** - Filter and search issues, edit inline
2. **Epics View** - Show progress per epic, expand rows, edit inline  
3. **Board View** - Blocked / Ready / In progress / Closed columns
4. **Keyboard Navigation** - Navigate and edit without touching the mouse
5. **Live Updates** - Monitors the beads database for changes

## Default Access

- **URL**: http://127.0.0.1:3000
- **Host**: 127.0.0.1 (localhost only)
- **Port**: 3000

## Environment Variables

You can customize behavior with environment variables:

- `BD_BIN`: Path to the `bd` binary (default: auto-detected)
- `BDUI_RUNTIME_DIR`: Override runtime directory for PID/logs
- `HOST`: Override bind address (default: 127.0.0.1)
- `PORT`: Override listen port (default: 3000)

Example:
```bash
PORT=8080 pnpm exec bdui start --open
```

## Reviewing Your Migrated Issues

Once the UI is running:

1. **View All Issues**: The main issues view shows all 11 migrated issues
2. **Filter by Priority**: Use filters to see P1 bugs, planned features, etc.
3. **Search**: Search for specific issue titles or GitHub references (gh-XXX)
4. **Edit Issues**: Click on issues to edit them inline
5. **Board View**: Switch to board view to see issues by status
6. **Epics View**: If you create epics, view progress here

## Quick Start Script

You can create a simple script to start the UI:

```bash
#!/bin/bash
cd /Users/jackkoppa/Personal_Development/browse-dot-show
pnpm exec bdui start --open
```

Save as `start-beads-ui.sh` and make it executable:
```bash
chmod +x start-beads-ui.sh
./start-beads-ui.sh
```
