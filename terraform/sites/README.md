# Terraform Sites Configuration

## ⚠️ Important: Terraform Files Have Moved

As of the site reorganization (Phase 2), **site-specific terraform configuration files have been moved** to individual site directories to better organize site-specific content.

## New File Locations

Site-specific terraform files are now located in each site's directory:

```
sites/my-sites/{site-id}/terraform/
├── prod.tfvars          # Previously: terraform/sites/environments/{site-id}-prod.tfvars
└── backend.tfbackend    # Previously: terraform/sites/backend-configs/{site-id}.tfbackend
```

## Example Locations

For your own sites, use the `my-sites` directory:
- **my-site**: `sites/my-sites/my-site/terraform/`

Example sites from the main repository (if available) would be in:
- **example-site**: `sites/origin-sites/example-site/terraform/`

## Deployment Scripts

Deployment scripts have been updated to look for terraform files in the new locations. The main terraform infrastructure definitions remain in this directory (`terraform/sites/`), but site-specific variable files and backend configurations are now co-located with each site.

## Benefits of New Structure

1. **Site Isolation**: Each site's terraform configuration is self-contained
2. **Easier Site Management**: All site-specific files (config, assets, terraform) are in one place
3. **Better Organization**: Follows the principle of keeping site-specific content in site directories
4. **Simplified Site Creation**: New sites can be created with all necessary files in one location

## For New Sites

When creating a new site, create the terraform directory structure:

```bash
mkdir -p sites/my-sites/{new-site-id}/terraform/
# Copy and modify template files from template-site or existing sites
```

## Migration Notes

This change was part of the site reorganization effort documented in `IMPROVING_GITIGNORE_AND_FILE_DEDUPING_FOR_SITES.md`. The old centralized files in `environments/` and `backend-configs/` have been removed.