import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getShardId,
  getShardCount,
  isShardedMode,
  getSearchIndexKey,
  getShardedSearchIndexKey,
  getLocalDbPath,
  getShardedLocalDbPath,
  getShardManifestKey,
} from './site-constants.js';

describe('Sharding functions', () => {
  // Store original env values to restore after tests
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env vars before each test
    delete process.env.SHARD_ID;
    delete process.env.SHARD_COUNT;
    process.env.SITE_ID = 'test-site';
    process.env.FILE_STORAGE_ENV = 'prod-s3'; // Non-local environment
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('getShardId', () => {
    it('returns undefined when SHARD_ID is not set', () => {
      expect(getShardId()).toBeUndefined();
    });

    it('returns parsed shard ID when set', () => {
      process.env.SHARD_ID = '1';
      expect(getShardId()).toBe(1);

      process.env.SHARD_ID = '3';
      expect(getShardId()).toBe(3);
    });

    it('throws error for invalid SHARD_ID', () => {
      process.env.SHARD_ID = '0';
      expect(() => getShardId()).toThrow('Invalid SHARD_ID');

      process.env.SHARD_ID = '-1';
      expect(() => getShardId()).toThrow('Invalid SHARD_ID');

      process.env.SHARD_ID = 'abc';
      expect(() => getShardId()).toThrow('Invalid SHARD_ID');
    });
  });

  describe('getShardCount', () => {
    it('returns undefined when SHARD_COUNT is not set', () => {
      expect(getShardCount()).toBeUndefined();
    });

    it('returns parsed shard count when set', () => {
      process.env.SHARD_COUNT = '2';
      expect(getShardCount()).toBe(2);

      process.env.SHARD_COUNT = '5';
      expect(getShardCount()).toBe(5);
    });

    it('throws error for invalid SHARD_COUNT', () => {
      process.env.SHARD_COUNT = '0';
      expect(() => getShardCount()).toThrow('Invalid SHARD_COUNT');

      process.env.SHARD_COUNT = '-1';
      expect(() => getShardCount()).toThrow('Invalid SHARD_COUNT');
    });
  });

  describe('isShardedMode', () => {
    it('returns false when SHARD_ID is not set', () => {
      expect(isShardedMode()).toBe(false);
    });

    it('returns true when SHARD_ID is set', () => {
      process.env.SHARD_ID = '1';
      expect(isShardedMode()).toBe(true);
    });
  });

  describe('getSearchIndexKey', () => {
    describe('non-sharded mode (backward compatible)', () => {
      it('returns non-sharded path in AWS environment', () => {
        expect(getSearchIndexKey()).toBe('search-index/orama_index.msp');
      });

      it('returns non-sharded path with site prefix in local environment', () => {
        process.env.FILE_STORAGE_ENV = 'local';
        expect(getSearchIndexKey()).toBe('sites/test-site/search-index/orama_index.msp');
      });
    });

    describe('sharded mode', () => {
      it('returns sharded path in AWS environment when SHARD_ID is set', () => {
        process.env.SHARD_ID = '2';
        expect(getSearchIndexKey()).toBe('search-index/shard-2/orama_index.msp');
      });

      it('returns sharded path with site prefix in local environment when SHARD_ID is set', () => {
        process.env.FILE_STORAGE_ENV = 'local';
        process.env.SHARD_ID = '3';
        expect(getSearchIndexKey()).toBe('sites/test-site/search-index/shard-3/orama_index.msp');
      });
    });
  });

  describe('getShardedSearchIndexKey', () => {
    it('returns sharded path for given shard ID in AWS environment', () => {
      expect(getShardedSearchIndexKey(1)).toBe('search-index/shard-1/orama_index.msp');
      expect(getShardedSearchIndexKey(5)).toBe('search-index/shard-5/orama_index.msp');
    });

    it('returns sharded path with site prefix in local environment', () => {
      process.env.FILE_STORAGE_ENV = 'local';
      expect(getShardedSearchIndexKey(1)).toBe('sites/test-site/search-index/shard-1/orama_index.msp');
    });

    it('throws error for invalid shard ID', () => {
      expect(() => getShardedSearchIndexKey(0)).toThrow('Invalid shardId');
      expect(() => getShardedSearchIndexKey(-1)).toThrow('Invalid shardId');
    });
  });

  describe('getLocalDbPath', () => {
    describe('non-sharded mode (backward compatible)', () => {
      it('returns non-sharded path', () => {
        expect(getLocalDbPath()).toBe('/tmp/orama_index_test-site.msp');
      });
    });

    describe('sharded mode', () => {
      it('returns sharded path when SHARD_ID is set', () => {
        process.env.SHARD_ID = '2';
        expect(getLocalDbPath()).toBe('/tmp/orama_index_test-site_shard_2.msp');
      });
    });
  });

  describe('getShardedLocalDbPath', () => {
    it('returns sharded path for given shard ID', () => {
      expect(getShardedLocalDbPath(1)).toBe('/tmp/orama_index_test-site_shard_1.msp');
      expect(getShardedLocalDbPath(5)).toBe('/tmp/orama_index_test-site_shard_5.msp');
    });

    it('throws error for invalid shard ID', () => {
      expect(() => getShardedLocalDbPath(0)).toThrow('Invalid shardId');
      expect(() => getShardedLocalDbPath(-1)).toThrow('Invalid shardId');
    });
  });

  describe('getShardManifestKey', () => {
    it('returns manifest key in AWS environment', () => {
      expect(getShardManifestKey()).toBe('search-index/shard-manifest.json');
    });

    it('returns manifest key with site prefix in local environment', () => {
      process.env.FILE_STORAGE_ENV = 'local';
      expect(getShardManifestKey()).toBe('sites/test-site/search-index/shard-manifest.json');
    });
  });
});
