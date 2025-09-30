/**
 * Search entry used for Orama index
 * Contains all searchable and sortable fields
 */
export interface SearchEntry {
  id: string;                           // Unique search entry ID
  text: string;                         // Transcript text (searchable)
  sequentialEpisodeIdAsString: string;  // Sequential episode ID from manifest (as string for Orama filtering)
  startTimeMs: number;                  // Start time in milliseconds
  endTimeMs: number;                    // End time in milliseconds
  episodePublishedUnixTimestamp: number; // Unix timestamp for sorting by date
}

/**
 * Search result hit returned by API
 * Extends SearchEntry with highlighting information
 */
export interface ApiSearchResultHit extends SearchEntry {
  highlight?: string; // Highlighted text from search results
}

/**
 * Search request parameters for Orama
 */
export interface SearchRequest {
  query: string;                        // Search query text
  limit?: number;                       // Maximum number of results (default: 10)
  offset?: number;                      // Number of results to skip for pagination (default: 0)
  sortBy?: keyof SearchEntry;           // Field to sort by
  sortOrder?: 'ASC' | 'DESC';          // Sort order (default: 'DESC' for date) - converted to uppercase internally
  searchFields?: (keyof SearchEntry)[]; // Fields to search in (default: ['text'])
  startDate?: string;                   // Filter start date (ISO date string YYYY-MM-DD)
  endDate?: string;                     // Filter end date (ISO date string YYYY-MM-DD)
  isHealthCheckOnly?: boolean;          // If true, only initialize the Lambda and return immediately (for warming up)
  forceFreshDBFileDownload?: boolean; // If true, force re-download of the S3 DB index file
}

/**
 * Search response from API
 */
export interface SearchResponse {
  hits: ApiSearchResultHit[];           // Search result hits
  totalHits: number;                    // Total number of hits
  processingTimeMs: number;             // Processing time in milliseconds
  query: string;                        // Original query
  sortBy?: keyof SearchEntry;           // Field used for sorting
  sortOrder?: 'ASC' | 'DESC';          // Sort order applied
}

/**
 * Orama schema definition for TypeScript
 */
export const ORAMA_SEARCH_SCHEMA = {
  id: 'string',
  text: 'string',
  sequentialEpisodeIdAsString: 'string',
  startTimeMs: 'number',
  endTimeMs: 'number',
  episodePublishedUnixTimestamp: 'number',
} as const;