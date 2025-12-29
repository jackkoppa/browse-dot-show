/**
 * Shard manifest types for search orchestration
 * Used to support large sites that exceed single Lambda memory limits
 * 
 * @see docs/architecture/search-orchestration.md for full architecture details
 */

/**
 * Information about a single search index shard
 */
export interface ShardInfo {
    /** Shard ID (1-indexed) */
    id: number;
    
    /** 
     * Episode range covered by this shard [startId, endId]
     * endId is null for the last shard (covers all remaining episodes)
     */
    episodeRange: [number, number | null];
    
    /** S3 key path to the shard's Orama index file */
    indexPath: string;
    
    /** Number of episodes in this shard */
    episodeCount?: number;
    
    /** Compressed size of the index file in bytes (for monitoring) */
    indexSizeBytes?: number;
}

/**
 * Shard manifest stored in S3 at search-index/shard-manifest.json
 * Contains metadata about all shards for a site
 */
export interface ShardManifest {
    /** Schema version for future compatibility */
    version: 1;
    
    /** Total number of shards */
    shardCount: number;
    
    /** Information about each shard */
    shards: ShardInfo[];
    
    /** ISO 8601 timestamp when the manifest was created */
    createdAt: string;
    
    /** Total number of episodes across all shards */
    totalEpisodes: number;
    
    /** Site ID this manifest belongs to */
    siteId?: string;
}

/**
 * Extended search response when sharding is enabled
 * Includes metadata about which shards were queried
 */
export interface ShardedSearchMetadata {
    /** Whether this response came from sharded search */
    isShardedResponse: boolean;
    
    /** Which shard(s) were queried (for debugging) */
    queriedShards?: number[];
    
    /** If any shards failed, their IDs (for partial results) */
    failedShards?: number[];
    
    /** Whether this is a partial result due to shard failures */
    partial?: boolean;
}
