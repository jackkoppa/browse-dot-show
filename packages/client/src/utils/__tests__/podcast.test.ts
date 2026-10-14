import { describe, expect, it } from 'vitest';
import { multiFeedPodcastTitle } from '../podcast';

const link = (title: string) => ({ title, url: 'https://example.com', status: 'active' as const });

describe('multiFeedPodcastTitle', () => {
  it('returns the title on a site with several podcasts', () => {
    const links = { a: link('Podcast A'), b: link('Podcast B') };
    expect(multiFeedPodcastTitle('b', links)).toBe('Podcast B');
  });

  it('returns nothing on a single-podcast site', () => {
    expect(multiFeedPodcastTitle('a', { a: link('Podcast A') })).toBeUndefined();
  });

  it('returns nothing for an unknown podcast', () => {
    expect(multiFeedPodcastTitle('c', { a: link('Podcast A'), b: link('Podcast B') })).toBeUndefined();
  });
});
