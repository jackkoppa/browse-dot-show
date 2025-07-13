#!/usr/bin/env tsx

import { 
  createOramaIndex, 
  insertMultipleSearchEntries,
  persistToFileStreaming,
  restoreFromFileStreamingOptimized,
  persistToFileStreamingMsgPackR,
  restoreFromFileStreamingMsgPackR,
  type OramaSearchDatabase 
} from '../packages/database/dist/index.js';
import { SearchEntry } from '../packages/types/dist/search.js';
import { log } from '../packages/logging/dist/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Generate sample search entries for testing
function generateSampleSearchEntries(count: number): SearchEntry[] {
  const entries: SearchEntry[] = [];
  
  for (let i = 0; i < count; i++) {
    entries.push({
      id: `entry_${i}`,
      text: `This is sample transcript text for entry ${i}. It contains various words and phrases that might be searched for in a podcast transcript. The text is designed to be realistic and include common search terms.`,
      sequentialEpisodeIdAsString: `${Math.floor(i / 100) + 1}`,
      startTimeMs: i * 1000,
      endTimeMs: (i + 1) * 1000,
      episodePublishedUnixTimestamp: Date.now() - (i * 86400000) // Each entry 1 day apart
    });
  }
  
  return entries;
}

// Benchmark function
async function benchmarkPersistence(
  db: OramaSearchDatabase, 
  filePath: string, 
  compression: "none" | "gzip" | "brotli" | "zstd" = "gzip"
) {
  const results = {
    persistTime: 0,
    restoreTime: 0,
    fileSize: 0,
    compression
  };

  // Test persistence
  const persistStart = Date.now();
  await persistToFileStreaming(db, filePath, compression);
  results.persistTime = Date.now() - persistStart;

  // Get file size
  const stats = await fs.stat(filePath);
  results.fileSize = stats.size;

  // Test restore
  const restoreStart = Date.now();
  await restoreFromFileStreamingOptimized(filePath, compression);
  results.restoreTime = Date.now() - restoreStart;

  return results;
}

// Benchmark function for MsgPackR
async function benchmarkPersistenceMsgPackR(
  db: OramaSearchDatabase, 
  filePath: string, 
  compression: "none" | "gzip" | "brotli" | "zstd" = "gzip"
) {
  const results = {
    persistTime: 0,
    restoreTime: 0,
    fileSize: 0,
    compression
  };

  // Test persistence
  const persistStart = Date.now();
  await persistToFileStreamingMsgPackR(db, filePath, compression);
  results.persistTime = Date.now() - persistStart;

  // Get file size
  const stats = await fs.stat(filePath);
  results.fileSize = stats.size;

  // Test restore
  const restoreStart = Date.now();
  await restoreFromFileStreamingMsgPackR(filePath, compression);
  results.restoreTime = Date.now() - restoreStart;

  return results;
}

