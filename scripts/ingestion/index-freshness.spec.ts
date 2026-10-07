import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach } from 'vitest';
import { isSearchIndexStale } from './index-freshness.js';

let siteRoot: string;

function writeFile(relativePath: string, mtimeSeconds: number): void {
  const fullPath = path.join(siteRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, '');
  fs.utimesSync(fullPath, mtimeSeconds, mtimeSeconds);
}

beforeEach(() => {
  siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'index-freshness-'));
});

describe('isSearchIndexStale', () => {
  it('is false with no transcripts, even without an index', () => {
    expect(isSearchIndexStale(siteRoot)).toBe(false);
    writeFile('transcripts/pod/.processing-lock.json', 2000);
    expect(isSearchIndexStale(siteRoot)).toBe(false);
  });

  it('is true with transcripts but no index', () => {
    writeFile('transcripts/pod/ep1.srt', 1000);
    expect(isSearchIndexStale(siteRoot)).toBe(true);
  });

  it('is true when any transcript is newer than the index', () => {
    writeFile('transcripts/pod-a/ep1.srt', 1000);
    writeFile('transcripts/pod-b/ep2.srt', 3000);
    writeFile('search-index/orama_index.msp', 2000);
    expect(isSearchIndexStale(siteRoot)).toBe(true);
  });

  it('is false when the index is newer than every transcript', () => {
    writeFile('transcripts/pod-a/ep1.srt', 1000);
    writeFile('transcripts/pod-b/ep2.srt', 2000);
    writeFile('search-index/orama_index.msp', 3000);
    expect(isSearchIndexStale(siteRoot)).toBe(false);
  });
});
