# GitHub Issues Migration Analysis

## Summary
Found **11 open GitHub issues** to migrate to beads. Analysis below includes prioritization, grouping, and potential duplicates/outdated issues.

## Issues by Category

### 🔴 High Priority Bugs (Deployment Issues - Aug 24, 2025)
These all appear related to deployment problems discovered around the same time:

1. **#123** - Fix hardcoded values in automation role deployment
   - Type: bug
   - Priority: P1
   - Status: Clear bug, needs fixing

2. **#124** - Terraform init timeouts during site deployment  
   - Type: bug
   - Priority: P1
   - Status: Clear bug, user-reported

3. **#125** - Terraform deployment expects origin-sites instead of my-sites structure
   - Type: bug
   - Priority: P1
   - Status: Clear bug, blocks user deployments

4. **#126** - FFmpeg layer creation script has directory issues
   - Type: bug
   - Priority: P1
   - Status: Clear bug, discovered during deployment

5. **#127** - Lambda layers over 50MB need S3 upload instead of file upload
   - Type: bug
   - Priority: P1
   - Status: Clear bug, user had to workaround

6. **#128** - Clarify and document site-account-mappings.json structure
   - Type: task (documentation)
   - Priority: P2
   - Status: Documentation needed, caused deployment issues

### 🟡 Medium Priority Bugs

7. **#134** - Transcription times out after 150s or 300s
   - Type: bug
   - Priority: P1
   - Status: Most recently updated (Oct 1), user-reported issue
   - Note: May need configurable timeout or better error handling

8. **#101** - Site deploy does not work correctly
   - Type: bug
   - Priority: P2 (possibly outdated)
   - Status: ⚠️ **UNCERTAINTY**: Very vague description, last updated Aug 7
   - Note: May be superseded by more specific issues (#123-128). Should verify if still relevant.

### 🟢 Features

9. **#111** - Re-attempt to add speaker diarization to transcripts
   - Type: feature
   - Priority: P4 (help-wanted)
   - Status: Low priority, explicitly marked help-wanted
   - Note: Author noted it's not currently prioritized

10. **#129** - Move origin-sites directory to separate fork to reduce repo size
    - Type: feature
    - Priority: P3 (planned-feature)
    - Status: Planned feature, architectural improvement

11. **#131** - Show podcast name and cover art in search results for multi-feed sites
    - Type: feature
    - Priority: P3 (planned-feature)
    - Status: Planned feature, UX improvement

## Questions for Review

1. **Issue #101** - Is this still relevant? It's vague and may be covered by the more specific deployment bugs (#123-128). Should we:
   - Migrate as-is with a note about potential duplication?
   - Skip it and mark as potentially resolved?
   - Try to get more details first?

2. **Grouping** - Should issues #123-128 be grouped as a parent issue "Fix deployment issues" with sub-issues, or kept separate?

3. **Priority adjustments** - Any changes needed to the priority assignments above?

4. **Labels** - Should we preserve all GitHub labels or simplify? Current plan:
   - Preserve: bug-report, feature-request, documentation, help-wanted, planned-feature
   - Map to beads types: bug, feature, task

## Migration Plan

Once approved, I will:
1. Create all issues in beads with proper metadata
2. Map GitHub labels to beads types and labels
3. Add external-ref linking back to GitHub issues
4. Preserve full issue descriptions
5. Set appropriate priorities
6. Group related issues if desired
