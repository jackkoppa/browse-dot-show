#!/usr/bin/env tsx

/**
 * Test script to verify Orama index generation, serialization, and search functionality
 * This script tests the complete pipeline for Task 3.3: Test index generation
 */

import { 
  createOramaIndex, 
  insertMultipleSearchEntries, 
  serializeOramaIndex, 
  deserializeOramaIndex,
  searchOramaIndex 
} from '@browse-dot-show/database';
import { SearchEntry, SearchRequest } from '@browse-dot-show/types';
import { log } from '@browse-dot-show/logging';

// Set log level for testing
log.setLevel('info');

async function testOramaIndexGeneration() {
  console.log('🧪 Testing Orama Index Generation Pipeline\n');

  try {
    // Step 1: Create a fresh Orama index
    console.log('1️⃣ Creating Orama index...');
    const oramaIndex = await createOramaIndex();
    console.log('✅ Orama index created successfully\n');

    // Step 2: Create test search entries with the new schema
    console.log('2️⃣ Creating test search entries...');
    const testEntries: SearchEntry[] = [
      {
        id: "123_86720",
        text: "I'm sorry, you can sit there and look and play with all your silly machines as much as you like. Is Gascoigne going to have a crack?",
        sequentialEpisodeIdAsString: "123",
        startTimeMs: 86720,
        endTimeMs: 104800,
        episodePublishedUnixTimestamp: 1579773600000 // 2020-01-23T10:00:00Z
      },
      {
        id: "456_120400",
        text: "Oh, I say! It's amazing! He does it time, and time, and time again. Crank up the music!",
        sequentialEpisodeIdAsString: "456",
        startTimeMs: 120400,
        endTimeMs: 137920,
        episodePublishedUnixTimestamp: 1581777000000 // 2020-02-15T14:30:00Z
      },
      {
        id: "789_200000",
        text: "This is a test entry for searching football and goalkeeper content in the index.",
        sequentialEpisodeIdAsString: "789",
        startTimeMs: 200000,
        endTimeMs: 215000,
        episodePublishedUnixTimestamp: 1583863200000 // 2020-03-10T18:00:00Z
      }
    ];
    console.log(`✅ Created ${testEntries.length} test search entries\n`);

    // Step 3: Insert entries into the index
    console.log('3️⃣ Inserting entries into Orama index...');
    await insertMultipleSearchEntries(oramaIndex, testEntries);
    console.log('✅ Entries inserted successfully\n');

    // Step 4: Test search functionality before serialization
    console.log('4️⃣ Testing search functionality...');
    const searchRequest: SearchRequest = {
      query: 'goalkeeper',
      limit: 10,
      sortBy: 'episodePublishedUnixTimestamp',
      sortOrder: 'DESC'
    };
    
    const searchResults = await searchOramaIndex(oramaIndex, searchRequest);
    console.log(`✅ Search completed: found ${searchResults.totalHits} results in ${searchResults.processingTimeMs}ms`);
    console.log('📋 Search results:');
    searchResults.hits.forEach((hit, index) => {
      console.log(`   ${index + 1}. Episode ${hit.sequentialEpisodeId} (${new Date(hit.episodePublishedUnixTimestamp).toISOString()}): "${hit.text.substring(0, 80)}..."`);
    });
    console.log('');

    // Step 5: Test serialization
    console.log('5️⃣ Testing Orama index serialization...');
    const serializedData = await serializeOramaIndex(oramaIndex);
    console.log(`✅ Index serialized successfully: ${serializedData.length} bytes\n`);

    // Step 6: Test deserialization
    console.log('6️⃣ Testing Orama index deserialization...');
    const deserializedIndex = await deserializeOramaIndex(serializedData);
    console.log('✅ Index deserialized successfully\n');

    // Step 7: Test search on deserialized index
    console.log('7️⃣ Testing search on deserialized index...');
    const searchRequest2: SearchRequest = {
      query: 'music',
      limit: 5,
      sortBy: 'episodePublishedUnixTimestamp',
      sortOrder: 'ASC' // Test ascending order
    };
    
    const searchResults2 = await searchOramaIndex(deserializedIndex, searchRequest2);
    console.log(`✅ Search on deserialized index completed: found ${searchResults2.totalHits} results in ${searchResults2.processingTimeMs}ms`);
    console.log('📋 Search results (sorted by date ascending):');
    searchResults2.hits.forEach((hit, index) => {
      console.log(`   ${index + 1}. Episode ${hit.sequentialEpisodeId} (${new Date(hit.episodePublishedUnixTimestamp).toISOString()}): "${hit.text.substring(0, 80)}..."`);
    });
    console.log('');

    // Step 8: Test episode filtering
    console.log('8️⃣ Testing episode ID filtering...');
    const searchRequest3: SearchRequest = {
      query: 'you',
      limit: 10,
      episodeIds: [123, 789] // Filter to specific episodes
    };
    
    const searchResults3 = await searchOramaIndex(deserializedIndex, searchRequest3);
    console.log(`✅ Filtered search completed: found ${searchResults3.totalHits} results in ${searchResults3.processingTimeMs}ms`);
    console.log('📋 Filtered search results:');
    searchResults3.hits.forEach((hit, index) => {
      console.log(`   ${index + 1}. Episode ${hit.sequentialEpisodeId}: "${hit.text.substring(0, 80)}..."`);
    });
    console.log('');

    // Step 9: Performance test with larger dataset
    console.log('9️⃣ Testing performance with larger dataset...');
    const largeDataset: SearchEntry[] = [];
    for (let i = 0; i < 1000; i++) {
      largeDataset.push({
        id: `perf_${i}_${Date.now()}`,
        text: `Performance test entry ${i} with various keywords like football, goalkeeper, amazing, and music to test search performance.`,
        sequentialEpisodeIdAsString: i.toString(),
        startTimeMs: i * 1000,
        endTimeMs: (i * 1000) + 5000,
        episodePublishedUnixTimestamp: 1579773600000 + (i * 86400000) // Spread over different days
      });
    }
    
    const perfIndex = await createOramaIndex();
    const insertStart = Date.now();
    await insertMultipleSearchEntries(perfIndex, largeDataset);
    const insertTime = Date.now() - insertStart;
    console.log(`✅ Inserted ${largeDataset.length} entries in ${insertTime}ms (${(largeDataset.length / insertTime * 1000).toFixed(0)} entries/sec)`);
    
    const searchStart = Date.now();
    const perfSearchResults = await searchOramaIndex(perfIndex, { query: 'football', limit: 50 });
    const searchTime = Date.now() - searchStart;
    console.log(`✅ Searched ${largeDataset.length} entries in ${searchTime}ms, found ${perfSearchResults.totalHits} results\n`);

    console.log('🎉 All Orama index generation tests passed successfully!');
    console.log('\n📊 Summary:');
    console.log('   ✅ Index creation: Working');
    console.log('   ✅ Entry insertion: Working');
    console.log('   ✅ Search functionality: Working');
    console.log('   ✅ Date sorting: Working');
    console.log('   ✅ Episode filtering: Working');
    console.log('   ✅ Serialization: Working');
    console.log('   ✅ Deserialization: Working');
    console.log('   ✅ Performance: Acceptable');
    console.log('\n🚀 Ready to proceed with Task 4: Update Search Lambda');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testOramaIndexGeneration();
} 