async function main() {
  console.log('🚀 Starting MsgPack vs MsgPackR Performance Benchmark');
  log.info('🚀 Starting MsgPack vs MsgPackR Performance Benchmark');
  
  // Create test data
  const entryCount = 10000; // 10k entries for realistic testing
  console.log(`Generating ${entryCount} sample search entries...`);
  log.info(`Generating ${entryCount} sample search entries...`);
  
  const sampleEntries = generateSampleSearchEntries(entryCount);
  console.log(`Generated ${sampleEntries.length} entries`);
  
  // Create Orama index and insert data
  console.log('Creating Orama index and inserting sample data...');
  log.info('Creating Orama index and inserting sample data...');
  const db = await createOramaIndex();
  console.log('Orama index created');
  await insertMultipleSearchEntries(db, sampleEntries);
  console.log('Sample data inserted');
  
  // Create temp directory for test files
  const tempDir = path.join(process.cwd(), 'temp-benchmark');
  await fs.mkdir(tempDir, { recursive: true });
  
  const results = {
    msgpack: {} as any,
    msgpackr: {} as any
  };

  // Test different compression types
  const compressionTypes: ("none" | "gzip" | "brotli" | "zstd")[] = ["none", "gzip", "brotli", "zstd"];
  
  for (const compression of compressionTypes) {
    log.info(`\n📊 Testing with ${compression} compression...`);
    
    // Test original MsgPack implementation
    const msgpackFile = path.join(tempDir, `test-msgpack-${compression}.msp`);
    log.info('Testing original @msgpack/msgpack implementation...');
    console.log(`[${compression}] Starting MsgPack persist...`);
    results.msgpack[compression] = await benchmarkPersistence(db, msgpackFile, compression);
    console.log(`[${compression}] MsgPack persist/restore done.`);
    
    // Test new MsgPackR implementation
    const msgpackrFile = path.join(tempDir, `test-msgpackr-${compression}.msp`);
    log.info('Testing new msgpackr implementation...');
    console.log(`[${compression}] Starting MsgPackR persist...`);
    results.msgpackr[compression] = await benchmarkPersistenceMsgPackR(db, msgpackrFile, compression);
    console.log(`[${compression}] MsgPackR persist/restore done.`);
  }

  // Clean up temp files
  await fs.rm(tempDir, { recursive: true, force: true });

  // Print results
  log.info('\n📈 Benchmark Results:');
  log.info('=====================================');
  
  for (const compression of compressionTypes) {
    log.info(`\n${compression.toUpperCase()} Compression:`);
    log.info(`  Original MsgPack:`);
    log.info(`    Persist: ${results.msgpack[compression].persistTime}ms`);
    log.info(`    Restore: ${results.msgpack[compression].restoreTime}ms`);
    log.info(`    File Size: ${(results.msgpack[compression].fileSize / 1024 / 1024).toFixed(2)} MB`);
    
    log.info(`  New MsgPackR:`);
    log.info(`    Persist: ${results.msgpackr[compression].persistTime}ms`);
    log.info(`    Restore: ${results.msgpackr[compression].restoreTime}ms`);
    log.info(`    File Size: ${(results.msgpackr[compression].fileSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Calculate improvements
    const persistImprovement = ((results.msgpack[compression].persistTime - results.msgpackr[compression].persistTime) / results.msgpack[compression].persistTime * 100).toFixed(1);
    const restoreImprovement = ((results.msgpack[compression].restoreTime - results.msgpackr[compression].restoreTime) / results.msgpack[compression].restoreTime * 100).toFixed(1);
    const sizeImprovement = ((results.msgpack[compression].fileSize - results.msgpackr[compression].fileSize) / results.msgpack[compression].fileSize * 100).toFixed(1);
    
    log.info(`  Improvements:`);
    log.info(`    Persist: ${persistImprovement}% faster`);
    log.info(`    Restore: ${restoreImprovement}% faster`);
    log.info(`    File Size: ${sizeImprovement}% smaller`);

    // Also print to console
    console.log(`\n${compression.toUpperCase()} Compression:`);
    console.log(`  Original MsgPack:`);
    console.log(`    Persist: ${results.msgpack[compression].persistTime}ms`);
    console.log(`    Restore: ${results.msgpack[compression].restoreTime}ms`);
    console.log(`    File Size: ${(results.msgpack[compression].fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  New MsgPackR:`);
    console.log(`    Persist: ${results.msgpackr[compression].persistTime}ms`);
    console.log(`    Restore: ${results.msgpackr[compression].restoreTime}ms`);
    console.log(`    File Size: ${(results.msgpackr[compression].fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Improvements:`);
    console.log(`    Persist: ${persistImprovement}% faster`);
    console.log(`    Restore: ${restoreImprovement}% faster`);
    console.log(`    File Size: ${sizeImprovement}% smaller`);
  }
  
  log.info('\n✅ Benchmark completed!');
  console.log('\n✅ Benchmark completed!');
}

// Run the benchmark
main().catch(console.error);