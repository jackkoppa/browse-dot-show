# Worktree Usage Examples

> **Note**: This is a temporary file with example usage. It will be deleted before merging.

## Common Workflows

### Starting a New Feature Branch

```bash
# 1. Create a worktree for your feature
pnpm worktree create feature/add-new-search

# 2. Navigate to the worktree
cd /Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees/feature/add-new-search

# 3. Start working - install dependencies, run dev server, etc.
pnpm install
pnpm dev

# 4. In another terminal, you can work on the main branch or another feature
cd /Users/jackkoppa/Personal_Development/browse-dot-show
```

### Parallel Agent Sessions

When running multiple agent sessions in parallel:

```bash
# Terminal 1: Agent working on bug fix
pnpm worktree create bug/fix-transcription-timeout
cd /Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees/bug/fix-transcription-timeout
# Agent session starts here...

# Terminal 2: Agent working on feature
pnpm worktree create feature/add-authentication
cd /Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees/feature/add-authentication
# Another agent session starts here...

# Terminal 3: Main branch for quick fixes
cd /Users/jackkoppa/Personal_Development/browse-dot-show
# Work on main branch without conflicts
```

### Checking What Worktrees Exist

```bash
# List all worktrees
pnpm worktree list
```

Output example:
```
📋 Listing worktrees in: /Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees

Worktrees:
  1. /Users/jackkoppa/Personal_Development/browse-dot-show
     Branch: main

  2. /Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees/feature/add-new-search
     Branch: feature/add-new-search
     📂 /Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees/feature/add-new-search

  3. /Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees/bug/fix-transcription-timeout
     Branch: bug/fix-transcription-timeout
     📂 /Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees/bug/fix-transcription-timeout
```

### Cleaning Up After Work is Complete

```bash
# Remove a worktree when done
pnpm worktree remove feature/add-new-search
```

# You'll be prompted to delete the branch if it exists
# After removal, you can delete the remote branch if needed:
git push origin --delete feature/add-new-search
```

### Working with Existing Branches

If a branch already exists (locally or remotely):

```bash
# Create worktree for existing branch
pnpm worktree create existing-branch-name
```

# The script will detect the existing branch and use it
```

### Switching Between Worktrees

Each worktree is independent. You can:

1. Have different node_modules in each worktree
2. Run different dev servers simultaneously
3. Make commits independently
4. Push from any worktree

```bash
# Worktree 1
cd /Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees/feature/a
pnpm dev  # Runs on port 3000

# Worktree 2 (different terminal)
cd /Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees/feature/b
pnpm dev  # Runs on port 3001 (or configure different port)
```

### Integration with Beads

```bash
# In each worktree, you can use beads independently
cd /Users/jackkoppa/Workrees_Personal_Development/browse-dot-show--worktrees/feature/my-feature
bd ready              # Find available work
bd update bds-123 --status in_progress  # Claim work
# ... do work ...
bd close bds-123      # Complete work
bd sync               # Sync with git
git push              # Push changes
```

## Tips

- **Naming**: Use descriptive branch names that match your worktree directory name
- **Cleanup**: Regularly remove worktrees for completed work to save disk space
- **Configuration**: The worktree directory is saved in `.local-files-config.json` after first use
- **Independence**: Each worktree is completely independent - changes in one don't affect others until merged
