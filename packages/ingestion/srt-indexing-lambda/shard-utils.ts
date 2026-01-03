/**
 * Utilities for sharding search indexes across multiple files
 * Used when SHARD_COUNT > 1 to support large sites that exceed single Lambda memory limits
 */

import { ShardManifest, ShardInfo, SearchEntry } from '@browse-dot-show/types';
import { getShardedSearchIndexKey, getShardManifestKey } from '@browse-dot-show/constants';
import { log } from '@browse-dot-show/logging';

/**
 * Get the shard count from environment variable
 * Returns 1 (no sharding) if not set or invalid
 */
export function getShardCount(): number {
  const shardCountEnv = process.env.SHARD_COUNT;
  if (!shardCountEnv) {
    return 1; // Default: no sharding
  }

  const parsed = parseInt(shardCountEnv, 10);
  if (isNaN(parsed) || parsed < 1) {
    log.warn(`Invalid SHARD_COUNT environment variable: ${shardCountEnv}. Using default of 1 (no sharding).`);
    return 1;
  }

  return parsed;
}

/**
 * Check if we're running in sharded mode
 */
export function isShardedMode(): boolean {
  return getShardCount() > 1;
}

/**
 * Calculate episode ranges for each shard
 * Distributes episodes evenly across shards by sequential ID
 * 
 * @param totalEpisodes - Total number of episodes
 * @param shardCount - Number of shards to create
 * @returns Array of [startId, endId] ranges for each shard (1-indexed, inclusive)
 */
export function calculateShardRanges(totalEpisodes: number, shardCount: number): Array<[number, number | null]> {
  if (shardCount === 1) {
    // Single shard covers all episodes
    return [[1, null]];
  }

  const episodesPerShard = Math.ceil(totalEpisodes / shardCount);
  const ranges: Array<[number, number | null]> = [];

  for (let i = 0; i < shardCount; i++) {
    const startId = i * episodesPerShard + 1;
    const endId = i === shardCount - 1 ? null : (i + 1) * episodesPerShard;
    ranges.push([startId, endId]);
  }

  return ranges;
}

/**
 * Determine which shard a given episode belongs to
 * 
 * @param sequentialEpisodeId - The episode's sequential ID (1-indexed)
 * @param shardRanges - Array of shard ranges
 * @returns Shard ID (1-indexed) or null if episode doesn't belong to any shard
 */
export function getShardForEpisode(
  sequentialEpisodeId: number,
  shardRanges: Array<[number, number | null]>
): number | null {
  for (let i = 0; i < shardRanges.length; i++) {
    const [startId, endId] = shardRanges[i];
    
    if (endId === null) {
      // Last shard covers all remaining episodes
      if (sequentialEpisodeId >= startId) {
        return i + 1; // Return 1-indexed shard ID
      }
    } else {
      // Check if episode is in this shard's range (inclusive)
      if (sequentialEpisodeId >= startId && sequentialEpisodeId <= endId) {
        return i + 1; // Return 1-indexed shard ID
      }
    }
  }

  return null; // Episode doesn't belong to any shard (shouldn't happen)
}

/**
 * Group search entries by shard
 * 
 * @param allEntries - All search entries
 * @param shardRanges - Array of shard ranges
 * @returns Map of shard ID to search entries
 */
export function groupEntriesByShard(
  allEntries: SearchEntry[],
  shardRanges: Array<[number, number | null]>
): Map<number, SearchEntry[]> {
  const shardMap = new Map<number, SearchEntry[]>();

  // Initialize empty arrays for each shard
  for (let i = 0; i < shardRanges.length; i++) {
    shardMap.set(i + 1, []);
  }

  // Group entries by shard
  for (const entry of allEntries) {
    const sequentialId = parseInt(entry.sequentialEpisodeIdAsString, 10);
    const shardId = getShardForEpisode(sequentialId, shardRanges);

    if (shardId === null) {
      log.warn(`Entry ${entry.id} with sequential ID ${sequentialId} doesn't belong to any shard. Skipping.`);
      continue;
    }

    const shardEntries = shardMap.get(shardId);
    if (shardEntries) {
      shardEntries.push(entry);
    }
  }

  return shardMap;
}

/**
 * Generate shard manifest metadata
 * 
 * @param shardCount - Number of shards
 * @param shardRanges - Array of shard ranges
 * @param totalEpisodes - Total number of episodes
 * @param siteId - Site identifier
 * @param shardEntryCounts - Map of shard ID to entry count (optional)
 * @returns Shard manifest object
 */
export function generateShardManifest(
  shardCount: number,
  shardRanges: Array<[number, number | null]>,
  totalEpisodes: number,
  siteId: string,
  shardEntryCounts?: Map<number, number>
): ShardManifest {
  const shards: ShardInfo[] = [];

  for (let i = 0; i < shardCount; i++) {
    const shardId = i + 1;
    const [startId, endId] = shardRanges[i];
    const indexPath = getShardedSearchIndexKey(shardId);

    // Calculate episode count for this shard
    let episodeCount: number;
    if (endId === null) {
      // Last shard: count from startId to totalEpisodes
      episodeCount = totalEpisodes - startId + 1;
    } else {
      // Regular shard: count from startId to endId (inclusive)
      episodeCount = endId - startId + 1;
    }

    const shardInfo: ShardInfo = {
      id: shardId,
      episodeRange: [startId, endId],
      indexPath,
      episodeCount
    };

    shards.push(shardInfo);
  }

  return {
    version: 1,
    shardCount,
    shards,
    createdAt: new Date().toISOString(),
    totalEpisodes,
    siteId
  };
}

/**
 * Log sharding configuration for debugging
 */
export function logShardingConfig(shardCount: number, shardRanges: Array<[number, number | null]>): void {
  if (shardCount === 1) {
    log.info('Running in SINGLE mode (no sharding)');
    return;
  }

  log.info(`Running in SHARDED mode: ${shardCount} shards`);
  for (let i = 0; i < shardRanges.length; i++) {
    const [startId, endId] = shardRanges[i];
    const endStr = endId === null ? '∞' : endId.toString();
    log.info(`  Shard ${i + 1}: episodes ${startId}-${endStr}`);
  }
}
