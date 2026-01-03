# Local Development Guide

This guide covers tools and workflows for local development of `browse-dot-show`.

## Tool Management with Hermit

This project uses [Hermit](https://cashapp.github.io/hermit) to manage development tools (Node.js and pnpm). Hermit ensures consistent tool versions across all developers and CI environments.

### Why Hermit?

- **Automatic activation**: Tools become available when you `cd` into the project (with shell hooks)
- **Version consistency**: Everyone uses the exact same Node.js and pnpm versions
- **No global installs**: Tools are project-scoped, avoiding conflicts
- **Simple setup**: One command to install, one command for shell hooks

### Installation

```bash
# Install Hermit (installs to ~/bin)
curl -fsSL https://github.com/cashapp/hermit/releases/download/stable/install.sh | /bin/bash

# Add ~/bin to PATH (if not already there)
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc  # or ~/.bashrc for Bash

# Install shell hooks for automatic activation (recommended)
source ~/.zshrc  # reload to pick up ~/bin
hermit shell-hooks

# Restart your shell
```

### Usage

**With shell hooks (recommended):**

```bash
# Just cd into the project - tools activate automatically!
cd browse-dot-show
node --version  # v20.19.6
pnpm --version  # 10.15.1
```

**Without shell hooks:**

```bash
# Manually activate the environment
. bin/activate-hermit

# Now tools are available
node --version
pnpm --version

# Deactivate when done
deactivate-hermit
```

### Managing Packages

```bash
# List installed packages
hermit list

# Search for available packages
hermit search <package-name>

# Install a package
hermit install <package-name>

# Update packages
hermit update
```

### Alternative: Using nvm/Corepack

If you prefer not to use Hermit, you can manage tools manually:

- Use [nvm](https://github.com/nvm-sh/nvm) for Node.js (version 20+)
- Install pnpm globally or use Corepack: `corepack enable && corepack prepare pnpm@10.15.1 --activate`

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
pnpm worktree create <branch-name>

# Example: Create a worktree for feature branch
pnpm worktree create feature/my-feature
```

This will:
- Create a new branch if it doesn't exist (from current HEAD)
- Create a worktree directory at `<worktree-directory>/<branch-name>`
- Check out the branch in the new worktree

### Listing Worktrees

```bash
# List all worktrees
pnpm worktree list
```

### Removing a Worktree

```bash
# Remove a worktree
pnpm worktree remove <branch-name>
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

See also

```bash
pnpm worktree help
```

### Configuration

The worktree directory is stored in `.local-files-config.json`:

```json
{
  "worktreeDirectory": "/path/to/worktrees"
}
```

This file is gitignored and can be customized per developer.
