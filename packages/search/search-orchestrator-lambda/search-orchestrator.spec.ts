import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SearchResponse, ApiSearchResultHit } from '@browse-dot-show/types';

/**
 * Test utilities for score normalization and result merging
 * These are extracted from the main module for testing
 */

/**
 * Normalize scores within a result set to 0-1 scale
 */
function normalizeScores(hits: ApiSearchResultHit[]): Array<ApiSearchResultHit & { normalizedScore: number }> {
  if (hits.length === 0) {
    return [];
  }

  return hits.map((hit, index) => ({
    ...hit,
    normalizedScore: hits.length === 1 ? 1.0 : 1.0 - (index / (hits.length - 1))
  }));
}

/**
 * Merge and sort results from multiple shards
 */
function mergeShardResults(
  shardResults: Array<{ shardId: number; response: SearchResponse }>,
  limit: number,
  offset: number
): ApiSearchResultHit[] {
  const normalizedResults = shardResults.flatMap(({ response }) => {
    return normalizeScores(response.hits);
  });

  normalizedResults.sort((a, b) => b.normalizedScore - a.normalizedScore);
  
  const paginatedResults = normalizedResults.slice(offset, offset + limit);
  
  return paginatedResults.map(({ normalizedScore, ...hit }) => hit);
}

/**
 * Calculate total hits across all shards
 */
function calculateTotalHits(shardResults: Array<{ shardId: number; response: SearchResponse }>): number {
  return shardResults.reduce((total, { response }) => total + response.totalHits, 0);
}

/**
 * Calculate proportional offsets for distributed pagination
 */
function calculateProportionalOffsets(
  shardResults: Array<{ shardId: number; response: SearchResponse }>,
  offset: number,
  limit: number
): Map<number, { offset: number; limit: number }> {
  const totalHits = calculateTotalHits(shardResults);
  const offsetMap = new Map<number, { offset: number; limit: number }>();
  
  if (totalHits === 0) {
    return offsetMap;
  }

  for (const { shardId, response } of shardResults) {
    const shardRatio = response.totalHits / totalHits;
    const shardOffset = Math.floor(offset * shardRatio);
    const shardLimit = Math.ceil(limit * 2 * shardRatio);
    
    offsetMap.set(shardId, { offset: shardOffset, limit: shardLimit });
  }

  return offsetMap;
}

/**
 * Helper to create mock search hits
 */
function createMockHit(id: string, episodeId: string = '1'): ApiSearchResultHit {
  return {
    id,
    text: `Test result ${id}`,
    sequentialEpisodeIdAsString: episodeId,
    startTimeMs: 0,
    endTimeMs: 1000,
    episodePublishedUnixTimestamp: Date.now()
  };
}

/**
 * Helper to create mock search response
 */
function createMockResponse(hitCount: number, totalHits: number, startId: number = 1): SearchResponse {
  const hits: ApiSearchResultHit[] = [];
  for (let i = 0; i < hitCount; i++) {
    hits.push(createMockHit(`hit-${startId + i}`));
  }

  return {
    hits,
    totalHits,
    processingTimeMs: 100,
    query: 'test',
    sortBy: undefined,
    sortOrder: 'DESC'
  };
}

describe('Score Normalization', () => {
  it('normalizes single result to score 1.0', () => {
    const hits = [createMockHit('1')];
    const normalized = normalizeScores(hits);
    
    expect(normalized).toHaveLength(1);
    expect(normalized[0].normalizedScore).toBe(1.0);
  });

  it('normalizes two results to 1.0 and 0.0', () => {
    const hits = [createMockHit('1'), createMockHit('2')];
    const normalized = normalizeScores(hits);
    
    expect(normalized).toHaveLength(2);
    expect(normalized[0].normalizedScore).toBe(1.0);
    expect(normalized[1].normalizedScore).toBe(0.0);
  });

  it('normalizes multiple results with linear interpolation', () => {
    const hits = [
      createMockHit('1'),
      createMockHit('2'),
      createMockHit('3'),
      createMockHit('4'),
      createMockHit('5')
    ];
    const normalized = normalizeScores(hits);
    
    expect(normalized).toHaveLength(5);
    expect(normalized[0].normalizedScore).toBe(1.0);
    expect(normalized[1].normalizedScore).toBe(0.75);
    expect(normalized[2].normalizedScore).toBe(0.5);
    expect(normalized[3].normalizedScore).toBe(0.25);
    expect(normalized[4].normalizedScore).toBe(0.0);
  });

  it('handles empty array', () => {
    const normalized = normalizeScores([]);
    expect(normalized).toHaveLength(0);
  });
});

