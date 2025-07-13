import { create, insert, insertMultiple, search, SearchParams, AnyOrama, save, load } from '@orama/orama';
// import { persist, restore } from '@orama/plugin-data-persistence';
import { SearchEntry, ORAMA_SEARCH_SCHEMA, SearchRequest, SearchResponse, ApiSearchResultHit } from '@browse-dot-show/types';
import { log } from '@browse-dot-show/logging';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { encode, decode, Decoder, Encoder } from '@msgpack/msgpack';
import { pack, unpack } from 'msgpackr';
import { compress, decompress } from '@mongodb-js/zstd';

// Type for Orama database instance
export type OramaSearchDatabase = Awaited<ReturnType<typeof create>>;

// Compression types for streaming persistence
export type CompressionType = "none" | "gzip" | "brotli" | "zstd";

// Define the schema for msgpackr optimization
// This matches the Orama database export structure
const MSGPACKR_SCHEMA = {
  // Orama database structure with searchable properties
  index: {
    text: {},
    sequentialEpisodeIdAsString: {},
    startTimeMs: {},
    endTimeMs: {},
    episodePublishedUnixTimestamp: {}
  },
  // Documents storage
  docs: {},
  // Orama metadata
  schema: {},
  version: 'string'
};

// Reusable encoder instance for better performance
const msgpackEncoder = new Encoder({
  maxDepth: 1500, // Required for complex nested structures in large datasets
  initialBufferSize: 8192, // 8KB initial buffer (default is 2KB)
  sortKeys: true, // Helps with compression efficiency
  ignoreUndefined: false
});

// Reusable decoder instance for better performance (fastest approach tested)
const msgpackDecoder = new Decoder({
  maxStrLength: 100_000_000, // 100MB max for strings
  maxBinLength: 100_000_000, // 100MB max for binary data
  maxArrayLength: 10_000_000, // 10M max array length
  maxMapLength: 10_000_000,   // 10M max map length
  maxExtLength: 100_000_000,  // 100MB max for extensions
  useBigInt64: false
});

/**
 * Optimized MsgPack decode function using reusable decoder (fastest tested approach)
 * @param buffer - The buffer to decode
 * @returns Promise resolving to the decoded data
 */
