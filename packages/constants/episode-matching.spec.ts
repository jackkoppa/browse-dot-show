import { describe, expect, it } from 'vitest';
import { createCounterpartMatcher, normalizeEpisodeTitle } from './episode-matching.js';

const publicEpisodes = [
  { sequentialId: 1, title: 'The Transfer Window', publishedAt: '2024-01-10T06:00:00Z' },
  { sequentialId: 2, title: 'Clichés of the Year 2023', publishedAt: '2023-12-28T06:00:00Z' },
  { sequentialId: 3, title: 'Mailbag', publishedAt: '2024-02-01T06:00:00Z' },
  { sequentialId: 4, title: 'Mailbag', publishedAt: '2024-03-01T06:00:00Z' },
  { sequentialId: 5, title: 'Set-piece Specialists & Long Throws', publishedAt: '2024-04-04T06:00:00Z' },
];

describe('normalizeEpisodeTitle', () => {
  it('ignores ad-free markers, accents, punctuation and case', () => {
    expect(normalizeEpisodeTitle('Clichés of the Year 2023 (Ad-Free)')).toBe('cliches of the year 2023');
    expect(normalizeEpisodeTitle('[AD FREE] The Transfer Window')).toBe('the transfer window');
    expect(normalizeEpisodeTitle('Ad-free: The Transfer Window')).toBe('the transfer window');
    expect(normalizeEpisodeTitle('The Transfer Window - Ad Free')).toBe('the transfer window');
    expect(normalizeEpisodeTitle('Set-piece Specialists & Long Throws')).toBe('set piece specialists and long throws');
  });

  it('keeps words that only look like markers', () => {
    expect(normalizeEpisodeTitle('Free Kicks (Bonus)')).toBe('free kicks bonus');
  });
});

describe('createCounterpartMatcher', () => {
  it('matches the same title published within a few days', () => {
    const find = createCounterpartMatcher(publicEpisodes);
    expect(find('The Transfer Window (Ad-Free)', new Date('2024-01-09T20:00:00Z'))).toMatchObject({ episode: { sequentialId: 1 }, how: 'title' });
  });

  it('matches an episode subscribers got a week early', () => {
    const find = createCounterpartMatcher(publicEpisodes);
    expect(find('The Transfer Window', new Date('2024-01-03T06:00:00Z'))).toMatchObject({ episode: { sequentialId: 1 }, how: 'title' });
  });

  it('does not match the same title months apart', () => {
    const find = createCounterpartMatcher(publicEpisodes);
    expect(find('The Transfer Window', new Date('2024-06-10T06:00:00Z'))).toBeNull();
  });

  it('tells recurring titles apart by date', () => {
    const find = createCounterpartMatcher(publicEpisodes);
    expect(find('Mailbag', new Date('2024-03-01T05:00:00Z'))?.episode.sequentialId).toBe(4);
    expect(find('Mailbag', new Date('2024-02-02T05:00:00Z'))?.episode.sequentialId).toBe(3);
  });

  it('matches a slightly different title on (nearly) the same day', () => {
    const find = createCounterpartMatcher(publicEpisodes);
    expect(find('Set Piece Specialists and the Long Throws', new Date('2024-04-04T07:00:00Z'))).toMatchObject({ episode: { sequentialId: 5 }, how: 'similar-title' });
    expect(createCounterpartMatcher(publicEpisodes)('Set Piece Specialists and the Long Throws', new Date('2024-04-08T07:00:00Z'))).toBeNull();
  });

  it('leaves subscriber-only episodes unmatched', () => {
    const find = createCounterpartMatcher(publicEpisodes);
    expect(find('Bonus: Ask Us Anything', new Date('2024-01-10T06:00:00Z'))).toBeNull();
  });

  it('matches each public episode at most once', () => {
    const find = createCounterpartMatcher(publicEpisodes);
    expect(find('The Transfer Window', new Date('2024-01-10T06:00:00Z'))).not.toBeNull();
    expect(find('The Transfer Window (Ad-Free)', new Date('2024-01-10T06:00:00Z'))).toBeNull();
  });
});
