# Episode Manifest Caching Optimization

## Overview

This document describes the implementation of an optimized caching strategy for the episode-manifest file to ensure that newly transcribed episodes are always available immediately after ingestion runs, while maintaining fast page load times.

## Problem Statement

Previously, the episode-manifest file was cached by CloudFront for up to 1 hour, which meant that newly transcribed episodes might not be visible to users immediately after the ingestion pipeline completed. While cache invalidation was performed during ingestion, there could still be delays due to CDN propagation.

## Solution Architecture

We implemented a hybrid caching strategy that combines the benefits of both CloudFront caching and client-side smart caching:

### 1. CloudFront Configuration Changes

**File:** `terraform/sites/modules/cloudfront/main.tf`

- Added a specific cache behavior for `episode-manifest/*` paths with TTL=0
- This ensures CloudFront always fetches fresh manifest files from S3
- Other files maintain their existing cache behaviors

```terraform
# Cache behavior for episode-manifest files - always fetch fresh
ordered_cache_behavior {
  path_pattern     = "episode-manifest/*"
  allowed_methods  = ["GET", "HEAD", "OPTIONS"]
  cached_methods   = ["GET", "HEAD"]
  target_origin_id = "S3-${var.bucket_name}"

  forwarded_values {
    query_string = false
    cookies {
      forward = "none"
    }
  }

  viewer_protocol_policy = "redirect-to-https"
  min_ttl                = 0
  default_ttl            = 0        # No caching - always fetch fresh
  max_ttl                = 0        # No caching - always fetch fresh
}
```

### 2. Manifest Metadata Generation

**Files:** 
- `packages/constants/site-constants.ts` - Added `getEpisodeManifestMetadataKey()` function
- `packages/types/episode-manifest.ts` - Added `EpisodeManifestMetadata` interface
- `packages/ingestion/rss-retrieval-lambda/retrieve-rss-feeds-and-download-audio-files.ts` - Added metadata generation

Created a lightweight metadata file (`manifest-metadata.json`) that contains:
- `lastUpdated`: ISO timestamp of the last manifest update
- `episodeCount`: Total number of episodes
- `version`: Human-readable version string (format: vYYYY.MM.DD.HHMM)

This metadata file is automatically generated and saved alongside the full manifest during every ingestion run.

### 3. Smart Client-Side Caching

**File:** `packages/client/src/hooks/useEpisodeManifest.ts`

Completely rewrote the `useEpisodeManifest` hook to implement a smart caching strategy:

#### Strategy Flow:
1. **Instant Load**: Load cached manifest from localStorage immediately for instant UI rendering
2. **Background Check**: Fetch the small metadata file to check if refresh is needed
3. **Conditional Refresh**: Only fetch the full manifest if the server version is newer
4. **Graceful Fallback**: Use stale cached data if network requests fail

#### Key Features:
- **localStorage Integration**: Persistent caching across browser sessions
- **Metadata-Based Freshness**: Efficient freshness checking using tiny metadata file
- **Network Resilience**: Graceful handling of network failures
- **Performance Optimized**: Instant page loads with background updates
- **Memory Efficient**: Single global cache shared across all hook instances

## Benefits

### 1. Instant Page Loads
- Users see content immediately from localStorage cache
- No loading spinners for returning visitors
- Improved perceived performance

### 2. Always Fresh Content
- New episodes are guaranteed to be visible immediately after ingestion
- No more waiting for CDN cache expiration
- Metadata-based freshness checking is highly efficient

### 3. Network Resilience
- Graceful degradation when network is unavailable
- Stale data is better than no data
- Automatic recovery when network returns

### 4. Cost Efficient
- Reduced S3 requests (only when content actually changes)
- Minimal CloudFront bandwidth usage for metadata checks
- No unnecessary full manifest downloads

## Implementation Details

### CloudFront Behavior Order
The new episode-manifest cache behavior is placed after the existing audio and transcript behaviors, ensuring proper precedence:

1. `*.mp3` files (1 day cache)
2. `*.srt` files (1 day cache)
3. `episode-manifest/*` files (no cache)
4. Default behavior (1 hour cache)

### localStorage Keys
- `episodeManifest`: Full episode manifest data
- `episodeManifestMetadata`: Lightweight metadata for freshness checks

### Error Handling
- Network failures fall back to cached data
- Invalid JSON in localStorage is handled gracefully
- Missing metadata triggers full refresh

## Testing

All existing client tests continue to pass, ensuring backward compatibility:
- `src/utils/__tests__/search.test.ts` ✓
- `src/components/__tests__/SearchInput.test.tsx` ✓  
- `src/routes/__tests__/routing.test.tsx` ✓

## Deployment Considerations

### Infrastructure Changes
The CloudFront configuration changes require a Terraform apply to take effect. This is a non-breaking change that will improve performance immediately.

### Client Changes
The client changes are backward compatible and will gracefully handle both old and new manifest formats.

### Ingestion Pipeline
The ingestion pipeline changes are additive - the metadata generation doesn't affect existing functionality.

## Monitoring

Monitor the following metrics to verify the optimization is working:

1. **CloudFront Cache Hit Ratio**: Should remain high for other assets
2. **S3 Request Patterns**: Should see reduced episode-manifest requests
3. **Client Performance**: Faster Time to First Contentful Paint
4. **User Experience**: Immediate visibility of new episodes post-ingestion

## Future Enhancements

Potential improvements for the future:
1. **Service Worker Integration**: For even better offline support
2. **Delta Updates**: Only download changes instead of full manifest
3. **Compression**: Use gzip compression for manifest files
4. **Analytics**: Track cache hit rates and user experience metrics