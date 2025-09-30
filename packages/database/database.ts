import { create, insert, insertMultiple, search, SearchParams, AnyOrama, save, load } from '@orama/orama';
import { SearchEntry, ORAMA_SEARCH_SCHEMA, SearchRequest, SearchResponse, ApiSearchResultHit } from '@browse-dot-show/types';
import { log } from '@browse-dot-show/logging';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { unpack, Packr, isNativeAccelerationEnabled } from 'msgpackr';
import { compress, decompress } from '@mongodb-js/zstd';

// Type for Orama database instance
export type OramaSearchDatabase = Awaited<ReturnType<typeof create>>;

// Compression types for streaming persistence
export type CompressionType = "none" | "gzip" | "zstd";


/**
 * Optimized MsgPackR encode function using schema for maximum performance
 * @param data - The data to encode
 * @returns Buffer of encoded data
 */
function optimizedMsgPackREncode(data: any): Buffer {
  const startTime = Date.now();
  
  try {
    log.info(`Starting MsgPackR encode with schema optimization`);
    log.info(`Native acceleration enabled: ${isNativeAccelerationEnabled}`);
    
    // Use Packr class with variableMapSize option to handle large objects that exceed 16-bit map size
    const packr = new Packr({ variableMapSize: true });
    const result = packr.pack(data);

    log.info(`MsgPackR encode completed in ${Date.now() - startTime}ms`);
    return result;
  } catch (error: any) {
    log.error(`MsgPackR encode failed after ${Date.now() - startTime}ms: ${error.message}`, error);
    throw error;
  }
}

/**
 * Optimized MsgPackR decode function using schema for maximum performance
 * @param buffer - The buffer to decode
 * @returns Promise resolving to the decoded data
 */
