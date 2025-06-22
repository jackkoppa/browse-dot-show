import { create, insert, insertMultiple, search, SearchParams, AnyOrama } from '@orama/orama';
import { persist, restore } from '@orama/plugin-data-persistence';
import { SearchEntry, ORAMA_SEARCH_SCHEMA, SearchRequest, SearchResponse, ApiSearchResultHit } from '@browse-dot-show/types';
import { log } from '@browse-dot-show/logging';

// Type for Orama database instance
export type OramaSearchDatabase = Awaited<ReturnType<typeof create>>;

/**
 * Creates an Orama search index with the predefined schema
 * @returns A Promise resolving to the created Orama search index
 */
export async function createOramaIndex(): Promise<OramaSearchDatabase> {
  try {
    const db = await create({
      schema: ORAMA_SEARCH_SCHEMA,
      components: {
        // Use default components optimized for search performance
      }
    });
    
    log.info('Successfully created Orama search index');
    return db;
  } catch (error: any) {
    log.error(`Error creating Orama search index: ${error.message}`, error);
    throw error;
  }
}

/**
 * Inserts a single search entry into the Orama index
 * @param db - The Orama database instance
 * @param entry - The search entry to insert
 */
export async function insertSearchEntry(db: OramaSearchDatabase, entry: SearchEntry): Promise<void> {
  try {
    await insert(db, entry);
    log.debug(`Inserted search entry with ID: ${entry.id}`);
  } catch (error: any) {
    log.error(`Error inserting search entry ${entry.id}: ${error.message}`, error);
    throw error;
  }
}

/**
 * Inserts multiple search entries into the Orama index using batch insertion
 * @param db - The Orama database instance
 * @param entries - Array of search entries to insert
 */
export async function insertMultipleSearchEntries(db: OramaSearchDatabase, entries: SearchEntry[]): Promise<void> {
  try {
    await insertMultiple(db, entries);
    log.info(`Successfully inserted ${entries.length} search entries`);
  } catch (error: any) {
    log.error(`Error inserting ${entries.length} search entries: ${error.message}`, error);
    throw error;
  }
}

/**
 * Searches the Orama index with the provided parameters
 * @param db - The Orama database instance
 * @param searchRequest - Search parameters
 * @returns Promise resolving to search results
 */
export async function searchOramaIndex(db: OramaSearchDatabase, searchRequest: SearchRequest): Promise<SearchResponse> {
  const startTime = Date.now();
  
  try {
    const {
      query,
      limit = 10,
      offset = 0,
      sortBy,
      sortOrder = 'DESC',
      searchFields = ['text'],
    } = searchRequest;

    // Build search options
    const searchOptions: SearchParams<AnyOrama> = {
      term: query,
      limit,
      offset,
      properties: searchFields,
      // boost: {
      //   // Boost exact matches in text field
      //   text: 1.5
      // },
      threshold: 0,
      // TODO: Make this configurable
      exact: true
    };

    // Add sorting if specified
    if (sortBy) {
      searchOptions.sortBy = {
        property: sortBy,
        order: sortOrder
      };
    }

    log.warn(`Search options: ${JSON.stringify(searchOptions)}`);

    const results = await search(db, searchOptions);
    const processingTimeMs = Date.now() - startTime;

    // Transform results to match API response format
    const hits: ApiSearchResultHit[] = results.hits.map((hit: any) => ({
      ...hit.document,
      highlight: hit.highlight?.text || undefined // Include highlighting if available
    }));

    const response: SearchResponse = {
      hits,
      totalHits: results.count, // Use Orama's count since filtering is done during search
      processingTimeMs,
      query,
      sortBy,
      sortOrder
    };

    log.info(`Search completed in ${processingTimeMs}ms, found ${results.count} results for query: "${query}"`);
    return response;
  } catch (error: any) {
    const processingTimeMs = Date.now() - startTime;
    log.error(`Error searching Orama index after ${processingTimeMs}ms: ${error.message}`, error);
    throw error;
  }
}

/**
 * Serializes the Orama index to JSON format for storage
 * @param db - The Orama database instance
 * @returns Promise resolving to serialized index data
 */
export async function serializeOramaIndex(db: OramaSearchDatabase): Promise<Buffer> {
  try {
    const serializedData = await persist(db, 'json');
    log.info('Successfully serialized Orama index to JSON format');
    return Buffer.from(serializedData);
  } catch (error: any) {
    log.error(`Error serializing Orama index: ${error.message}`, error);
    throw error;
  }
}

/**
 * Deserializes and restores an Orama index from JSON data
 * @param serializedData - The serialized index data
 * @returns Promise resolving to the restored Orama database instance
 */
export async function deserializeOramaIndex(serializedData: Buffer): Promise<OramaSearchDatabase> {
  try {
    const db = await restore('json', serializedData.toString());
    log.info('Successfully deserialized and restored Orama index from JSON data');
    return db as OramaSearchDatabase;
  } catch (error: any) {
    log.error(`Error deserializing Orama index: ${error.message}`, error);
    throw error;
  }
}
