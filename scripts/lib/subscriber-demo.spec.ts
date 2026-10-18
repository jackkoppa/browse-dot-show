import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { demoSiteRoot, demoTranscript, hasSubscriberDemoData, writeSubscriberDemoData } from './subscriber-demo.js';

describe('subscriber demo data', () => {
  let root: string;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('writes public and subscriber-only episodes, under the given root only', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-demo-'));
    writeSubscriberDemoData('doublepivot', root, { audio: false });
    const siteRoot = demoSiteRoot('doublepivot', root);
    const read = (file: string) => JSON.parse(fs.readFileSync(path.join(siteRoot, file), 'utf-8'));

    const publicEpisodes = read('episode-manifest/full-episode-manifest.json').episodes;
    const subscriberEpisodes = read('subscriber/episode-manifest/full-episode-manifest.json').episodes;
    expect(publicEpisodes).toHaveLength(4);
    expect(subscriberEpisodes.map((episode: { sequentialId: number }) => episode.sequentialId)).toEqual([1, 2]);
    for (const episode of subscriberEpisodes) {
      expect(fs.existsSync(path.join(siteRoot, 'subscriber', 'transcripts', episode.podcastId, `${episode.fileKey}.srt`))).toBe(true);
    }
    // Not indexed yet
    expect(hasSubscriberDemoData('doublepivot', root)).toBe(false);
  });

  it('writes transcripts the indexer can parse, sharing words across scopes', () => {
    const transcript = demoTranscript('pressing', 'subscriber');
    expect(transcript.startsWith('1\n00:00:00,000 --> 00:00:20,000\n')).toBe(true);
    expect(transcript).toContain('pressing');
    expect(transcript).toContain('just for you');
  });
});
