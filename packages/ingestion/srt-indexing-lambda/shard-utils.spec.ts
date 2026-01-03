import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getShardCount,
  isShardedMode,
  calculateShardRanges,
  getShardForEpisode,
  groupEntriesByShard,
  generateShardManifest
} from './shard-utils.js';
import type { SearchEntry } from '@browse-dot-show/types';

describe('Shard Utilities', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SHARD_COUNT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getShardCount', () => {
    it('returns 1 when SHARD_COUNT is not set', () => {
      expect(getShardCount()).toBe(1);
    });

    it('returns parsed shard count when set', () => {
      process.env.SHARD_COUNT = '3';
      expect(getShardCount()).toBe(3);
    });

    it('returns 1 for invalid SHARD_COUNT', () => {
      process.env.SHARD_COUNT = '0';
      expect(getShardCount()).toBe(1);

      process.env.SHARD_COUNT = '-1';
      expect(getShardCount()).toBe(1);

      process.env.SHARD_COUNT = 'abc';
      expect(getShardCount()).toBe(1);
    });
  });

  describe('isShardedMode', () => {
    it('returns false when SHARD_COUNT is not set', () => {
      expect(isShardedMode()).toBe(false);
    });

    it('returns false when SHARD_COUNT is 1', () => {
      process.env.SHARD_COUNT = '1';
      expect(isShardedMode()).toBe(false);
    });

    it('returns true when SHARD_COUNT > 1', () => {
      process.env.SHARD_COUNT = '2';
      expect(isShardedMode()).toBe(true);

      process.env.SHARD_COUNT = '5';
      expect(isShardedMode()).toBe(true);
    });
  });

  describe('calculateShardRanges', () => {
    it('returns single range for 1 shard', () => {
      const ranges = calculateShardRanges(100, 1);
      expect(ranges).toEqual([[1, null]]);
    });

    it('distributes episodes evenly across shards', () => {
      // 100 episodes, 3 shards → 34, 34, 32
      const ranges = calculateShardRanges(100, 3);
      expect(ranges).toEqual([
        [1, 34],
        [35, 68],
        [69, null]
      ]);
    });

    it('handles exact division', () => {
      // 90 episodes, 3 shards → 30, 30, 30
      const ranges = calculateShardRanges(90, 3);
      expect(ranges).toEqual([
        [1, 30],
        [31, 60],
        [61, null]
      ]);
    });

    it('handles small episode counts', () => {
      // 5 episodes, 3 shards → 2, 2, 1
      const ranges = calculateShardRanges(5, 3);
      expect(ranges).toEqual([
        [1, 2],
        [3, 4],
        [5, null]
      ]);
    });

    it('handles more shards than episodes', () => {
      // 3 episodes, 5 shards → 1, 1, 1, 0, 0
      const ranges = calculateShardRanges(3, 5);
      expect(ranges).toEqual([
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, null]
      ]);
    });

    it('handles large episode counts', () => {
      // 800 episodes, 3 shards → 267, 267, 266
      const ranges = calculateShardRanges(800, 3);
      expect(ranges).toEqual([
        [1, 267],
        [268, 534],
        [535, null]
      ]);
    });
  });

  describe('getShardForEpisode', () => {
    it('returns correct shard for episode in first shard', () => {
      const ranges = calculateShardRanges(100, 3);
      expect(getShardForEpisode(1, ranges)).toBe(1);
      expect(getShardForEpisode(20, ranges)).toBe(1);
      expect(getShardForEpisode(34, ranges)).toBe(1);
    });

    it('returns correct shard for episode in middle shard', () => {
      const ranges = calculateShardRanges(100, 3);
      expect(getShardForEpisode(35, ranges)).toBe(2);
      expect(getShardForEpisode(50, ranges)).toBe(2);
      expect(getShardForEpisode(68, ranges)).toBe(2);
    });

    it('returns correct shard for episode in last shard', () => {
      const ranges = calculateShardRanges(100, 3);
      expect(getShardForEpisode(69, ranges)).toBe(3);
      expect(getShardForEpisode(85, ranges)).toBe(3);
      expect(getShardForEpisode(100, ranges)).toBe(3);
      expect(getShardForEpisode(999, ranges)).toBe(3); // Last shard has no upper bound
    });

    it('handles single shard', () => {
      const ranges = calculateShardRanges(100, 1);
      expect(getShardForEpisode(1, ranges)).toBe(1);
      expect(getShardForEpisode(50, ranges)).toBe(1);
      expect(getShardForEpisode(100, ranges)).toBe(1);
      expect(getShardForEpisode(999, ranges)).toBe(1);
    });

    it('returns null for episode ID 0 or negative', () => {
      const ranges = calculateShardRanges(100, 3);
      expect(getShardForEpisode(0, ranges)).toBe(null);
      expect(getShardForEpisode(-1, ranges)).toBe(null);
    });
  });

  describe('groupEntriesByShard', () => {
    function createMockEntry(id: string, sequentialId: number): SearchEntry {
      return {
        id,
        text: `Test entry ${id}`,
        sequentialEpisodeIdAsString: sequentialId.toString(),
        startTimeMs: 0,
        endTimeMs: 1000,
        episodePublishedUnixTimestamp: Date.now()
      };
    }

    it('groups entries by shard correctly', () => {
      const entries: SearchEntry[] = [
        createMockEntry('1-1', 1),
        createMockEntry('1-2', 10),
        createMockEntry('2-1', 35),
        createMockEntry('2-2', 50),
        createMockEntry('3-1', 69),
        createMockEntry('3-2', 100)
      ];

      const ranges = calculateShardRanges(100, 3);
      const grouped = groupEntriesByShard(entries, ranges);

      expect(grouped.size).toBe(3);
      expect(grouped.get(1)).toHaveLength(2);
      expect(grouped.get(2)).toHaveLength(2);
      expect(grouped.get(3)).toHaveLength(2);

      expect(grouped.get(1)![0].id).toBe('1-1');
      expect(grouped.get(1)![1].id).toBe('1-2');
      expect(grouped.get(2)![0].id).toBe('2-1');
      expect(grouped.get(2)![1].id).toBe('2-2');
      expect(grouped.get(3)![0].id).toBe('3-1');
      expect(grouped.get(3)![1].id).toBe('3-2');
    });

    it('handles empty entries', () => {
      const ranges = calculateShardRanges(100, 3);
      const grouped = groupEntriesByShard([], ranges);

      expect(grouped.size).toBe(3);
      expect(grouped.get(1)).toHaveLength(0);
      expect(grouped.get(2)).toHaveLength(0);
      expect(grouped.get(3)).toHaveLength(0);
    });

    it('handles single shard', () => {
      const entries: SearchEntry[] = [
        createMockEntry('1', 1),
        createMockEntry('2', 50),
        createMockEntry('3', 100)
      ];

      const ranges = calculateShardRanges(100, 1);
      const grouped = groupEntriesByShard(entries, ranges);

      expect(grouped.size).toBe(1);
      expect(grouped.get(1)).toHaveLength(3);
    });

    it('handles uneven distribution', () => {
      const entries: SearchEntry[] = [
        createMockEntry('1-1', 1),
        createMockEntry('1-2', 2),
        createMockEntry('1-3', 3),
        createMockEntry('3-1', 69),
        createMockEntry('3-2', 70)
      ];

      const ranges = calculateShardRanges(100, 3);
      const grouped = groupEntriesByShard(entries, ranges);

      expect(grouped.get(1)).toHaveLength(3);
      expect(grouped.get(2)).toHaveLength(0); // No entries in middle shard
      expect(grouped.get(3)).toHaveLength(2);
    });
  });

  describe('generateShardManifest', () => {
    beforeEach(() => {
      process.env.SITE_ID = 'test-site';
      process.env.FILE_STORAGE_ENV = 'prod-s3';
    });

    it('generates manifest for multiple shards', () => {
      const ranges = calculateShardRanges(100, 3);
      const manifest = generateShardManifest(3, ranges, 100, 'test-site');

      expect(manifest.version).toBe(1);
      expect(manifest.shardCount).toBe(3);
      expect(manifest.totalEpisodes).toBe(100);
      expect(manifest.siteId).toBe('test-site');
      expect(manifest.shards).toHaveLength(3);

      // Check shard 1
      expect(manifest.shards[0].id).toBe(1);
      expect(manifest.shards[0].episodeRange).toEqual([1, 34]);
      expect(manifest.shards[0].episodeCount).toBe(34);
      expect(manifest.shards[0].indexPath).toBe('search-index/shard-1/orama_index.msp');

      // Check shard 2
      expect(manifest.shards[1].id).toBe(2);
      expect(manifest.shards[1].episodeRange).toEqual([35, 68]);
      expect(manifest.shards[1].episodeCount).toBe(34);
      expect(manifest.shards[1].indexPath).toBe('search-index/shard-2/orama_index.msp');

      // Check shard 3 (last shard with null end)
      expect(manifest.shards[2].id).toBe(3);
      expect(manifest.shards[2].episodeRange).toEqual([69, null]);
      expect(manifest.shards[2].episodeCount).toBe(32);
      expect(manifest.shards[2].indexPath).toBe('search-index/shard-3/orama_index.msp');
    });

    it('generates manifest for single shard', () => {
      const ranges = calculateShardRanges(100, 1);
      const manifest = generateShardManifest(1, ranges, 100, 'test-site');

      expect(manifest.shardCount).toBe(1);
      expect(manifest.shards).toHaveLength(1);
      expect(manifest.shards[0].episodeRange).toEqual([1, null]);
      expect(manifest.shards[0].episodeCount).toBe(100);
    });

    it('includes createdAt timestamp', () => {
      const ranges = calculateShardRanges(100, 3);
      const manifest = generateShardManifest(3, ranges, 100, 'test-site');

      expect(manifest.createdAt).toBeDefined();
      expect(new Date(manifest.createdAt).getTime()).toBeGreaterThan(0);
    });
  });
});
