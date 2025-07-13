# Potential Future Indexing and Searching Enhancements

Last updated: 2025-07-13

## Current Performance Baseline

**MsgPack + Gzip Compression (Current Implementation):**
- Local MsgPack decode: ~18.4 seconds (464MB decompressed)
- AWS Lambda MsgPack decode: ~41.4 seconds (same dataset)
- Local total restore: ~23.5 seconds
- AWS Lambda total restore: ~56.8 seconds

## Next Priority Enhancement: Switching from `@msgpack` --> `msgpackr`

**Goal:** Significantly improve the binary encode/decode step while avoiding Orama's built-in persistence limits.

**Background:** The original issue ([orama#851](https://github.com/oramasearch/orama/issues/851#issuecomment-2888461388)) was that Orama's built-in persistence hit JavaScript's 512MB string length limit due to `JSON.stringify()`. We solved this with MsgPack + compression, but it's still slower than we want. We really want a total local restore time of ~10 seconds, but most importantly, an AWS Lambda total restore time < 30 seconds

**Implementation Strategy:**

To be added by Agent. See docs:
https://www.npmjs.com/package/msgpackr / https://github.com/kriszyp/msgpackr/blob/master/README.md 

Most importantly: we should be adding a schema/structures to maximize performance. We can do this by observing the output of the Orama non-compressed, .json index file. Can see that file after running:

```shell
NODE_OPTIONS=--max-old-space-size=8192 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=myfavoritemurder --lambda=srt-indexing --env=local
```

Will be located at `aws-local-dev/s3/sites/myfavoritemurder/search-index/orama_index.msp`

(will need to do an uncompressed run to easily view this as JSON)

But it's very important that we add this functionality using structures/schema, so we can maximize the performance benefit of `msgpackr` - since the index file structure will always be the same for every site we index.

Once we have the encoding working with the SRT indexing Lambda, then we can start testing the search API Lambda that needs to decode

```shell
pnpm search-lambda:dev:health-check --site=myfavoritemurder 
```

Backwards compatibility is not important; we'll make sure everything is updated to the new method & deployed together once we've tested it. 

Benchmarks for the new approach are essential.

Important to review `packages/ingestion` and `package.json`