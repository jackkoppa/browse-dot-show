# 2025-07-12 - Testing

## with `brotli`

### `NODE_OPTIONS=--max-old-space-size=8192 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=myfavoritemurder --lambda=srt-indexing`

#### TOTAL: 693.3s
#### Size: 91.11 MB

```shell
➜  browse-dot-show git:(jackkoppa-homepage-and-site-styling-fixes) ✗ NODE_OPTIONS=--max-old-space-size=8192 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=myfavoritemurder --lambda=srt-indexing --env=local
🚀 Lambda Trigger Tool - Run Ingestion Functions
==================================================
No sites in my-sites/, using 6 site(s) from origin-sites/

📍 Execution Summary:
   Lambda Function: SRT to Search Index Conversion
   Environment: local
   Sites: myfavoritemurder
   Execution Mode: Local (tsx)

💡 Equivalent CLI command:
   NODE_OPTIONS=--max-old-space-size=8192 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=myfavoritemurder --lambda=srt-indexing --env=local

========================================
Processing site: myfavoritemurder (My Favorite Murder)
========================================
🚀 Running SRT to Search Index Conversion locally for site: myfavoritemurder
▶️ Starting convert-srts-indexed-search, with logging level: 2
🟢 Starting convert-srts-indexed-search > handler, with logging level: 2
⏱️ Starting at 2025-07-12T20:31:58.014Z
Fetching episode manifest from S3: sites/myfavoritemurder/episode-manifest/full-episode-manifest.json
Successfully loaded and parsed 1022 episodes from manifest.
Creating fresh Orama search index
Successfully created Orama search index
Created fresh Orama search index
🧠 Memory usage at after creating fresh Orama index:
   RSS (Resident Set Size): 128.16 MB
   Heap Used: 19.52 MB
   Heap Total: 35.03 MB
   External: 5.48 MB
[DEBUG] listDirectories('sites/myfavoritemurder/transcripts/') returned 1 podcast directories.
[DEBUG] Total SRT files found across all podcast directories: 1022
Found 1022 total SRT files to evaluate for indexing.

🔄 Progress: 5% of SRT files processed (52/1022).
Elapsed time: 0.13s.
Collected 21059 entries so far...


🔄 Progress: 10% of SRT files processed (103/1022).
Elapsed time: 0.25s.
Collected 42857 entries so far...


🔄 Progress: 15% of SRT files processed (154/1022).
Elapsed time: 0.37s.
Collected 63723 entries so far...


🔄 Progress: 20% of SRT files processed (205/1022).
Elapsed time: 0.49s.
Collected 83785 entries so far...


🔄 Progress: 25% of SRT files processed (256/1022).
Elapsed time: 0.60s.
Collected 103782 entries so far...


🔄 Progress: 30% of SRT files processed (307/1022).
Elapsed time: 0.72s.
Collected 123357 entries so far...


🔄 Progress: 35% of SRT files processed (358/1022).
Elapsed time: 0.83s.
Collected 142019 entries so far...


🔄 Progress: 40% of SRT files processed (409/1022).
Elapsed time: 0.95s.
Collected 161907 entries so far...


🔄 Progress: 45% of SRT files processed (460/1022).
Elapsed time: 1.07s.
Collected 181544 entries so far...


🔄 Progress: 50% of SRT files processed (511/1022).
Elapsed time: 1.19s.
Collected 201865 entries so far...


🔄 Progress: 55% of SRT files processed (563/1022).
Elapsed time: 1.30s.
Collected 221100 entries so far...


🔄 Progress: 60% of SRT files processed (614/1022).
Elapsed time: 1.42s.
Collected 238090 entries so far...


🔄 Progress: 65% of SRT files processed (665/1022).
Elapsed time: 1.53s.
Collected 255589 entries so far...


🔄 Progress: 70% of SRT files processed (716/1022).
Elapsed time: 1.65s.
Collected 271576 entries so far...


🔄 Progress: 75% of SRT files processed (767/1022).
Elapsed time: 1.76s.
Collected 289688 entries so far...


🔄 Progress: 80% of SRT files processed (818/1022).
Elapsed time: 1.88s.
Collected 306531 entries so far...


🔄 Progress: 85% of SRT files processed (869/1022).
Elapsed time: 1.99s.
Collected 324033 entries so far...


🔄 Progress: 90% of SRT files processed (920/1022).
Elapsed time: 2.12s.
Collected 343060 entries so far...


🔄 Progress: 95% of SRT files processed (971/1022).
Elapsed time: 2.24s.
Collected 362520 entries so far...


🔄 Progress: 100% of SRT files processed (1022/1022).
Elapsed time: 2.36s.
Collected 382559 entries so far...

[DEBUG] ✅ No duplicate ids found
Inserting all 382559 entries into Orama index in single batch...
🧠 Memory usage at before inserting all entries into Orama index:
   RSS (Resident Set Size): 287.30 MB
   Heap Used: 152.62 MB
   Heap Total: 187.72 MB
   External: 6.58 MB
Successfully inserted 382559 search entries
All entries inserted into Orama index in 35.42s
🧠 Memory usage at after inserting all entries into Orama index:
   RSS (Resident Set Size): 4886.92 MB
   Heap Used: 4256.25 MB
   Heap Total: 4790.28 MB
   External: 5.55 MB
Persisting Orama index using streaming approach to /tmp/orama_index_myfavoritemurder.msp...
🧠 Memory usage at before attempting to persist Orama index with streaming:
   RSS (Resident Set Size): 4886.92 MB
   Heap Used: 4256.26 MB
   Heap Total: 4790.28 MB
   External: 5.55 MB
Starting streaming persistence to /tmp/orama_index_myfavoritemurder.msp with brotli compression
Successfully exported Orama database for streaming
MsgPack buffer size: 464.44 MB



 
Successfully persisted Orama database to /tmp/orama_index_myfavoritemurder.msp (91.11 MB)
🧠 Memory usage at after persisting Orama index to file with streaming:
   RSS (Resident Set Size): 1692.70 MB
   Heap Used: 4525.05 MB
   Heap Total: 4828.27 MB
   External: 527.78 MB
Uploading Orama index from /tmp/orama_index_myfavoritemurder.msp to S3 at sites/myfavoritemurder/search-index/orama_index.msp...
Orama index successfully saved and exported to S3: sites/myfavoritemurder/search-index/orama_index.msp
New entries (382559) were added, but skipping search-api-myfavoritemurder invocation (running locally).
Cleaned up local Orama index file: /tmp/orama_index_myfavoritemurder.msp

📊 SRT Processing Summary:

⏱️  Total Duration: 692.37 seconds

📁 Total SRT Files Found: 1022
✅ Successfully Processed: 1022
📝 New Search Entries Added: 382559

✨ Completed successfully.
{
  status: 'success',
  message: 'Completed successfully.',
  evaluatedSrtFiles: 1022,
  totalSrtFiles: 1022,
  newEntriesAdded: 382559
}
✅ ✅ SRT to Search Index Conversion completed successfully for myfavoritemurder (693.3s)

==================================================
📊 Final Summary
==================================================

📈 Results:
   ✅ myfavoritemurder: 693.3s

📊 Overall Statistics:
   Success Rate: 1/1 (100.0%)
   Total Duration: 693.3s
   Function: SRT to Search Index Conversion
   Environment: local

🎉 All operations completed successfully!
➜  browse-dot-show git:(jackkoppa-homepage-and-site-styling-fixes) ✗ 
```


