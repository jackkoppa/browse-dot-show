import { SearchRequest, SearchResponse } from '@browse-dot-show/types';
import { SortOption } from '../types/search';

export interface SearchParams {
  query: string;
  sortOption: SortOption;
  searchApiBaseUrl: string;
  searchLimit: number;
  searchOffset?: number;
}

/**
 * Perform a search request to the search API
 */
export async function performSearch(params: SearchParams): Promise<SearchResponse> {
  const { query, sortOption, searchApiBaseUrl, searchLimit, searchOffset = 0 } = params;

  const searchRequest: SearchRequest = {
    query: query.trim(),
    limit: searchLimit,
    offset: searchOffset,
    searchFields: ['text'], // Search only in transcript text
  };

  // Add sorting parameters based on sort option
  if (sortOption === 'newest') {
    searchRequest.sortBy = 'episodePublishedUnixTimestamp';
    searchRequest.sortOrder = 'DESC';
  } else if (sortOption === 'oldest') {
    searchRequest.sortBy = 'episodePublishedUnixTimestamp';
    searchRequest.sortOrder = 'ASC';
  }
  // For 'relevance', we don't add sortBy/sortOrder to use Orama's default relevance scoring

  const response = await fetch(`${searchApiBaseUrl}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(searchRequest),
  });

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Performs a health check request to warm up the search Lambda
 * 
 * @param searchApiBaseUrl - The base URL for the search API
 * @returns Promise that resolves when the Lambda is warmed up
 * @throws Error if the health check request fails
 */
export const performHealthCheck = async (searchApiBaseUrl: string): Promise<void> => {
  const healthCheckRequest: SearchRequest = {
    query: 'health check',
    limit: 1,
    isHealthCheckOnly: true
  };

  const response = await fetch(`${searchApiBaseUrl}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(healthCheckRequest),
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }

  // We don't need to process the response, just that it succeeded
  await response.json();
}; 