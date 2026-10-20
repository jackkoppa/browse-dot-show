import { describe, expect, it } from 'vitest';
import { multiFeedPodcast } from '../podcast';

const link = (title: string, coverImageUrl?: string) => ({ title, url: 'https://example.com', status: 'active' as const, coverImageUrl });

describe('multiFeedPodcast', () => {
  it('returns the title and cover on a site with several podcasts', () => {
    const links = { a: link('Podcast A', '/assets/podcast-covers/a.webp'), b: link('Podcast B', '/assets/podcast-covers/b.webp') };
    expect(multiFeedPodcast('b', links)).toEqual({ title: 'Podcast B', coverImageUrl: '/assets/podcast-covers/b.webp' });
  });

  it('returns nothing on a single-podcast site', () => {
    expect(multiFeedPodcast('a', { a: link('Podcast A', '/assets/podcast-covers/a.webp') })).toBeUndefined();
  });

  it('returns nothing for an unknown podcast', () => {
    expect(multiFeedPodcast('c', { a: link('Podcast A'), b: link('Podcast B') })).toBeUndefined();
  });
});