### `pnpm search-lambda:dev:health-check`

#### TOTAL: 22.37s

```shell
browse-dot-show git:(jackkoppa-homepage-and-site-styling-fixes) ✗ pnpm search-lambda:dev:health-check

> browse-dot-show@0.0.1 search-lambda:dev:health-check /Users/jackkoppa/Personal_Development/browse-dot-show
> NODE_OPTIONS=--max-old-space-size=8192 tsx scripts/run-with-site-selection.ts "search lambda (local health check)" "pnpm --filter @browse-dot-show/search-lambda dev:health-check"

🌐 Selecting site for search lambda (local health check)...
No sites in my-sites/, using 6 site(s) from origin-sites/
✔ Select site for search lambda (local health check): › My Favorite Murder (myfavoritemurder.browse.show)
📍 Selected site: myfavoritemurder
🚀 Running: pnpm --filter @browse-dot-show/search-lambda dev:health-check 
   With site: myfavoritemurder

> @browse-dot-show/search-lambda@0.0.1 dev:health-check /Users/jackkoppa/Personal_Development/browse-dot-show/packages/search/search-lambda
> tsx health-check.ts

=== Search Lambda Health Check Starting ===
Health check started at: 2025-07-12T20:14:40.069Z
Calling search handler with health check event...
Search request received: {"isHealthCheckOnly":true,"forceFreshDBFileDownload":false}
Initializing Orama search index from S3...
Downloading Orama index from S3 (sites/myfavoritemurder/search-index/orama_index.msp) to local path (/tmp/orama_index_myfavoritemurder.msp)
Successfully downloaded and saved Orama index to /tmp/orama_index_myfavoritemurder.msp
Orama index file size: 95536535 bytes (91.11 MB)
Garbage collection not available (run with --expose-gc for manual GC)
Starting streaming restore from /tmp/orama_index_myfavoritemurder.msp with brotli compression
Database schema created in 1ms
Compressed file read in 19ms, compressed size: 91.11 MB
Brotli decompression completed in 1168ms, decompressed size: 464.44 MB
MsgPack decode completed in 18371ms
Orama database load completed in 2734ms
Successfully restored Orama database from /tmp/orama_index_myfavoritemurder.msp in 22293ms total
⏱️ Restore timing breakdown: File read + decompress: 1187ms, MsgPack decode: 21105ms, Orama load: 2734ms
Orama search index loaded in 22367ms
Garbage collection not available (run with --expose-gc for manual GC)
Search options: {"term":"","limit":10,"offset":0,"properties":["text"],"threshold":0,"exact":true}
Search completed in 2ms, found 0 results for query: ""
Health check completed at: 2025-07-12T20:15:02.439Z
Total elapsed time: 22370ms (22.37s)
Lambda internal processing time: 2ms
=== Search Lambda Health Check Complete ===
➜  browse-dot-show git:(jackkoppa-homepage-and-site-styling-fixes) ✗ 
```

