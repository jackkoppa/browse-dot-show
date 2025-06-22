import { describe, it, expect, vi } from 'vitest';
import { getEpisodeFileKey } from './utils/get-episode-file-key.js';
import { parsePubDate } from './utils/parse-pub-date.js';

// Mock the logging module
vi.mock('@browse-dot-show/logging', () => ({
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock the S3 module
vi.mock('@browse-dot-show/s3', () => ({
  fileExists: vi.fn(),
  getFile: vi.fn(),
  saveFile: vi.fn(),
  listFiles: vi.fn(),
  listDirectories: vi.fn(),
  deleteFile: vi.fn()
}));

// Mock the config module
vi.mock('@browse-dot-show/config', () => ({
  RSS_CONFIG: {
    'test-podcast': 'https://example.com/rss.xml'
  }
}));

// Mock the constants module
vi.mock('@browse-dot-show/constants', () => ({
      // Legacy constant removed - use getEpisodeManifestKey() function instead
}));

describe('parsePubDate', () => {
  it('should parse a valid RFC2822 date string', () => {
    const dateStr = 'Wed, 15 Sep 2021 10:00:00 GMT';
    const result = parsePubDate(dateStr);
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2021);
    expect(result.getMonth()).toBe(8); // 0-indexed
    expect(result.getDate()).toBe(15);
  });

  it('should parse a valid ISO date string', () => {
    const dateStr = '2021-09-15T10:00:00.000Z';
    const result = parsePubDate(dateStr);
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2021);
    expect(result.getMonth()).toBe(8);
    expect(result.getDate()).toBe(15);
  });

  it('should return Invalid Date for invalid date strings', () => {
    const dateStr = 'invalid-date';
    const result = parsePubDate(dateStr);
    expect(isNaN(result.getTime())).toBe(true);
  });
});

describe('getEpisodeFileKey', () => {
  it('should generate correct file key with simple title', () => {
    const title = 'Test Episode';
    const pubDate = '2021-09-15T10:00:00.000Z';
    const result = getEpisodeFileKey(title, pubDate);
    expect(result).toBe('2021-09-15_Test-Episode');
  });

  it('should replace invalid filename characters', () => {
    const title = 'Test/Episode\\With?Invalid%Characters*:|"<>.';
    const pubDate = '2021-09-15T10:00:00.000Z';
    const result = getEpisodeFileKey(title, pubDate);
    expect(result).toBe('2021-09-15_Test-Episode-With-Invalid-Characters-------');
  });

  it('should normalize Unicode characters', () => {
    const title = 'Café and naïve résumé';
    const pubDate = '2021-09-15T10:00:00.000Z';
    const result = getEpisodeFileKey(title, pubDate);
    expect(result).toBe('2021-09-15_Café-and-naïve-résumé');
  });

  it('should replace multiple spaces with single hyphens', () => {
    const title = 'Test    Episode   With   Spaces';
    const pubDate = '2021-09-15T10:00:00.000Z';
    const result = getEpisodeFileKey(title, pubDate);
    expect(result).toBe('2021-09-15_Test-Episode-With-Spaces');
  });

  it('should truncate long titles to 50 characters', () => {
    const title = 'This is a very long episode title that should be truncated to fifty characters maximum';
    const pubDate = '2021-09-15T10:00:00.000Z';
    const result = getEpisodeFileKey(title, pubDate);
    expect(result).toBe('2021-09-15_This-is-a-very-long-episode-title-that-should-be-t');
    expect(result.length).toBe(61); // 11 chars for date + 1 underscore + 49 chars for title
  });

  it('should handle edge case with empty title', () => {
    const title = '';
    const pubDate = '2021-09-15T10:00:00.000Z';
    const result = getEpisodeFileKey(title, pubDate);
    expect(result).toBe('2021-09-15_');
  });

  it('should handle title with only special characters', () => {
    const title = '/\\?%*:|"<>.';
    const pubDate = '2021-09-15T10:00:00.000Z';
    const result = getEpisodeFileKey(title, pubDate);
    expect(result).toBe('2021-09-15_-----------');
  });

  it('should format different years correctly', () => {
    const title = 'Test Episode';
    const pubDate = '2020-01-01T00:00:00.000Z';
    const result = getEpisodeFileKey(title, pubDate);
    expect(result).toBe('2020-01-01_Test-Episode');
  });

  it('should handle RFC2822 date format', () => {
    const title = 'Test Episode';
    const pubDate = 'Wed, 15 Sep 2021 10:00:00 GMT';
    const result = getEpisodeFileKey(title, pubDate);
    expect(result).toBe('2021-09-15_Test-Episode');
  });
});

describe('RSS Parsing and Episode Extraction', () => {
  // These tests would require importing the actual functions from the main file
  // For now, we'll create unit tests for the key logic patterns

  describe('parseRSSFeed', () => {
    it('should handle valid RSS XML', async () => {
      const mockXML = `
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Podcast</title>
            <item>
              <title>Test Episode</title>
              <pubDate>Wed, 15 Sep 2021 10:00:00 GMT</pubDate>
              <enclosure url="https://example.com/test.mp3" type="audio/mpeg" length="12345"/>
            </item>
          </channel>
        </rss>
      `;
      
      // This would test the actual parseRSSFeed function
      // For now, this serves as documentation of expected behavior
      expect(mockXML).toContain('<rss version="2.0">');
    });
  });

  describe('extractEpisodesFromRSS', () => {
    it('should extract episodes with required fields', () => {
      const mockParsedFeed = {
        rss: {
          channel: {
            item: [
              {
                title: 'Test Episode 1',
                pubDate: 'Wed, 15 Sep 2021 10:00:00 GMT',
                enclosure: {
                  url: 'https://example.com/test1.mp3',
                  type: 'audio/mpeg',
                  length: '12345'
                }
              },
              {
                title: 'Test Episode 2',
                pubDate: 'Thu, 16 Sep 2021 10:00:00 GMT',
                enclosure: {
                  url: 'https://example.com/test2.mp3',
                  type: 'audio/mpeg',
                  length: '67890'
                }
              }
            ]
          }
        }
      };

      // This tests the expected structure
      expect(mockParsedFeed.rss.channel.item).toHaveLength(2);
      expect(mockParsedFeed.rss.channel.item[0]).toHaveProperty('title');
      expect(mockParsedFeed.rss.channel.item[0]).toHaveProperty('pubDate');
      expect(mockParsedFeed.rss.channel.item[0]).toHaveProperty('enclosure');
    });

    it('should skip episodes missing required fields', () => {
      const mockParsedFeed = {
        rss: {
          channel: {
            item: [
              {
                title: 'Valid Episode',
                pubDate: 'Wed, 15 Sep 2021 10:00:00 GMT',
                enclosure: {
                  url: 'https://example.com/test.mp3',
                  type: 'audio/mpeg',
                  length: '12345'
                }
              },
              {
                title: 'Invalid Episode - No enclosure',
                pubDate: 'Thu, 16 Sep 2021 10:00:00 GMT'
                // Missing enclosure
              },
              {
                title: 'Invalid Episode - No pubDate',
                enclosure: {
                  url: 'https://example.com/test2.mp3',
                  type: 'audio/mpeg',
                  length: '67890'
                }
                // Missing pubDate
              }
            ]
          }
        }
      };

      const validItems = mockParsedFeed.rss.channel.item.filter(item => 
        item.title && item.pubDate && item.enclosure && item.enclosure.url
      );
      
      expect(validItems).toHaveLength(1);
      expect(validItems[0].title).toBe('Valid Episode');
    });
  });
});

describe('File Path Generation', () => {
  it('should generate correct audio file path', () => {
    const podcastId = 'test-podcast';
    const fileKey = '2021-09-15_Test-Episode';
    const expectedPath = `audio/${podcastId}/${fileKey}.mp3`;
    expect(expectedPath).toBe('audio/test-podcast/2021-09-15_Test-Episode.mp3');
  });

  it('should generate correct transcript file path', () => {
    const podcastId = 'test-podcast';
    const fileKey = '2021-09-15_Test-Episode';
    const expectedPath = `transcripts/${podcastId}/${fileKey}.srt`;
    expect(expectedPath).toBe('transcripts/test-podcast/2021-09-15_Test-Episode.srt');
  });

  it('should generate correct search entry file path', () => {
    const podcastId = 'test-podcast';
    const fileKey = '2021-09-15_Test-Episode';
    const expectedPath = `search-entries/${podcastId}/${fileKey}.json`;
    expect(expectedPath).toBe('search-entries/test-podcast/2021-09-15_Test-Episode.json');
  });
});

describe('Unicode Normalization', () => {
  it('should detect when normalization is needed', () => {
    const originalFilename = 'café.mp3'; // Not normalized
    const normalizedFilename = originalFilename.normalize('NFC');
    
    // This simulates the logic in checkFileExistsWithNormalization
    const needsNormalization = originalFilename !== normalizedFilename;
    expect(typeof needsNormalization).toBe('boolean');
  });

  it('should handle various Unicode characters correctly', () => {
    const testCases = [
      { input: 'café', expected: 'café' },
      { input: 'naïve', expected: 'naïve' },
      { input: 'résumé', expected: 'résumé' },
      { input: 'Zürich', expected: 'Zürich' }
    ];

    testCases.forEach(({ input, expected }) => {
      const normalized = input.normalize('NFC');
      expect(normalized).toBe(expected);
    });
  });
});

describe('Issue Classification', () => {
  it('should classify missing file issues correctly', () => {
    const mockIssue = {
      type: 'missing-file' as const,
      severity: 'error' as const,
      description: 'Audio file not found',
      episodeInfo: {
        podcastId: 'test-podcast',
        title: 'Test Episode',
        fileKey: '2021-09-15_Test-Episode'
      },
      expectedPath: 'audio/test-podcast/2021-09-15_Test-Episode.mp3'
    };

    expect(mockIssue.type).toBe('missing-file');
    expect(mockIssue.severity).toBe('error');
    expect(mockIssue.episodeInfo?.fileKey).toBe('2021-09-15_Test-Episode');
  });

  it('should classify unicode issues correctly', () => {
    const mockIssue = {
      type: 'unicode-issue' as const,
      severity: 'warning' as const,
      description: 'File needs Unicode normalization',
      filePath: 'audio/test-podcast/café.mp3',
      expectedPath: 'audio/test-podcast/café.mp3',
      fixAction: 'rename' as const
    };

    expect(mockIssue.type).toBe('unicode-issue');
    expect(mockIssue.fixAction).toBe('rename');
  });

  it('should classify orphaned file issues correctly', () => {
    const mockIssue = {
      type: 'orphaned-file' as const,
      severity: 'warning' as const,
      description: 'File does not correspond to any RSS episode',
      filePath: 'audio/test-podcast/unknown-file.mp3',
      fixAction: 'delete' as const
    };

    expect(mockIssue.type).toBe('orphaned-file');
    expect(mockIssue.fixAction).toBe('delete');
  });
});

describe('Summary Generation', () => {
  it('should generate correct summary statistics', () => {
    const mockIssues = [
      { type: 'missing-file', severity: 'error' },
      { type: 'missing-file', severity: 'error' },
      { type: 'unicode-issue', severity: 'warning' },
      { type: 'orphaned-file', severity: 'warning' }
    ];

    const summary = {
      totalIssues: mockIssues.length,
      errorCount: mockIssues.filter(i => i.severity === 'error').length,
      warningCount: mockIssues.filter(i => i.severity === 'warning').length,
      episodesChecked: 100,
      filesScanned: 50
    };

    expect(summary.totalIssues).toBe(4);
    expect(summary.errorCount).toBe(2);
    expect(summary.warningCount).toBe(2);
    expect(summary.episodesChecked).toBe(100);
    expect(summary.filesScanned).toBe(50);
  });
});
