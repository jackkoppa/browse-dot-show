import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applySpellingCorrections, applyCorrectionToFile } from './apply-spelling-corrections.js';
import fs from 'fs-extra';

// Mock fs-extra
vi.mock('fs-extra');

// Mock site-specific and custom config files
const mockListenFairPlayConfig = {
  correctionsToApply: [
    {
      misspellings: ["Charlie Eccleshead", "charlie eccleshead", "Charlie Eccleshire"],
      correctedSpelling: "Charlie Eccleshare"
    },
    {
      misspellings: ["Adam Hurry"],
      correctedSpelling: "Adam Hurrey"
    },
    {
      misspellings: ["keys and gray", "keys and grey"],
      correctedSpelling: "Keys and Gray"
    }
  ]
};

const mockNaddpodConfig = {
  correctionsToApply: [
    {
      misspellings: ["turdice"],
      correctedSpelling: "turdis"
    }
  ]
};

const mockCustomConfig = {
  correctionsToApply: [
    {
      misspellings: ["Jack Copper"],
      correctedSpelling: "Jack Koppa"
    }
  ]
};

describe('applySpellingCorrections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock fs operations with site-specific behavior
    (fs.pathExists as any).mockImplementation((path: string) => {
      if (path.includes('listenfairplay/spelling-corrections.json')) {
        return Promise.resolve(true);
      }
      if (path.includes('naddpod/spelling-corrections.json')) {
        return Promise.resolve(true);
      }
      if (path.includes('_custom-spelling-corrections.json')) {
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    });
    
    (fs.readFile as any).mockImplementation((path: string, encoding: string) => {
      if (path.includes('listenfairplay/spelling-corrections.json')) {
        return Promise.resolve(JSON.stringify(mockListenFairPlayConfig));
      }
      if (path.includes('naddpod/spelling-corrections.json')) {
        return Promise.resolve(JSON.stringify(mockNaddpodConfig));
      }
      if (path.includes('_custom-spelling-corrections.json')) {
        return Promise.resolve(JSON.stringify(mockCustomConfig));
      }
      return Promise.resolve('{}');
    });
  });

  it('should apply site-specific spelling corrections to SRT content', async () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,000
Hello, I'm Charlie Eccleshead and this is the podcast.

2
00:00:05,000 --> 00:00:10,000
Today we have Adam Hurry joining us to discuss keys and gray.

3
00:00:10,000 --> 00:00:15,000
Welcome to the show Charlie Eccleshead!`;

    const result = await applySpellingCorrections(srtContent, 'listenfairplay');

    expect(result.totalCorrections).toBe(4);
    expect(result.correctionResults).toHaveLength(3);
    
    // Check that corrections were applied
    expect(result.correctedContent).toContain('Charlie Eccleshare');
    expect(result.correctedContent).toContain('Adam Hurrey');
    expect(result.correctedContent).toContain('Keys and Gray');
    expect(result.correctedContent).not.toContain('Charlie Eccleshead');
    expect(result.correctedContent).not.toContain('Adam Hurry');
    expect(result.correctedContent).not.toContain('keys and gray');

    // Check correction results
    const charlieCorrection = result.correctionResults.find(r => r.correctedSpelling === 'Charlie Eccleshare');
    expect(charlieCorrection?.correctionsApplied).toBe(2);

    const adamCorrection = result.correctionResults.find(r => r.correctedSpelling === 'Adam Hurrey');
    expect(adamCorrection?.correctionsApplied).toBe(1);

    const keysCorrection = result.correctionResults.find(r => r.correctedSpelling === 'Keys and Gray');
    expect(keysCorrection?.correctionsApplied).toBe(1);
  });

  it('should apply different corrections for different sites', async () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,000
This is about turdice and Charlie Eccleshead.`;

    // Test naddpod site (only has turdice correction)
    const naddpodResult = await applySpellingCorrections(srtContent, 'naddpod');
    expect(naddpodResult.totalCorrections).toBe(1);
    expect(naddpodResult.correctedContent).toContain('turdis');
    expect(naddpodResult.correctedContent).toContain('Charlie Eccleshead'); // Not corrected for naddpod

    // Test listenfairplay site (only has Charlie correction)
    const lfpResult = await applySpellingCorrections(srtContent, 'listenfairplay');
    expect(lfpResult.totalCorrections).toBe(1);
    expect(lfpResult.correctedContent).toContain('Charlie Eccleshare');
    expect(lfpResult.correctedContent).toContain('turdice'); // Not corrected for listenfairplay
  });

  it('should include custom corrections for all sites', async () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,000
Hello Jack Copper and Charlie Eccleshead.`;

    const result = await applySpellingCorrections(srtContent, 'listenfairplay');

    expect(result.totalCorrections).toBe(2);
    expect(result.correctedContent).toContain('Jack Koppa'); // From custom corrections
    expect(result.correctedContent).toContain('Charlie Eccleshare'); // From site-specific corrections
  });

  it('should handle case-insensitive matching', async () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,000
This is charlie eccleshead speaking.`;

    const result = await applySpellingCorrections(srtContent, 'listenfairplay');

    expect(result.totalCorrections).toBe(1);
    expect(result.correctedContent).toContain('Charlie Eccleshare');
    expect(result.correctedContent).not.toContain('charlie eccleshead');
  });

  it('should only match whole words', async () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,000
This is not Charlie Ecclesheading but Charlie Eccleshead is here.`;

    const result = await applySpellingCorrections(srtContent, 'listenfairplay');

    // Should only correct the whole word, not the partial match
    expect(result.totalCorrections).toBe(1);
    expect(result.correctedContent).toContain('Charlie Ecclesheading'); // Unchanged
    expect(result.correctedContent).toContain('Charlie Eccleshare is here');
  });

  it('should return unchanged content when no corrections are needed', async () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,000
Hello, this is Charlie Eccleshare speaking.`;

    const result = await applySpellingCorrections(srtContent, 'listenfairplay');

    expect(result.totalCorrections).toBe(0);
    expect(result.correctionResults).toHaveLength(0);
    expect(result.correctedContent).toBe(srtContent);
  });

  it('should handle empty or whitespace content', async () => {
    const result1 = await applySpellingCorrections('', 'listenfairplay');
    const result2 = await applySpellingCorrections('   \n   ', 'listenfairplay');

    expect(result1.totalCorrections).toBe(0);
    expect(result1.correctedContent).toBe('');

    expect(result2.totalCorrections).toBe(0);
    expect(result2.correctedContent).toBe('   \n   ');
  });

  it('should handle sites without spelling corrections files', async () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,000
Hello Charlie Eccleshead and Jack Copper.`;

    // Mock a site that doesn't have a spelling corrections file
    (fs.pathExists as any).mockImplementation((path: string) => {
      if (path.includes('unknownsite/spelling-corrections.json')) {
        return Promise.resolve(false);
      }
      if (path.includes('_custom-spelling-corrections.json')) {
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    });

    const result = await applySpellingCorrections(srtContent, 'unknownsite');

    // Should only apply custom corrections
    expect(result.totalCorrections).toBe(1);
    expect(result.correctedContent).toContain('Jack Koppa'); // From custom corrections
    expect(result.correctedContent).toContain('Charlie Eccleshead'); // Not corrected - no site-specific file
  });
});

describe('applyCorrectionToFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock fs operations
    (fs.pathExists as any).mockImplementation((path: string) => {
      if (path.includes('listenfairplay/spelling-corrections.json')) {
        return Promise.resolve(true);
      }
      if (path.includes('_custom-spelling-corrections.json')) {
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    });
    
    (fs.readFile as any).mockImplementation((path: string, encoding: string) => {
      if (path.includes('listenfairplay/spelling-corrections.json')) {
        return Promise.resolve(JSON.stringify(mockListenFairPlayConfig));
      }
      if (path.includes('_custom-spelling-corrections.json')) {
        return Promise.resolve(JSON.stringify(mockCustomConfig));
      }
      return Promise.resolve('{}');
    });
  });

  it('should apply corrections to a file and save when corrections are made', async () => {
    const mockContent = `1
00:00:00,000 --> 00:00:05,000
Hello Charlie Eccleshead!`;

    const mockGetFileContent = vi.fn().mockResolvedValue(mockContent);
    const mockSaveFileContent = vi.fn().mockResolvedValue(undefined);

    const result = await applyCorrectionToFile(
      'test.srt',
      'listenfairplay',
      mockGetFileContent,
      mockSaveFileContent
    );

    expect(result.totalCorrections).toBe(1);
    expect(mockGetFileContent).toHaveBeenCalledWith('test.srt');
    expect(mockSaveFileContent).toHaveBeenCalledWith(
      'test.srt',
      expect.stringContaining('Charlie Eccleshare')
    );
  });

  it('should not save file when no corrections are needed', async () => {
    const mockContent = `1
00:00:00,000 --> 00:00:05,000
Hello Charlie Eccleshare!`;

    const mockGetFileContent = vi.fn().mockResolvedValue(mockContent);
    const mockSaveFileContent = vi.fn().mockResolvedValue(undefined);

    const result = await applyCorrectionToFile(
      'test.srt',
      'listenfairplay',
      mockGetFileContent,
      mockSaveFileContent
    );

    expect(result.totalCorrections).toBe(0);
    expect(mockGetFileContent).toHaveBeenCalledWith('test.srt');
    expect(mockSaveFileContent).not.toHaveBeenCalled();
  });
}); 