describe('Result Merging', () => {
  it('merges results from multiple shards', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(3, 3, 1) // hits 1, 2, 3
      },
      {
        shardId: 2,
        response: createMockResponse(2, 2, 4) // hits 4, 5
      }
    ];

    const merged = mergeShardResults(shardResults, 10, 0);
    
    expect(merged).toHaveLength(5);
    // Results should be interleaved based on normalized scores
    // Shard 1: [1.0, 0.5, 0.0]
    // Shard 2: [1.0, 0.0]
    // Merged sorted: [1.0, 1.0, 0.5, 0.0, 0.0]
    expect(merged[0].id).toMatch(/hit-(1|4)/); // Either top result from shard 1 or 2
    expect(merged[1].id).toMatch(/hit-(1|4)/); // The other top result
  });

  it('applies pagination correctly', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(5, 5, 1)
      },
      {
        shardId: 2,
        response: createMockResponse(5, 5, 6)
      }
    ];

    // Get second page (offset=5, limit=3)
    const merged = mergeShardResults(shardResults, 3, 5);
    
    expect(merged).toHaveLength(3);
  });

  it('handles limit larger than available results', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(2, 2, 1)
      }
    ];

    const merged = mergeShardResults(shardResults, 10, 0);
    
    expect(merged).toHaveLength(2);
  });

  it('handles offset beyond available results', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(5, 5, 1)
      }
    ];

    const merged = mergeShardResults(shardResults, 10, 10);
    
    expect(merged).toHaveLength(0);
  });

  it('handles empty shard results', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(0, 0)
      },
      {
        shardId: 2,
        response: createMockResponse(0, 0)
      }
    ];

    const merged = mergeShardResults(shardResults, 10, 0);
    
    expect(merged).toHaveLength(0);
  });
});

describe('Total Hits Calculation', () => {
  it('sums total hits from all shards', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(5, 150)
      },
      {
        shardId: 2,
        response: createMockResponse(5, 100)
      },
      {
        shardId: 3,
        response: createMockResponse(5, 50)
      }
    ];

    const total = calculateTotalHits(shardResults);
    
    expect(total).toBe(300);
  });

  it('handles empty shard results', () => {
    const total = calculateTotalHits([]);
    expect(total).toBe(0);
  });

  it('handles shards with zero hits', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(0, 0)
      },
      {
        shardId: 2,
        response: createMockResponse(5, 100)
      }
    ];

    const total = calculateTotalHits(shardResults);
    
    expect(total).toBe(100);
  });
});

describe('Proportional Pagination', () => {
  it('calculates proportional offsets correctly', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(5, 150) // 50% of results
      },
      {
        shardId: 2,
        response: createMockResponse(5, 100) // 33.3% of results
      },
      {
        shardId: 3,
        response: createMockResponse(5, 50)  // 16.7% of results
      }
    ];

    const offsetMap = calculateProportionalOffsets(shardResults, 60, 10);
    
    // Total: 300 hits
    // Offset: 60
    // Limit: 10
    
    // Shard 1: 50% → offset=30, limit=10
    expect(offsetMap.get(1)).toEqual({ offset: 30, limit: 10 });
    
    // Shard 2: 33.3% → offset=20, limit=7
    expect(offsetMap.get(2)).toEqual({ offset: 20, limit: 7 });
    
    // Shard 3: 16.7% → offset=10, limit=4
    expect(offsetMap.get(3)).toEqual({ offset: 10, limit: 4 });
  });

  it('handles first page (offset=0)', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(5, 100)
      },
      {
        shardId: 2,
        response: createMockResponse(5, 100)
      }
    ];

    const offsetMap = calculateProportionalOffsets(shardResults, 0, 10);
    
    // Both shards have 50% of results
    expect(offsetMap.get(1)).toEqual({ offset: 0, limit: 10 });
    expect(offsetMap.get(2)).toEqual({ offset: 0, limit: 10 });
  });

  it('handles uneven result distribution', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(5, 10)  // 10% of results
      },
      {
        shardId: 2,
        response: createMockResponse(5, 90)  // 90% of results
      }
    ];

    const offsetMap = calculateProportionalOffsets(shardResults, 50, 10);
    
    // Total: 100 hits
    // Shard 1: 10% → offset=5, limit=2
    expect(offsetMap.get(1)).toEqual({ offset: 5, limit: 2 });
    
    // Shard 2: 90% → offset=45, limit=18
    expect(offsetMap.get(2)).toEqual({ offset: 45, limit: 18 });
  });

  it('handles zero total hits', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(0, 0)
      },
      {
        shardId: 2,
        response: createMockResponse(0, 0)
      }
    ];

    const offsetMap = calculateProportionalOffsets(shardResults, 10, 10);
    
    expect(offsetMap.size).toBe(0);
  });

  it('handles single shard with all results', () => {
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(5, 100)
      }
    ];

    const offsetMap = calculateProportionalOffsets(shardResults, 20, 10);
    
    // Single shard gets 100% of offset and limit
    expect(offsetMap.get(1)).toEqual({ offset: 20, limit: 20 });
  });
});

describe('Integration: Full Pagination Flow', () => {
  it('simulates multi-page search across shards', () => {
    // Simulate 3 shards with different result counts
    const shardResults = [
      {
        shardId: 1,
        response: createMockResponse(10, 150, 1)
      },
      {
        shardId: 2,
        response: createMockResponse(10, 100, 11)
      },
      {
        shardId: 3,
        response: createMockResponse(10, 50, 21)
      }
    ];

    // Page 1: offset=0, limit=10
    const page1 = mergeShardResults(shardResults, 10, 0);
    expect(page1).toHaveLength(10);

    // Page 2: offset=10, limit=10
    const page2 = mergeShardResults(shardResults, 10, 10);
    expect(page2).toHaveLength(10);

    // Page 3: offset=20, limit=10
    const page3 = mergeShardResults(shardResults, 10, 20);
    expect(page3).toHaveLength(10);

    // Verify no duplicate IDs across pages
    const allIds = [...page1, ...page2, ...page3].map(h => h.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(30); // All unique
  });
});
