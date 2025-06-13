# Phase 4: Lambda Functions & Processing - Implementation Summary

## Overview
Phase 4 successfully transforms the Lambda functions from single-site to multi-site aware operations. Each site now gets its own Lambda instances with site-specific configurations, S3 paths, and isolated data processing.

## Key Changes Implemented

### 1. Site-Aware RSS Configuration

**Files Modified:**
- `packages/config/rss-config.ts`
- `packages/config/index.ts`
- `packages/config/package.json`

**Changes:**
- Added site-aware functions: `getRSSConfigForSite()`, `getCurrentSiteId()`, `getCurrentSiteRSSConfig()`
- RSS configuration now reads from `site.config.json` files instead of hardcoded values
- Added legacy exports for backwards compatibility
- Added `@browse-dot-show/sites` dependency

### 2. Site-Aware S3 Path Structure

**Files Modified:**
- `packages/s3/index.ts`

**Changes:**
- **Bucket Naming**: Site-specific buckets in production: `browse-dot-show-{siteId}-s3-prod`
- **Local Paths**: Site-specific local storage: `aws-local-dev/s3/sites/{siteId}/{key}`
- **Legacy Support**: Falls back to original paths when `CURRENT_SITE_ID` is not set

### 3. Site-Aware Constants

**Files Modified:**
- `packages/constants/index.ts`

**Changes:**
- Added site-aware functions: `getEpisodeManifestKey()`, `getSearchIndexKey()`, `getLocalDbPath()`
- **Episode Manifest**: `sites/{siteId}/episode-manifest/full-episode-manifest.json`
- **Search Index**: `sites/{siteId}/search-index/orama_index.msp`
- **Local DB**: `/tmp/orama_index_{siteId}.msp`
- Maintained legacy exports for backwards compatibility

### 4. Updated Lambda Scripts

**Files Modified:**
- `packages/ingestion/rss-retrieval-lambda/package.json`
- `packages/ingestion/process-audio-lambda/package.json`
- `packages/ingestion/srt-indexing-lambda/package.json`
- `packages/search/search-lambda/package.json`

**New Scripts Added:**
- `build:site` - Build lambda for specific site
- `run:site` - Run lambda for specific site
- `run:spelling-corrections:site` - Run spelling corrections for specific site
- `dev:site` - Run search lambda dev server for specific site
- `test:site` - Run search lambda tests for specific site

### 5. Site-Aware Shell Scripts

**New Files Created:**
- `scripts/build-lambda-for-site.sh`
- `scripts/run-lambda-for-site.sh`

**Features:**
- Automatic site directory discovery (my-sites/ vs origin-sites/)
- Environment validation (.env.aws file checks)
- Support for both ingestion and search lambdas
- Sets `CURRENT_SITE_ID` environment variable
- Uses site-specific AWS environment files

### 6. Updated RSS Retrieval Lambda

**Files Modified:**
- `packages/ingestion/rss-retrieval-lambda/retrieve-rss-feeds-and-download-audio-files.ts`

**Changes:**
- Uses `getCurrentSiteRSSConfig()` instead of hardcoded RSS_CONFIG
- Uses `getEpisodeManifestKey()` for site-specific manifest paths
- CloudFront invalidation uses site-specific paths
- Maintains full functionality with site-aware data isolation

## Usage Examples

### Building Lambdas for Specific Sites
```bash
# Build RSS retrieval lambda for listenfairplay site
cd packages/ingestion/rss-retrieval-lambda
pnpm build:site listenfairplay

# Build search lambda for listenfairplay site
cd packages/search/search-lambda
pnpm build:site listenfairplay
```

### Running Lambdas for Specific Sites
```bash
# Run RSS retrieval for listenfairplay site
cd packages/ingestion/rss-retrieval-lambda
pnpm run:site listenfairplay

# Run search lambda dev server for listenfairplay site
cd packages/search/search-lambda
pnpm dev:site listenfairplay
```

### Direct Script Usage
```bash
# Build any lambda for any site
./scripts/build-lambda-for-site.sh @browse-dot-show/rss-retrieval-lambda listenfairplay

# Run any lambda for any site
./scripts/run-lambda-for-site.sh @browse-dot-show/rss-retrieval-lambda retrieve-rss-feeds-and-download-audio-files.ts listenfairplay
```

## Data Isolation

### S3 Structure
- **Legacy**: Direct bucket root (`episode-manifest/`, `audio/`, `search-index/`)
- **Site-Aware**: Site-specific paths (`sites/{siteId}/episode-manifest/`, `sites/{siteId}/audio/`, etc.)

### Site-Specific Buckets
- **Development**: Continues using shared `listen-fair-play-s3-dev` bucket
- **Production**: Each site gets its own bucket: `browse-dot-show-{siteId}-s3-prod`

### Local Development
- **Legacy**: `aws-local-dev/s3/{files}`
- **Site-Aware**: `aws-local-dev/s3/sites/{siteId}/{files}`

## Backwards Compatibility

All changes maintain backwards compatibility:
- Legacy exports still available for old code
- Legacy S3 paths used when `CURRENT_SITE_ID` not set
- Existing scripts continue to work unchanged
- Original RSS_CONFIG still exported

## Environment Variables

### Required for Site-Aware Operations
- `CURRENT_SITE_ID` - Set by site-aware scripts to indicate which site to process

### Site-Specific Environment Files
- Each site must have `.env.aws` file with AWS credentials and configuration
- Scripts automatically locate and use the correct environment file

## Next Steps

With Phase 4 complete, the Lambda functions are now fully site-aware and ready for:
- **Phase 5**: Local Development & Testing improvements
- **Phase 6**: Documentation & Developer Experience enhancements
- **Phase 7**: Environment Simplification

## Testing

To test the implementation:
1. Ensure a site exists in `sites/origin-sites/` or `sites/my-sites/`
2. Ensure the site has a valid `.env.aws` file
3. Run the site-aware scripts to verify functionality
4. Check S3/local storage for site-specific paths 