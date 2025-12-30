# Agent Instructions

This project uses **bd** (beads) for issue tracking.

## Prerequisites

Before running any commands, you must have **Hermit** installed and configured.

### Install Hermit

```bash
curl -fsSL https://github.com/cashapp/hermit/releases/download/stable/install.sh | /bin/bash
```

### Install Shell Hooks (Recommended)

Shell hooks enable automatic environment activation when entering the project directory:

```bash
# For Zsh (macOS default)
hermit shell-hooks --zsh

# For Bash
hermit shell-hooks --bash

# For Fish
hermit shell-hooks --fish
```

After installing shell hooks, restart your shell or run `source ~/.zshrc` (or equivalent).

### Manual Activation (Alternative)

If you prefer not to use shell hooks, manually activate the environment:

```bash
. bin/activate-hermit
```

### Verify Setup

```bash
# Check that Node and pnpm are available
node --version  # Should show v20.x.x
pnpm --version  # Should show 10.15.1
```

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

