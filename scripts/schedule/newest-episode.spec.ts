import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { findNewestEpisodeSearch, newestEpisodeSearchUrl, pickSearchPhrase } from './newest-episode.js';

describe('pickSearchPhrase', () => {
  it('takes the first run of four uncommon words, a quarter of the way in', () => {
    const texts = [
      'Welcome back to the show, quantum gravity researchers explain everything.',
      'Some intro text here.',
      'And then we talked about the giant purple octopus festival yesterday.',
      'Later: another curious harbor lighthouse keeper story.',
    ];
    expect(pickSearchPhrase(texts)).toBe('giant purple octopus festival');
  });

  it('wraps around to the start when nothing later qualifies', () => {
    const texts = ['quantum gravity researchers explain stuff.', 'it is what it is', 'yeah you know right'];
    expect(pickSearchPhrase(texts, 0.5)).toBe('quantum gravity researchers explain');
  });

  it('skips words with inner punctuation and falls back to shorter runs', () => {
    expect(pickSearchPhrase(["it's the U.S. lighthouse keepers, and so on"])).toBe('lighthouse keepers');
    expect(pickSearchPhrase(['yeah you know what I mean'])).toBeNull();
  });
});

describe('findNewestEpisodeSearch', () => {
  it('uses the newest episode by publish date that has search entries', () => {
    const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-newest-'));
    const write = (file: string, data: unknown) => {
      fs.mkdirSync(path.dirname(path.join(siteDir, file)), { recursive: true });
      fs.writeFileSync(path.join(siteDir, file), JSON.stringify(data));
    };
    write('episode-manifest/full-episode-manifest.json', {
      episodes: [
        { podcastId: 'pod', title: 'Older', fileKey: 'older', publishedAt: '2026-10-01T00:00:00.000Z' },
        { podcastId: 'pod', title: 'Newest, not transcribed', fileKey: 'pending', publishedAt: '2026-10-12T00:00:00.000Z' },
        { podcastId: 'pod', title: 'Newer', fileKey: 'newer', publishedAt: '2026-10-10T00:00:00.000Z' },
      ],
    });
    write('search-entries/pod/older.json', [{ text: 'ancient mariner rhyme verses' }]);
    write('search-entries/pod/newer.json', [{ text: 'brand fresh episode about velvet thunder cats' }]);

    expect(findNewestEpisodeSearch(siteDir)).toEqual({ title: 'Newer', query: 'velvet thunder cats' });
    fs.rmSync(siteDir, { recursive: true, force: true });
  });
});

describe('newestEpisodeSearchUrl', () => {
  it('opens the search sorted newest first', () => {
    expect(newestEpisodeSearchUrl('a.browse.show', 'velvet thunder')).toBe('https://a.browse.show/?q=velvet+thunder&sort=newest');
  });
});
