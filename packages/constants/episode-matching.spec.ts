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

  it('matches a bonus episode later released publicly under another name, by a shared title part', () => {
    const find = createCounterpartMatcher([
      ...publicEpisodes,
      { sequentialId: 6, title: ' Free Dreamland episode: The joy of watching football on holiday', publishedAt: '2026-07-29T06:00:00Z' },
    ]);
    expect(find("Dreamland, Episode 27: Paradise with yesterday's newspaper - the joy of watching football on holiday", new Date('2026-07-19T06:00:00Z')))
      .toMatchObject({ episode: { sequentialId: 6 }, how: 'title-part' });
  });

  it('ignores short shared title parts', () => {
    const find = createCounterpartMatcher([{ sequentialId: 7, title: 'Voices of Football: Peter Drury', publishedAt: '2026-07-29T06:00:00Z' }]);
    expect(find('Dreamland, Episode 28: Voices of Football - John Motson', new Date('2026-07-29T06:00:00Z'))).toBeNull();
  });

  it('tells episodes of a series apart (Double Pivot): part numbers, and series names that start both titles', () => {
    const at = (iso: string) => new Date(iso);
    const find = createCounterpartMatcher([
      { sequentialId: 10, title: 'Champions League Round of 16 First Leg, Part I', publishedAt: '2024-02-20T12:00:00Z' },
      { sequentialId: 11, title: 'World Cup Semifinals Preview: France-Spain', publishedAt: '2022-12-12T12:00:00Z' },
      { sequentialId: 12, title: 'Squad Player or Star Player?', publishedAt: '2025-03-01T12:00:00Z' },
      { sequentialId: 13, title: 'Round of 16 Preview, Part 3: Spain-Portugal and USA-Belgium', publishedAt: '2018-06-29T12:00:00Z' },
      { sequentialId: 14, title: 'Double Pivot Mousa Mania 2026 (Teaser)', publishedAt: '2026-03-01T12:00:00Z' },
    ]);
    expect(find('Champions League Round of 16 First Leg, Part II', at('2024-02-20T13:00:00Z'))).toBeNull();
    expect(find('World Cup Semifinals Preview: England-Argentina', at('2022-12-13T12:00:00Z'))).toBeNull();
    expect(find('Squad Player or Star Player II: The Wingering', at('2025-03-02T12:00:00Z'))).toBeNull();
    expect(find('Round of 16 Preview: Part 4, Argentina-Egypt and Colombia-Switzerland', at('2018-07-01T12:00:00Z'))).toBeNull();
    // A year isn't an episode number
    expect(find('Double Pivot Mousa Mania: Teaser', at('2026-03-01T12:20:00Z'))).toMatchObject({ episode: { sequentialId: 14 }, how: 'similar-title' });
  });

  it("never treats a public teaser as the full subscriber episode", () => {
    const find = createCounterpartMatcher([
      { sequentialId: 20, title: 'Premier League Preview Part 2 (Teaser)', publishedAt: '2025-08-10T12:00:00Z' },
      { sequentialId: 21, title: 'Teaser: Exciting CL clashes to chase away those dreadful Europa ones', publishedAt: '2025-03-01T12:00:00Z' },
      { sequentialId: 22, title: 'Double Pivot Mousa Mania 2026 (Teaser)', publishedAt: '2026-03-01T12:00:00Z' },
    ]);
    expect(find('Premier League Preview, Part 2', new Date('2025-08-10T14:00:00Z'))).toBeNull();
    expect(find('Exciting CL clashes to chase away those dreadful Europa ones', new Date('2025-03-01T18:00:00Z'))).toBeNull();
    // Both teasers: the same episode
    expect(find('Double Pivot Mousa Mania: Teaser', new Date('2026-03-01T12:20:00Z'))).toMatchObject({ episode: { sequentialId: 22 } });
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
