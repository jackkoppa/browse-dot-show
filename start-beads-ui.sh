#!/bin/bash
# Convenience script to start Beads UI for browse-dot-show

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

pnpm exec bdui start --open
