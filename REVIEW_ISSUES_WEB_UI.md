# How to Review Issues with Beads Web UI

## Quick Start

### Start the UI
```bash
# Option 1: Use the convenience script
./start-beads-ui.sh

# Option 2: Use pnpm exec directly
pnpm exec bdui start --open

# Option 3: If bdui is in your PATH
bdui start --open
```

The UI will automatically open in your browser at **http://127.0.0.1:3000**

## Reviewing Your Migrated Issues

### 1. **Issues View** (Default)
- **View all 11 migrated issues** with their titles, priorities, types, and status
- **Filter by**:
  - Priority (P1-P4)
  - Type (bug, feature, task)
  - Status (open, in_progress, done, etc.)
  - Labels (bug-report, feature-request, etc.)
- **Search**: Use the search bar to find issues by:
  - Title keywords
  - GitHub reference (e.g., "gh-123")
  - Issue ID (e.g., "browse-dot-show-77y")
- **Edit inline**: Click on any issue to view full details and edit

### 2. **Board View**
Switch to board view to see issues organized by status:
- **Blocked** - Issues that are blocked
- **Ready** - Issues ready to work on
- **In Progress** - Issues currently being worked on
- **Closed** - Completed issues

This is great for visualizing workflow and seeing what needs attention.

### 3. **Epics View**
If you create epics (parent issues), this view shows:
- Progress per epic
- Expandable rows to see child issues
- Overall completion status

## Key Features for Review

### Filter Your Migrated Issues

**View High Priority Bugs:**
- Filter by Priority: P1
- Filter by Type: bug
- This shows the 6 deployment-related bugs (#123-127, #134)

**View Planned Features:**
- Filter by Labels: planned-feature
- This shows issues #129 and #131

**View Help-Wanted:**
- Filter by Labels: help-wanted
- This shows issue #111 (speaker diarization)

### Search for Specific Issues

- Search "gh-101" to find the vague deployment issue
- Search "terraform" to find all terraform-related bugs
- Search "transcription" to find the timeout issue (#134)

### Review Issue Details

Click on any issue to see:
- Full description (preserved from GitHub)
- External reference (gh-XXX) linking back to GitHub
- All labels and metadata
- Edit capabilities

## Keyboard Navigation

The UI supports keyboard navigation:
- Use arrow keys to navigate between issues
- Press `Enter` to edit an issue
- Use `Esc` to cancel editing
- Tab through fields when editing

## Live Updates

The UI automatically updates when:
- Issues are created, updated, or closed via `bd` CLI
- Changes are made in the beads database
- You edit issues directly in the UI

## Stopping the Server

When you're done reviewing:
```bash
pnpm exec bdui stop
```

Or press `Ctrl+C` in the terminal where it's running.

## Tips for Review

1. **Start with Board View** - Get a quick overview of what's ready vs in progress
2. **Filter by P1** - Focus on high-priority bugs first
3. **Search "gh-"** - Quickly find all migrated GitHub issues
4. **Check External Refs** - Verify all issues have `gh-XXX` references
5. **Review Issue #101** - Check if this vague issue is still relevant or can be closed

## Your Migrated Issues Summary

- **11 total issues** migrated from GitHub
- **6 P1 bugs** - Deployment issues (#123-127, #134)
- **1 P2 bug** - Vague deployment issue (#101) - needs review
- **1 P2 task** - Documentation (#128)
- **2 P3 features** - Planned features (#129, #131)
- **1 P4 feature** - Help-wanted (#111)

All issues are linked back to GitHub via `external-ref: gh-XXX` for traceability.
