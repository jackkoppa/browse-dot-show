# GitHub Issues Migration to Beads - Complete ✅

## Summary
Successfully migrated **11 open GitHub issues** to beads on `2025-12-29`.

## Migration Details

### Issues Migrated

| Beads ID | GitHub # | Title | Type | Priority | Labels |
|----------|---------|-------|------|----------|--------|
| browse-dot-show-77y | #123 | Fix hardcoded values in automation role deployment | bug | P1 | bug-report |
| browse-dot-show-33x | #124 | Terraform init timeouts during site deployment | bug | P1 | bug-report |
| browse-dot-show-6yj | #125 | Terraform deployment expects origin-sites instead of my-sites structure | bug | P1 | bug-report |
| browse-dot-show-pdi | #126 | FFmpeg layer creation script has directory issues | bug | P1 | bug-report |
| browse-dot-show-745 | #127 | Lambda layers over 50MB need S3 upload instead of file upload | bug | P1 | bug-report |
| browse-dot-show-8ip | #134 | Transcription times out after 150s or 300s | bug | P1 | bug-report |
| browse-dot-show-9b6 | #101 | Site deploy does not work correctly | bug | P2 | bug-report |
| browse-dot-show-7kd | #128 | Clarify and document site-account-mappings.json structure | feature | P2 | documentation, feature-request |
| browse-dot-show-1fx | #129 | Move origin-sites directory to separate fork to reduce repo size | feature | P3 | feature-request, planned-feature |
| browse-dot-show-8j9 | #131 | Show podcast name and cover art in search results for multi-feed sites | feature | P3 | feature-request, planned-feature |
| browse-dot-show-64i | #111 | Re-attempt to add speaker diarization to transcripts | feature | P4 | feature-request, help-wanted |

### Statistics
- **Total issues**: 11
- **Bugs**: 7 (6 P1, 1 P2)
- **Features**: 4 (1 P2, 2 P3, 1 P4)
- **All issues include**: External reference (gh-XXX), full descriptions, labels, priorities

### Notes

1. **Issue #101** - Added a note that this vague issue may be superseded by more specific deployment bugs (#123-128). Marked as P2 priority for review.

2. **Deployment Issues (#123-128)** - All related deployment bugs from Aug 24, 2025. These are grouped as high-priority bugs that need attention.

3. **External References** - All issues include `external-ref: gh-XXX` linking back to the original GitHub issues for traceability.

## Next Steps

1. Review migrated issues: `bd list`
2. View specific issue: `bd show <issue-id>`
3. Start working: `bd ready` (finds available work)
4. Update status: `bd update <issue-id> --status in_progress`
5. Sync with git: `bd sync`

## Verification

All issues can be verified with:
```bash
bd list --json | jq '.[] | select(.external_ref != null) | {id, title, external_ref, priority}'
```

## Files Created
- `ISSUE_MIGRATION_ANALYSIS.md` - Detailed analysis of issues before migration
- `MIGRATION_COMPLETE.md` - This summary document
- `migrate_issues.sh` - Migration script (can be deleted if not needed)