async function optimizedMsgPackRDecode(buffer: Buffer): Promise<any> {
  const startTime = Date.now();
  
  try {
    log.info(`Starting MsgPackR decode for buffer (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    log.info(`Native acceleration enabled: ${isNativeAccelerationEnabled}`);
    const result = unpack(buffer);
    
    const timeMs = Date.now() - startTime;
    log.info(`MsgPackR decode completed in ${timeMs}ms`);
    return result;
  } catch (error: any) {
    log.error(`MsgPackR decode failed after ${Date.now() - startTime}ms: ${error.message}`, error);
    throw error;
  }
}

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
      startDate,
      endDate,
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

    // Add date filtering if specified
    if (startDate || endDate) {
      const whereClause: any = {};
      
      if (startDate && endDate) {
        // Both dates provided - use between operator
        const startTimestamp = new Date(startDate).getTime();
        const endTimestamp = new Date(endDate).getTime() + (24 * 60 * 60 * 1000 - 1); // End of day
        whereClause.episodePublishedUnixTimestamp = {
          between: [startTimestamp, endTimestamp]
        };
      } else if (startDate) {
        // Only start date - use gte
        const startTimestamp = new Date(startDate).getTime();
        whereClause.episodePublishedUnixTimestamp = { gte: startTimestamp };
      } else if (endDate) {
        // Only end date - use lte
        const endTimestamp = new Date(endDate).getTime() + (24 * 60 * 60 * 1000 - 1); // End of day
        whereClause.episodePublishedUnixTimestamp = { lte: endTimestamp };
      }
      
      searchOptions.where = whereClause;
      log.info(`Date filtering applied: startDate=${startDate}, endDate=${endDate}, whereClause=${JSON.stringify(whereClause)}`);
    }

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
 * Persists Orama database to file using streaming approach with MsgPackR
 * This is the enhanced version using msgpackr for better performance
 * @param db - The Orama database instance
 * @param filePath - Path where to save the database file
 * @param compression - Compression type to use (none, gzip, zstd)
 * @returns Promise resolving to the file path
 */
export async function persistToFileStreamingMsgPackR(
  db: OramaSearchDatabase, 
  filePath: string, 
  compression: CompressionType = "gzip"
): Promise<string> {
  try {
    log.info(`Starting MsgPackR streaming persistence to ${filePath} with ${compression} compression`);
    
    // Export database using Orama's save function
    const dbExport = await save(db);
    log.info('Successfully exported Orama database for MsgPackR streaming');
    
    // Encode to MsgPackR format using optimized encoder
    const msgpackrBuffer = optimizedMsgPackREncode(dbExport);
    log.info(`MsgPackR buffer size: ${(msgpackrBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Stream to file with optional compression
    const streamStartTime = Date.now();
    log.info(`Starting MsgPackR file streaming with compression: ${compression}`);
    
    if (compression === "none") {
      await pipeline(Readable.from(msgpackrBuffer), fs.createWriteStream(filePath));
    } else if (compression === "gzip") {
      await pipeline(Readable.from(msgpackrBuffer), zlib.createGzip(), fs.createWriteStream(filePath));
    } else if (compression === "zstd") {
      // For zstd, we need to compress the entire buffer first, then write
      const compressedBuffer = await compress(msgpackrBuffer, 3);
      await fs.promises.writeFile(filePath, compressedBuffer);
    } else {
      throw new Error(`Unknown compression type: ${compression}`);
    }
    
    const streamEndTime = Date.now();
    const streamDuration = streamEndTime - streamStartTime;
    log.info(`MsgPackR file streaming completed in ${streamDuration}ms (${(streamDuration / 1000).toFixed(2)}s) with compression: ${compression}`);
    
    // Get file size for logging
    const stats = await fs.promises.stat(filePath);
    log.info(`Successfully persisted Orama database with MsgPackR to ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    return filePath;
  } catch (error: any) {
    log.error(`Error persisting Orama database with MsgPackR to file: ${error.message}`, error);
    throw error;
  }
}

/**
 * Restores Orama database from file using streaming decompression and optimized MsgPackR decoding
 * This is the enhanced version using msgpackr for better performance
 * @param filePath - Path to the database file
 * @param compression - Compression type that was used (none, gzip, zstd)
 * @returns Promise resolving to the restored Orama database instance
 */
export async function restoreFromFileStreamingMsgPackR(
  filePath: string, 
  compression: CompressionType = "gzip"
): Promise<OramaSearchDatabase> {
  const startTime = Date.now();
  try {
    log.info(`Starting MsgPackR optimized streaming restore from ${filePath} with ${compression} compression`);
    
    // Create a placeholder database
    const dbCreateStart = Date.now();
    const db = await create({
      schema: ORAMA_SEARCH_SCHEMA
    });
    log.info(`Database schema created in ${Date.now() - dbCreateStart}ms`);
    
    // Use streaming decompression to minimize memory usage
    const streamStart = Date.now();
    let chunks: Buffer[] = [];
    let totalSize = 0;
    
    if (compression === "none") {
      // For uncompressed files, still use the existing approach
      const fileBuffer = await fs.promises.readFile(filePath);
      chunks = [fileBuffer];
      totalSize = fileBuffer.length;
      log.info(`File read (uncompressed) in ${Date.now() - streamStart}ms, size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    } else if (compression === "zstd") {
      // For zstd, we need to read the entire file and decompress it
      const fileBuffer = await fs.promises.readFile(filePath);
      const decompressedBuffer = await decompress(fileBuffer);
      chunks = [decompressedBuffer];
      totalSize = decompressedBuffer.length;
      log.info(`Zstd decompression completed in ${Date.now() - streamStart}ms, decompressed size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      // Skip the rest of the streaming logic for zstd
      const combineStart = Date.now();
      const finalBuffer = Buffer.concat(chunks);
      log.info(`Buffer concatenation completed in ${Date.now() - combineStart}ms`);
      chunks = [];
      const msgpackrDecodeStart = Date.now();
      const decoded = await optimizedMsgPackRDecode(finalBuffer);
      const oramaLoadStart = Date.now();
      await load(db, decoded as any);
      log.info(`Orama database load completed in ${Date.now() - oramaLoadStart}ms`);
      const totalTime = Date.now() - startTime;
      const msgpackrDecodeTime = Date.now() - msgpackrDecodeStart;
      const oramaLoadTime = Date.now() - oramaLoadStart;
      log.info(`Successfully restored Orama database with MsgPackR from ${filePath} in ${totalTime}ms total (enhanced streaming)`);
      log.info(`⏱️ MsgPackR restore timing breakdown: Zstd decompress: ${msgpackrDecodeStart - streamStart}ms, MsgPackR decode: ${msgpackrDecodeTime}ms, Orama load: ${oramaLoadTime}ms`);
      return db as OramaSearchDatabase;
    } else if (compression === "gzip") {
      let decompressionStream;
      if (compression === "gzip") {
        decompressionStream = zlib.createGunzip();
      } else {
        throw new Error(`Unknown compression type: ${compression}`);
      }
      
      // Stream the file through decompression
      const fileStream = fs.createReadStream(filePath);
      const decompressedStream = fileStream.pipe(decompressionStream);
      
      await new Promise<void>((resolve, reject) => {
        decompressedStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          totalSize += chunk.length;
        });
        
        decompressedStream.on('end', () => {
          log.info(`Streaming decompression (${compression}) completed in ${Date.now() - streamStart}ms, decompressed size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
          resolve();
        });
        
        decompressedStream.on('error', (error) => {
          log.error(`Streaming decompression failed after ${Date.now() - streamStart}ms: ${error.message}`);
          reject(error);
        });
      });
    }
    
    // Combine chunks into single buffer
    const combineStart = Date.now();
    const fileBuffer = Buffer.concat(chunks);
    log.info(`Buffer concatenation completed in ${Date.now() - combineStart}ms`);
    
    // Clear chunks array to free memory
    chunks = [];
    
    // Decode MsgPackR
    const msgpackrDecodeStart = Date.now();
    const decoded = await optimizedMsgPackRDecode(fileBuffer);
    
    // Load into Orama database
    const oramaLoadStart = Date.now();
    await load(db, decoded as any);
    log.info(`Orama database load completed in ${Date.now() - oramaLoadStart}ms`);
    
    const totalTime = Date.now() - startTime;
    const msgpackrDecodeTime = Date.now() - msgpackrDecodeStart;
    const oramaLoadTime = Date.now() - oramaLoadStart;
    const streamDecompressTime = msgpackrDecodeStart - streamStart;
    
    log.info(`Successfully restored Orama database with MsgPackR from ${filePath} in ${totalTime}ms total (enhanced streaming)`);
    log.info(`⏱️ MsgPackR restore timing breakdown: Streaming decompress: ${streamDecompressTime}ms, MsgPackR decode: ${msgpackrDecodeTime}ms, Orama load: ${oramaLoadTime}ms`);
    
    return db as OramaSearchDatabase;
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    log.error(`Error in MsgPackR optimized streaming restore after ${totalTime}ms: ${error.message}`, error);
    throw error;
  }
}