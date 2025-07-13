# Potential Future Indexing and Searching Enhancements

Last updated: 2025-07-13

## Current Performance Baseline

**MsgPack + Gzip Compression (Current Implementation):**
- Local MsgPack decode: ~18.4 seconds (464MB decompressed)
- AWS Lambda MsgPack decode: ~41.4 seconds (same dataset)
- Local total restore: ~23.5 seconds
- AWS Lambda total restore: ~56.8 seconds

## Next Priority Enhancement: JSON + Compression (No MsgPack)

**Goal:** Eliminate the binary encode/decode step while avoiding Orama's built-in persistence limits.

**Background:** The original issue ([orama#851](https://github.com/oramasearch/orama/issues/851#issuecomment-2888461388)) was that Orama's built-in persistence hit JavaScript's 512MB string length limit due to `JSON.stringify()`. We solved this with MsgPack + compression, but now we want to test if JSON + compression can work without hitting the limits.

**Implementation Strategy:**
1. **Streaming JSON Serialization:** Use libraries like `stream-json` or `@discoveryjs/json-ext` to avoid loading entire JSON string into memory
2. **Chunked JSON Writing:** Break large JSON into smaller chunks during serialization
3. **Direct Gzip Stream:** Pipe JSON directly to gzip compression without intermediate string storage
4. **Streaming JSON Parsing:** Parse compressed JSON in chunks during restoration

**Expected Benefits:**
- Eliminate 18+ second MsgPack decode step
- Simpler data flow (no binary encoding/decoding)
- Potentially better compression ratios with JSON
- Easier debugging (JSON is human-readable when decompressed)

**Files to Modify:**
- `packages/database/database.ts`: Add JSON streaming persistence functions
- `packages/search/search-lambda/search-indexed-transcripts.ts`: Switch to JSON restoration

## Potential Future Optimizations (only after completing & testing the above)

**Try out alternative compression**
- We've already tested `brotli` - it's definitively worse for this case than `gzip`
- As time allows, let's try out https://github.com/facebook/zstd - likely using this NPM package - https://github.com/mongodb-js/zstd - we'll add that alongside `gzip` and `none` as compression options, and compare the results for both the indexing Lambda **and* the search Lambda, when done with `gzip` vs. `zstd` 

## Very Unlikely Future Optimizations (Low priority / Not planning to do these. Only if absolutely needed to consider)

### MsgPack-Specific Optimizations (If Staying with MsgPack)
- **rawStrings: true**: Skip UTF-8 decoding if Orama can handle Uint8Array strings
- **Alternative MsgPack libraries**: Test `msgpack-lite` or other implementations
- **Custom extension codecs**: Optimize specific data types in the payload

### Alternative Serialization Formats
- **Protocol Buffers**: More efficient binary serialization with schema definition
- **FlatBuffers**: Zero-copy serialization for faster access patterns
- **CBOR**: Compact binary representation similar to MsgPack but potentially faster

### Compression Strategy Improvements
- **Brotli compression**: Often 20-30% better compression than gzip (note: initial compression is slower)
- **Pre-compressed chunks**: Compress individual sections rather than the whole file
- **LZ4 compression**: Faster decompression than gzip, trades compression ratio for speed

### Data Structure Optimizations
- **String interning**: Deduplicate repeated strings in the dataset before serialization
- **Smaller field names**: Use shorter keys in objects (e.g., "t" instead of "text")
- **Reduce nested depth**: Flatten complex objects to reduce parser overhead
- **Delta compression**: Store only differences between similar entries

### Memory and Processing Optimizations
- **Worker threads**: Offload decompression/decoding to separate threads
- **Memory-mapped files**: Avoid loading entire file into memory (Node.js specific)
- **Streaming with smaller chunks**: Process data in smaller increments
- **Lazy loading**: Only load frequently accessed parts initially

### Index Architecture Changes
- **Index chunking**: Split the index into smaller parts loaded on demand
- **Partial restoration**: Load only essential data first, then background load the rest
- **Multi-tier caching**: Keep hot data in memory, warm data compressed, cold data on disk

### AWS Lambda Specific Optimizations
- **Provisioned concurrency**: Eliminate cold starts entirely
- **EFS mounting**: Store index on persistent storage to avoid S3 downloads
- **Lambda layers**: Pre-load common dependencies to reduce package size
- **ARM64 optimization**: Ensure all dependencies are optimized for ARM architecture

## Investigation Notes

- **Local vs Lambda performance gap**: 2x slower on Lambda despite similar hardware (ARM64, 8GB memory)
- **Current bottleneck**: MsgPack decoding takes 65% of total restore time
- **Memory efficiency**: Streaming decompression works well (1.5s for 464MB)
- **Compression effectiveness**: Gzip reduces 464MB to 153MB (67% reduction)

## Success Metrics

**Target Goals:**
- **Primary:** MsgPack decode under 15 seconds (currently 18.4s local, 41.4s Lambda)
- **Stretch:** Total restore under 20 seconds (currently 23.5s local, 56.8s Lambda)
- **Ultimate:** Lambda cold start under 30 seconds total

**Next Steps:**
1. Implement JSON + compression approach
2. Test performance vs current MsgPack approach
3. If successful, deploy and measure AWS Lambda performance
4. Consider other optimizations only if JSON approach doesn't meet targets