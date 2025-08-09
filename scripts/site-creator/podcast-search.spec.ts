import { describe, it, expect } from 'vitest';
import { createSiteId, createPodcastId } from './podcast-search.js';

describe('createSiteId', () => {
  describe('4 or fewer words (no hyphens)', () => {
    it('should handle single word', () => {
      expect(createSiteId('Podcast')).toBe('podcast');
    });

    it('should handle two words', () => {
      expect(createSiteId('Darknet Diaries')).toBe('darknetdiaries');
    });

    it('should handle three words', () => {
      expect(createSiteId('My Favorite Murder')).toBe('myfavoritemurder');
    });

    it('should handle four words exactly', () => {
      expect(createSiteId('My Favorite Podcast Name')).toBe('myfavoritepodcastname');
    });

    it('should handle case insensitive input', () => {
      expect(createSiteId('DARKNET DIARIES')).toBe('darknetdiaries');
      expect(createSiteId('My FAVORITE Murder')).toBe('myfavoritemurder');
    });

    it('should remove special characters', () => {
      expect(createSiteId('Darknet & Diaries!')).toBe('darknetdiaries');
      expect(createSiteId('My @Favorite #Murder')).toBe('myfavoritemurder');
    });

    it('should handle numbers in input', () => {
      expect(createSiteId('Pod123cast 456')).toBe('podcast');
    });

    it('should handle multiple spaces', () => {
      expect(createSiteId('Darknet    Diaries')).toBe('darknetdiaries');
      expect(createSiteId('My   Favorite   Murder')).toBe('myfavoritemurder');
    });

    it('should handle leading and trailing spaces', () => {
      expect(createSiteId('  Darknet Diaries  ')).toBe('darknetdiaries');
      expect(createSiteId('\t My Favorite Murder \n')).toBe('myfavoritemurder');
    });
  });

  describe('5 or more words (with hyphens)', () => {
    it('should handle five words', () => {
      expect(createSiteId('This Is a Name With')).toBe('this-is-a-name-with');
    });

    it('should handle many words', () => {
      expect(createSiteId('This Is a Name With Many Words')).toBe('this-is-a-name-with-many-words');
    });

    it('should handle case insensitive input with hyphens', () => {
      expect(createSiteId('THIS IS A NAME WITH MANY WORDS')).toBe('this-is-a-name-with-many-words');
    });

    it('should remove special characters with hyphens', () => {
      expect(createSiteId('This! Is@ a# Name$ With% Many^ Words&')).toBe('this-is-a-name-with-many-words');
    });

    it('should handle multiple spaces with hyphens', () => {
      expect(createSiteId('This   Is  a    Name   With  Many    Words')).toBe('this-is-a-name-with-many-words');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(createSiteId('')).toBe('');
    });

    it('should handle only whitespace', () => {
      expect(createSiteId('   \t\n   ')).toBe('');
    });

    it('should handle only special characters', () => {
      expect(createSiteId('!@#$%^&*()')).toBe('');
    });

    it('should handle mixed special characters and spaces', () => {
      expect(createSiteId('!@# $%^ &*( )')).toBe('');
    });

    it('should handle existing hyphens in input', () => {
      expect(createSiteId('Dark-net Di-aries')).toBe('darknetdiaries');
      expect(createSiteId('This-Is A Name-With Many-Words Here')).toBe('thisis-a-namewith-manywords-here');
    });

    it('should handle words that become empty after cleaning', () => {
      expect(createSiteId('123 Valid Word 456')).toBe('validword');
      expect(createSiteId('!@# Valid $%^ Word &*(')).toBe('validword');
    });
  });

  describe('real-world examples', () => {
    it('should handle common podcast names correctly', () => {
      // 4 or fewer words - no hyphens
      expect(createSiteId('Serial')).toBe('serial');
      expect(createSiteId('This American Life')).toBe('thisamericanlife');
      expect(createSiteId('The Joe Rogan')).toBe('thejoerogan');
      expect(createSiteId('My Favorite Murder')).toBe('myfavoritemurder');
      
      // More than 4 words - with hyphens
      expect(createSiteId('How I Built This with Guy Raz')).toBe('how-i-built-this-with-guy-raz');
      expect(createSiteId('The Tim Ferriss Show Interviews with World Class')).toBe('the-tim-ferriss-show-interviews-with-world-class');
    });
  });
});

describe('createPodcastId', () => {
  it('should use the same logic as createSiteId when no conflict', () => {
    const podcastName = 'Darknet Diaries';
    const siteId = 'differentsite';
    
    expect(createPodcastId(podcastName, siteId)).toBe('darknetdiaries');
  });

  it('should add -podcast suffix when podcast ID matches site ID', () => {
    const podcastName = 'Darknet Diaries';
    const siteId = 'darknetdiaries';
    
    expect(createPodcastId(podcastName, siteId)).toBe('darknetdiaries-podcast');
  });

  it('should handle longer names with hyphens', () => {
    const podcastName = 'This Is a Name With Many Words';
    const siteId = 'differentsite';
    
    expect(createPodcastId(podcastName, siteId)).toBe('this-is-a-name-with-many-words');
  });

  it('should add -podcast suffix for longer names when conflict exists', () => {
    const podcastName = 'This Is a Name With Many Words';
    const siteId = 'this-is-a-name-with-many-words';
    
    expect(createPodcastId(podcastName, siteId)).toBe('this-is-a-name-with-many-words-podcast');
  });

  it('should handle edge cases consistently with createSiteId', () => {
    expect(createPodcastId('', 'somesite')).toBe('');
    expect(createPodcastId('   ', 'somesite')).toBe('');
    expect(createPodcastId('!@#$', 'somesite')).toBe('');
  });
});
