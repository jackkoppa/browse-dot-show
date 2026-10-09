import { describe, expect, it } from 'vitest';
import { formatEpisodeId, parseEpisodeId } from './episode-id.js';

describe('episode IDs', () => {
  it('formats public and subscriber IDs', () => {
    expect(formatEpisodeId(123)).toBe('123');
    expect(formatEpisodeId(12, 'subscriber')).toBe('s12');
  });

  it('parses what it formats', () => {
    expect(parseEpisodeId('123')).toEqual({ scope: 'public', sequentialId: 123 });
    expect(parseEpisodeId('s12')).toEqual({ scope: 'subscriber', sequentialId: 12 });
  });

  it('rejects anything else', () => {
    for (const id of ['', 's', '0', '012', 'x12', '12s', 'S12', '1.5', ' 12']) {
      expect(parseEpisodeId(id)).toBeNull();
    }
  });
});
