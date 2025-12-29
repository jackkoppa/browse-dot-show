#!/bin/bash
# Script to migrate GitHub issues to beads
# This script reads from /tmp/github_issues_clean.json

cd /Users/jackkoppa/Personal_Development/browse-dot-show

# Function to create issue in beads
create_beads_issue() {
    local gh_num=$1
    local title=$2
    local body=$3
    local issue_type=$4
    local labels=$5
    local priority=$6
    
    echo "Creating beads issue for GH-#$gh_num: $title"
    
    # Create issue with description from file
    echo "$body" > /tmp/issue_body_${gh_num}.md
    
    bd create "$title" \
        --type "$issue_type" \
        --description-file /tmp/issue_body_${gh_num}.md \
        --external-ref "gh-${gh_num}" \
        --priority "$priority" \
        --labels "$labels" \
        --silent
    
    rm /tmp/issue_body_${gh_num}.md
}

# Read issues from JSON and create them
cat /tmp/github_issues_clean.json | jq -r '.[] | 
    "\(.number)|\(.title)|\(.body // "" | gsub("\n"; "\\n") | gsub("\""; "\\""))|\(.labels | map(.name) | join(","))"
' | while IFS='|' read -r num title body labels; do
    # Determine issue type
    if echo "$labels" | grep -q "bug-report"; then
        issue_type="bug"
    elif echo "$labels" | grep -q "feature-request"; then
        issue_type="feature"
    elif echo "$labels" | grep -q "documentation"; then
        issue_type="task"
    else
        issue_type="task"
    fi
    
    # Determine priority (P0=highest, P4=lowest)
    # Recent bugs = P1, Planned features = P3, Help wanted = P4
    if echo "$labels" | grep -q "help-wanted"; then
        priority="P4"
    elif echo "$labels" | grep -q "planned-feature"; then
        priority="P3"
    elif [ "$issue_type" = "bug" ]; then
        priority="P1"
    else
        priority="P2"
    fi
    
    # Clean up body (remove markdown formatting issues)
    clean_body=$(echo "$body" | sed 's/\\n/\n/g')
    
    create_beads_issue "$num" "$title" "$clean_body" "$issue_type" "$labels" "$priority"
done

echo "Migration complete!"
