import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { performHealthCheck, performSearch } from '../search';
import { SearchResponse } from '@browse-dot-show/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Search Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('performHealthCheck', () => {
    const mockSearchApiBaseUrl = 'http://test-api.com';

    it('makes a POST request to the health check endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      } as Response);

      await performHealthCheck(mockSearchApiBaseUrl);

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockSearchApiBaseUrl}/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: 'health check',
            limit: 1,
            isHealthCheckOnly: true,
          }),
        }
      );
    });

    it('throws an error when the health check fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as Response);

      await expect(performHealthCheck(mockSearchApiBaseUrl)).rejects.toThrow(
        'Health check failed: 503 Service Unavailable'
      );
    });

    it('throws error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(performHealthCheck(mockSearchApiBaseUrl)).rejects.toThrow('Network error');
    });

    it('processes response JSON even if not needed', async () => {
      const mockJsonResponse = { status: 'healthy' };
      const mockJson = vi.fn().mockResolvedValue(mockJsonResponse);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mockJson,
      } as unknown as Response);

      await performHealthCheck(mockSearchApiBaseUrl);
      
      // Verify that json() was called even though we don't use the result
      expect(mockJson).toHaveBeenCalled();
    });
  });

  describe('performSearch', () => {
    const mockSearchApiBaseUrl = 'http://test-api.com';

    const defaultParams = {
      query: 'test query',
      sortOption: 'relevance' as const,
      searchApiBaseUrl: mockSearchApiBaseUrl,
      searchLimit: 10,
      searchOffset: 0,
    };

    it('makes a POST request to the correct endpoint', async () => {
      const mockResponse: SearchResponse = {
        hits: [],
        totalHits: 0,
        processingTimeMs: 100,
        query: 'test query',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await performSearch(defaultParams);

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockSearchApiBaseUrl}/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: 'test query',
            limit: 10,
            offset: 0,
            searchFields: ['text'],
          }),
        }
      );
    });

    it('handles relevance sort option correctly', async () => {
      const mockResponse: SearchResponse = {
        hits: [],
        totalHits: 0,
        processingTimeMs: 100,
        query: 'test query',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await performSearch({
        ...defaultParams,
        sortOption: 'relevance',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(requestBody).not.toHaveProperty('sortBy');
      expect(requestBody).not.toHaveProperty('sortOrder');
    });

    it('handles newest sort option correctly', async () => {
      const mockResponse: SearchResponse = {
        hits: [],
        totalHits: 0,
        processingTimeMs: 100,
        query: 'test query',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await performSearch({
        ...defaultParams,
        sortOption: 'newest',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(requestBody.sortBy).toBe('episodePublishedUnixTimestamp');
      expect(requestBody.sortOrder).toBe('DESC');
    });

    it('handles oldest sort option correctly', async () => {
      const mockResponse: SearchResponse = {
        hits: [],
        totalHits: 0,
        processingTimeMs: 100,
        query: 'test query',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await performSearch({
        ...defaultParams,
        sortOption: 'oldest',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(requestBody.sortBy).toBe('episodePublishedUnixTimestamp');
      expect(requestBody.sortOrder).toBe('ASC');
    });

    it('trims the query string', async () => {
      const mockResponse: SearchResponse = {
        hits: [],
        totalHits: 0,
        processingTimeMs: 100,
        query: 'test query',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await performSearch({
        ...defaultParams,
        query: '  test query  ',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(requestBody.query).toBe('test query');
    });

    it('throws an error when the response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(performSearch(defaultParams)).rejects.toThrow(
        'Search request failed: 500 Internal Server Error'
      );
    });

    it('returns the parsed JSON response', async () => {
      const mockResponse: SearchResponse = {
        hits: [
          {
            id: '1',
            text: 'test result',
            sequentialEpisodeIdAsString: '1',
            startTimeMs: 1000,
            endTimeMs: 2000,
            episodePublishedUnixTimestamp: 1234567890,
          },
        ],
        totalHits: 1,
        processingTimeMs: 150,
        query: 'test query',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await performSearch(defaultParams);
      expect(result).toEqual(mockResponse);
    });
  });
}); 