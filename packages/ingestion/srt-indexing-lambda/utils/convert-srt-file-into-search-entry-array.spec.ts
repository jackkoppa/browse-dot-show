import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { convertSrtFileIntoSearchEntryArray } from './convert-srt-file-into-search-entry-array.js';

const testSequentialEpisodeId = 123;
const testEpisodePublishedUnixTimestamp = 1579770000000; // 2020-01-23T10:00:00Z

describe('convertSrtFileIntoSearchEntryArray', () => {
  it('should convert a sample SRT file into an array of search entries based on time/punctuation rules', () => {
    const sampleSrtContent = fs.readFileSync(
      path.join(__dirname, '__fixtures__/1--example-transcription.srt'),
      'utf-8'
    );
    const expectedOutput = require('./__fixtures__/1--expected-search-entry.json');
    const episodeDetails = require('./__fixtures__/1--example-episode-details.json');

    const result = convertSrtFileIntoSearchEntryArray({
      srtFileContent: sampleSrtContent,
      sequentialEpisodeId: episodeDetails.sequentialId,
      episodePublishedUnixTimestamp: new Date(episodeDetails.publishedAt).getTime()
    });
    // Use JSON.stringify for potentially more detailed diffs in some test runners
    // expect(JSON.stringify(result, null, 2)).toEqual(JSON.stringify(expectedOutput, null, 2));
    expect(result).toEqual(expectedOutput);
  });

  it('should correctly process a longer SRT file with multiple segments (Fixture Set 2)', () => {
    const sampleSrtContent = fs.readFileSync(
      path.join(__dirname, '__fixtures__/2--example-transcription.srt'),
      'utf-8'
    );
    const expectedOutput = require('./__fixtures__/2--expected-search-entry.json');
    const episodeDetails = require('./__fixtures__/2--example-episode-details.json');

    const result = convertSrtFileIntoSearchEntryArray({
      srtFileContent: sampleSrtContent,
      sequentialEpisodeId: episodeDetails.sequentialId,
      episodePublishedUnixTimestamp: new Date(episodeDetails.publishedAt).getTime()
    });
    expect(result).toEqual(expectedOutput);
  });

  it('should correctly process a very long SRT file with minimal punctuation (Fixture Set 3)', () => {
    const sampleSrtContent = fs.readFileSync(
      path.join(__dirname, '__fixtures__/3--example-transcription.srt'),
      'utf-8'
    );
    const expectedOutput = require('./__fixtures__/3--expected-search-entry.json');
    const episodeDetails = require('./__fixtures__/3--example-episode-details.json');

    const result = convertSrtFileIntoSearchEntryArray({
      srtFileContent: sampleSrtContent,
      sequentialEpisodeId: episodeDetails.sequentialId,
      episodePublishedUnixTimestamp: new Date(episodeDetails.publishedAt).getTime()
    });
    expect(result).toEqual(expectedOutput);
  });

  it('should return an empty array if the SRT content is empty or whitespace', () => {
    const result = convertSrtFileIntoSearchEntryArray({
      srtFileContent: '   \n   \n  ',
      sequentialEpisodeId: testSequentialEpisodeId,
      episodePublishedUnixTimestamp: testEpisodePublishedUnixTimestamp
    });
    expect(result).toEqual([]);
  });

  it('should return an empty array if the SRT content is null or undefined', () => {
    const result1 = convertSrtFileIntoSearchEntryArray({
      srtFileContent: null as any, // Test case for null
      sequentialEpisodeId: testSequentialEpisodeId,
      episodePublishedUnixTimestamp: testEpisodePublishedUnixTimestamp
    });
     const result2 = convertSrtFileIntoSearchEntryArray({
      srtFileContent: undefined as any, // Test case for undefined
      sequentialEpisodeId: testSequentialEpisodeId,
      episodePublishedUnixTimestamp: testEpisodePublishedUnixTimestamp
    });
    expect(result1).toEqual([]);
    expect(result2).toEqual([]);
  });

  // TODO: Add more edge cases if necessary
  // - SRT with malformed lines?
  // - SRT with very long segments without punctuation?

});