---


## with `gzip`

### `NODE_OPTIONS=--max-old-space-size=8192 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=myfavoritemurder --lambda=srt-indexing`

#### TOTAL: 58.9s
#### Size: 152.99 MB

```shell
➜  browse-dot-show git:(jackkoppa-homepage-and-site-styling-fixes) ✗ NODE_OPTIONS=--max-old-space-size=8192 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=myfavoritemurder --lambda=srt-indexing --env=local
🚀 Lambda Trigger Tool - Run Ingestion Functions
==================================================
No sites in my-sites/, using 6 site(s) from origin-sites/

📍 Execution Summary:
   Lambda Function: SRT to Search Index Conversion
   Environment: local
   Sites: myfavoritemurder
   Execution Mode: Local (tsx)

💡 Equivalent CLI command:
   NODE_OPTIONS=--max-old-space-size=8192 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=myfavoritemurder --lambda=srt-indexing --env=local

========================================
Processing site: myfavoritemurder (My Favorite Murder)
========================================
🚀 Running SRT to Search Index Conversion locally for site: myfavoritemurder
▶️ Starting convert-srts-indexed-search, with logging level: 2
🟢 Starting convert-srts-indexed-search > handler, with logging level: 2
⏱️ Starting at 2025-07-12T20:48:56.430Z
Fetching episode manifest from S3: sites/myfavoritemurder/episode-manifest/full-episode-manifest.json
Successfully loaded and parsed 1022 episodes from manifest.
Creating fresh Orama search index
Successfully created Orama search index
Created fresh Orama search index
🧠 Memory usage at after creating fresh Orama index:
   RSS (Resident Set Size): 138.13 MB
   Heap Used: 19.51 MB
   Heap Total: 34.53 MB
   External: 5.48 MB
[DEBUG] listDirectories('sites/myfavoritemurder/transcripts/') returned 1 podcast directories.
[DEBUG] Total SRT files found across all podcast directories: 1022
Found 1022 total SRT files to evaluate for indexing.

🔄 Progress: 5% of SRT files processed (52/1022).
Elapsed time: 0.14s.
Collected 21059 entries so far...


🔄 Progress: 10% of SRT files processed (103/1022).
Elapsed time: 0.25s.
Collected 42857 entries so far...


🔄 Progress: 15% of SRT files processed (154/1022).
Elapsed time: 0.37s.
Collected 63723 entries so far...


🔄 Progress: 20% of SRT files processed (205/1022).
Elapsed time: 0.49s.
Collected 83785 entries so far...


🔄 Progress: 25% of SRT files processed (256/1022).
Elapsed time: 0.60s.
Collected 103782 entries so far...


🔄 Progress: 30% of SRT files processed (307/1022).
Elapsed time: 0.73s.
Collected 123357 entries so far...


🔄 Progress: 35% of SRT files processed (358/1022).
Elapsed time: 0.84s.
Collected 142019 entries so far...


🔄 Progress: 40% of SRT files processed (409/1022).
Elapsed time: 0.96s.
Collected 161907 entries so far...


🔄 Progress: 45% of SRT files processed (460/1022).
Elapsed time: 1.08s.
Collected 181544 entries so far...


🔄 Progress: 50% of SRT files processed (511/1022).
Elapsed time: 1.20s.
Collected 201865 entries so far...


🔄 Progress: 55% of SRT files processed (563/1022).
Elapsed time: 1.32s.
Collected 221100 entries so far...


🔄 Progress: 60% of SRT files processed (614/1022).
Elapsed time: 1.44s.
Collected 238090 entries so far...


🔄 Progress: 65% of SRT files processed (665/1022).
Elapsed time: 1.56s.
Collected 255589 entries so far...


🔄 Progress: 70% of SRT files processed (716/1022).
Elapsed time: 1.68s.
Collected 271576 entries so far...


🔄 Progress: 75% of SRT files processed (767/1022).
Elapsed time: 1.80s.
Collected 289688 entries so far...


🔄 Progress: 80% of SRT files processed (818/1022).
Elapsed time: 1.92s.
Collected 306531 entries so far...


🔄 Progress: 85% of SRT files processed (869/1022).
Elapsed time: 2.03s.
Collected 324033 entries so far...


🔄 Progress: 90% of SRT files processed (920/1022).
Elapsed time: 2.15s.
Collected 343060 entries so far...


🔄 Progress: 95% of SRT files processed (971/1022).
Elapsed time: 2.27s.
Collected 362520 entries so far...


🔄 Progress: 100% of SRT files processed (1022/1022).
Elapsed time: 2.39s.
Collected 382559 entries so far...

[DEBUG] ✅ No duplicate ids found
Inserting all 382559 entries into Orama index in single batch...
🧠 Memory usage at before inserting all entries into Orama index:
   RSS (Resident Set Size): 308.84 MB
   Heap Used: 165.78 MB
   Heap Total: 201.66 MB
   External: 6.72 MB
Successfully inserted 382559 search entries
All entries inserted into Orama index in 31.60s
🧠 Memory usage at after inserting all entries into Orama index:
   RSS (Resident Set Size): 3536.84 MB
   Heap Used: 4829.94 MB
   Heap Total: 4934.27 MB
   External: 5.54 MB
Persisting Orama index using streaming approach to /tmp/orama_index_myfavoritemurder.msp...
🧠 Memory usage at before attempting to persist Orama index with streaming:
   RSS (Resident Set Size): 3536.84 MB
   Heap Used: 4829.95 MB
   Heap Total: 4934.27 MB
   External: 5.54 MB
Starting streaming persistence to /tmp/orama_index_myfavoritemurder.msp with gzip compression
Successfully exported Orama database for streaming
MsgPack buffer size: 464.44 MB
Successfully persisted Orama database to /tmp/orama_index_myfavoritemurder.msp (152.99 MB)
🧠 Memory usage at after persisting Orama index to file with streaming:
   RSS (Resident Set Size): 4813.31 MB
   Heap Used: 4585.61 MB
   Heap Total: 4955.70 MB
   External: 549.30 MB
Uploading Orama index from /tmp/orama_index_myfavoritemurder.msp to S3 at sites/myfavoritemurder/search-index/orama_index.msp...
Orama index successfully saved and exported to S3: sites/myfavoritemurder/search-index/orama_index.msp
New entries (382559) were added, but skipping search-api-myfavoritemurder invocation (running locally).
Cleaned up local Orama index file: /tmp/orama_index_myfavoritemurder.msp

📊 SRT Processing Summary:

⏱️  Total Duration: 57.90 seconds

📁 Total SRT Files Found: 1022
✅ Successfully Processed: 1022
📝 New Search Entries Added: 382559

✨ Completed successfully.
{
  status: 'success',
  message: 'Completed successfully.',
  evaluatedSrtFiles: 1022,
  totalSrtFiles: 1022,
  newEntriesAdded: 382559
}
✅ ✅ SRT to Search Index Conversion completed successfully for myfavoritemurder (58.9s)

==================================================
📊 Final Summary
==================================================

📈 Results:
   ✅ myfavoritemurder: 58.9s

📊 Overall Statistics:
   Success Rate: 1/1 (100.0%)
   Total Duration: 58.9s
   Function: SRT to Search Index Conversion
   Environment: local

🎉 All operations completed successfully!
➜  browse-dot-show git:(jackkoppa-homepage-and-site-styling-fixes) ✗ 
```