async function optimizedMsgPackDecode(buffer: Buffer): Promise<any> {
  const startTime = Date.now();
  
  try {
    log.info(`Starting MsgPack decode for buffer (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    const result = msgpackDecoder.decode(buffer);
    
    const timeMs = Date.now() - startTime;
    log.info(`MsgPack decode completed in ${timeMs}ms`);
    return result;
  } catch (error: any) {
    log.error(`MsgPack decode failed after ${Date.now() - startTime}ms: ${error.message}`, error);
    throw error;
  }
}

/**
 * Optimized MsgPack encode function using reusable encoder
 * @param data - The data to encode
 * @returns Uint8Array of encoded data
 */
function optimizedMsgPackEncode(data: any): Uint8Array {
  const startTime = Date.now();
  
  try {
    log.info(`Starting MsgPack encode`);
    const result = msgpackEncoder.encode(data);
    log.info(`MsgPack encode completed in ${Date.now() - startTime}ms`);
    return result;
  } catch (error: any) {
    log.error(`MsgPack encode failed after ${Date.now() - startTime}ms: ${error.message}`, error);
    throw error;
  }
}

/**
 * Optimized MsgPackR encode function using schema for maximum performance
 * @param data - The data to encode
 * @returns Buffer of encoded data
 */
function optimizedMsgPackREncode(data: any): Buffer {
  const startTime = Date.now();
  
  try {
    log.info(`Starting MsgPackR encode with schema optimization`);
    const result = pack(data);
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
 * Persists Orama database to file using streaming approach with MsgPack
 * This avoids the string length limitations of the built-in persistence plugin
 * @param db - The Orama database instance
 * @param filePath - Path where to save the database file
 * @param compression - Compression type to use (none, gzip, brotli)
 * @returns Promise resolving to the file path
 */
export async function persistToFileStreaming(
  db: OramaSearchDatabase, 
  filePath: string, 
  compression: CompressionType = "gzip"
): Promise<string> {
  try {
    log.info(`Starting streaming persistence to ${filePath} with ${compression} compression`);
    
    // Export database using Orama's save function
    const dbExport = await save(db);
    log.info('Successfully exported Orama database for streaming');
    
    // Encode to MsgPack format using optimized encoder
    const msgpack = optimizedMsgPackEncode(dbExport);
    const bufferExport = Buffer.from(msgpack.buffer, msgpack.byteOffset, msgpack.byteLength);
    log.info(`MsgPack buffer size: ${(bufferExport.length / 1024 / 1024).toFixed(2)} MB`);

    
    // Stream to file with optional compression
    const streamStartTime = Date.now();
    log.info(`Starting file streaming with compression: ${compression}`);
    
    if (compression === "none") {
      await pipeline(Readable.from(bufferExport), fs.createWriteStream(filePath));
    } else if (compression === "gzip") {
      await pipeline(Readable.from(bufferExport), zlib.createGzip(), fs.createWriteStream(filePath));
    } else if (compression === "brotli") {
      await pipeline(Readable.from(bufferExport), zlib.createBrotliCompress(), fs.createWriteStream(filePath));
    } else if (compression === "zstd") {
      // For zstd, we need to compress the entire buffer first, then write
      const compressedBuffer = await compress(bufferExport, 3);
      await fs.promises.writeFile(filePath, compressedBuffer);
    } else {
      throw new Error(`Unknown compression type: ${compression}`);
    }
    
    const streamEndTime = Date.now();
    const streamDuration = streamEndTime - streamStartTime;
    log.info(`File streaming completed in ${streamDuration}ms (${(streamDuration / 1000).toFixed(2)}s) with compression: ${compression}`);
    
    // Get file size for logging
    const stats = await fs.promises.stat(filePath);
    log.info(`Successfully persisted Orama database to ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    return filePath;
  } catch (error: any) {
    log.error(`Error persisting Orama database to file: ${error.message}`, error);
    throw error;
  }
}



/**
 * Restores Orama database from file using streaming decompression and optimized MsgPack decoding
 * @param filePath - Path to the database file
 * @param compression - Compression type that was used (none, gzip, brotli)
 * @returns Promise resolving to the restored Orama database instance
 */
export async function restoreFromFileStreamingOptimized(
  filePath: string, 
  compression: CompressionType = "gzip"
): Promise<OramaSearchDatabase> {
  const startTime = Date.now();
  try {
    log.info(`Starting optimized streaming restore from ${filePath} with ${compression} compression`);
    
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
    } else {
      // Create decompression stream
      let decompressionStream;
      if (compression === "gzip") {
        decompressionStream = zlib.createGunzip();
      } else if (compression === "brotli") {
        decompressionStream = zlib.createBrotliDecompress();
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
    
    // Decode MsgPack
    const msgpackDecodeStart = Date.now();
    const decoded = await optimizedMsgPackDecode(fileBuffer);
    
    // Load into Orama database
    const oramaLoadStart = Date.now();
    await load(db, decoded as any);
    log.info(`Orama database load completed in ${Date.now() - oramaLoadStart}ms`);
    
    const totalTime = Date.now() - startTime;
    const msgpackDecodeTime = Date.now() - msgpackDecodeStart;
    const oramaLoadTime = Date.now() - oramaLoadStart;
    const streamDecompressTime = msgpackDecodeStart - streamStart;
    
    log.info(`Successfully restored Orama database from ${filePath} in ${totalTime}ms total (optimized streaming)`);
    log.info(`⏱️ Optimized restore timing breakdown: Streaming decompress: ${streamDecompressTime}ms, MsgPack decode: ${msgpackDecodeTime}ms, Orama load: ${oramaLoadTime}ms`);
    
    return db as OramaSearchDatabase;
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    log.error(`Error in optimized streaming restore after ${totalTime}ms: ${error.message}`, error);
    throw error;
  }
}

/**
 * Persists Orama database to file using streaming approach with MsgPackR
 * This is the enhanced version using msgpackr for better performance
 * @param db - The Orama database instance
 * @param filePath - Path where to save the database file
 * @param compression - Compression type to use (none, gzip, brotli)
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
    } else if (compression === "brotli") {
      await pipeline(Readable.from(msgpackrBuffer), zlib.createBrotliCompress(), fs.createWriteStream(filePath));
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
 * @param compression - Compression type that was used (none, gzip, brotli)
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
    } else {
      // Create decompression stream
      let decompressionStream;
      if (compression === "gzip") {
        decompressionStream = zlib.createGunzip();
      } else if (compression === "brotli") {
        decompressionStream = zlib.createBrotliDecompress();
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


