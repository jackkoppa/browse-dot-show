# Local Development Guide

This guide covers tools and workflows for local development of `browse-dot-show`.

## Issue Tracking with Beads

This project uses [Beads](https://github.com/steveyegge/beads) for issue tracking. Beads provides a lightweight, git-based issue tracking system that integrates seamlessly with your workflow.

### Quick Start

```bash
# Onboard to the project (first time only)
bd onboard

# Find available work
bd ready

# View issue details
bd show <id>

# Claim work
bd update <id> --status in_progress

# Complete work
bd close <id>

# Sync with git
bd sync
```

### Web UI

To view and manage issues in a web UI:

```bash
# Start the Beads UI (opens in browser at http://127.0.0.1:3000)
./scripts/start-beads-ui.sh
```

### Workflow

See [AGENTS.md](../AGENTS.md) for detailed workflow instructions, including the mandatory "Landing the Plane" process for completing work sessions.

## Git Worktrees for Parallel Development

When working with multiple agent sessions or parallel development tasks, git worktrees allow you to have multiple working directories for the same repository, each checked out to a different branch.

### Setup

The worktree directory is configured via `.local-files-config.json`. On first use, the script will prompt you to set this directory.

### Creating a Worktree

```bash
# Create a new worktree for a branch
tsx scripts/worktree.ts create <branch-name>

# Example: Create a worktree for feature branch
tsx scripts/worktree.ts create feature/my-feature
```

This will:
- Create a new branch if it doesn't exist (from current HEAD)
- Create a worktree directory at `<worktree-directory>/<branch-name>`
- Check out the branch in the new worktree

### Listing Worktrees

```bash
# List all worktrees
tsx scripts/worktree.ts list
```

### Removing a Worktree

```bash
# Remove a worktree
tsx scripts/worktree.ts remove <branch-name>
```

This will:
- Remove the worktree directory
- Optionally delete the branch (you'll be prompted)

### Using Worktrees

After creating a worktree, navigate to its directory:

```bash
cd <worktree-directory>/<branch-name>
```

Each worktree is a fully independent working directory. You can:
- Run commands independently
- Have different dependencies installed
- Work on different features simultaneously
- Use different agent sessions without conflicts

### Configuration

The worktree directory is stored in `.local-files-config.json`:

```json
{
  "worktreeDirectory": "/path/to/worktrees"
}
```

This file is gitignored and can be customized per developer.