### `pnpm search-lambda:dev:health-check`

#### TOTAL: 22.28s

```
➜  browse-dot-show git:(jackkoppa-homepage-and-site-styling-fixes) ✗ pnpm search-lambda:dev:health-check                 

> browse-dot-show@0.0.1 search-lambda:dev:health-check /Users/jackkoppa/Personal_Development/browse-dot-show
> NODE_OPTIONS=--max-old-space-size=8192 tsx scripts/run-with-site-selection.ts "search lambda (local health check)" "pnpm --filter @browse-dot-show/search-lambda dev:health-check"

🌐 Selecting site for search lambda (local health check)...
No sites in my-sites/, using 6 site(s) from origin-sites/
✔ Select site for search lambda (local health check): › My Favorite Murder (myfavoritemurder.browse.show)
📍 Selected site: myfavoritemurder
🚀 Running: pnpm --filter @browse-dot-show/search-lambda dev:health-check 
   With site: myfavoritemurder

> @browse-dot-show/search-lambda@0.0.1 dev:health-check /Users/jackkoppa/Personal_Development/browse-dot-show/packages/search/search-lambda
> tsx health-check.ts

=== Search Lambda Health Check Starting ===
Health check started at: 2025-07-12T20:52:14.194Z
Calling search handler with health check event...
Search request received: {"isHealthCheckOnly":true,"forceFreshDBFileDownload":false}
Initializing Orama search index from S3...
Downloading Orama index from S3 (sites/myfavoritemurder/search-index/orama_index.msp) to local path (/tmp/orama_index_myfavoritemurder.msp)
Successfully downloaded and saved Orama index to /tmp/orama_index_myfavoritemurder.msp
Orama index file size: 160425204 bytes (152.99 MB)
Garbage collection not available (run with --expose-gc for manual GC)
Starting streaming restore from /tmp/orama_index_myfavoritemurder.msp with gzip compression
Database schema created in 1ms
Compressed file read in 29ms, compressed size: 152.99 MB
Gzip decompression completed in 1316ms, decompressed size: 464.44 MB
MsgPack decode completed in 18079ms
Orama database load completed in 2753ms
Successfully restored Orama database from /tmp/orama_index_myfavoritemurder.msp in 22178ms total
⏱️ Restore timing breakdown: File read + decompress: 1345ms, MsgPack decode: 20832ms, Orama load: 2753ms
Orama search index loaded in 22275ms
Garbage collection not available (run with --expose-gc for manual GC)
Search options: {"term":"","limit":10,"offset":0,"properties":["text"],"threshold":0,"exact":true}
Search completed in 1ms, found 0 results for query: ""
Health check completed at: 2025-07-12T20:52:36.471Z
Total elapsed time: 22277ms (22.28s)
Lambda internal processing time: 1ms
=== Search Lambda Health Check Complete ===
➜  browse-dot-show git:(jackkoppa-homepage-and-site-styling-fixes) ✗ 
```


---

## with `zstd`

**Update: skipping this for now, gzip looks like it will be sufficient**

### `NODE_OPTIONS=--max-old-space-size=8192 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=myfavoritemurder --lambda=srt-indexing`

#### TOTAL: XXs


### `pnpm search-lambda:dev:health-check`

#### TOTAL: XXs


---


## with `none`

### `NODE_OPTIONS=--max-old-space-size=8192 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=myfavoritemurder --lambda=srt-indexing`

#### TOTAL: XXs


### `pnpm search-lambda:dev:health-check`

#### TOTAL: XXs


---