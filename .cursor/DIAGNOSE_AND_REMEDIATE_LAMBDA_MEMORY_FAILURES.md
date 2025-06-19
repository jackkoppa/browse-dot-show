# Lambda Memory Failure Investigation & Remediation

## 🎯 CONCLUSION: ROOT CAUSE IDENTIFIED

**Issue**: Orama index deserialization requires ~6.5x memory expansion
**Solution**: Increase AWS Lambda memory limits (pending AWS Support ticket)

## Next Steps Options (In Priority Order)

### 1. **AWS Memory Limit Increase** ⭐ **(RECOMMENDED - IN PROGRESS)**
- Current limit: 3008MB per Lambda
- Request: 5120MB+ per Lambda  
- Cost impact: Minimal for our usage
- Timeline: Waiting on AWS Support response

### 2. **Index Optimization** (If AWS increase delayed)
- Investigate Orama compression options
- Consider index chunking/sharding strategies
- Explore alternative search backends (Elasticsearch, etc.)

### 3. **Memory Management Optimization** (Limited impact expected)
- Streaming deserialization (if possible with Orama)
- More aggressive garbage collection
- Memory-mapped file access

---

## Problem Summary
Search Lambda functions are experiencing `Runtime.OutOfMemory` errors for sites with larger index files:

**Working Sites:**
- hardfork: 101.4 MB index
- listenfairplay: 244.6 MB index

**Failing Sites:**
- naddpod: 404.1 MB index (385.38 MB on disk)
- claretandblue: 410 MB index

**Current Lambda Memory Limit:** 3008 MB (AWS account limit)
**Error Pattern:** Memory usage hits exactly 3008 MB during Orama index deserialization

## Investigation Hypothesis
The memory consumption is significantly higher than the raw file size, suggesting:
1. **Deserialization overhead**: Orama index expansion during deserialization
2. **In-memory representation overhead**: Object structure vs serialized binary
3. **Temporary memory spikes**: During file reading + deserialization simultaneously
4. **Node.js/V8 memory overhead**: Garbage collection delays, object allocation patterns

## Debugging Plan

### Phase 1: Memory Monitoring & Measurement
- [ ] Add memory usage logging at key checkpoints
- [ ] Monitor memory before/after each major operation
- [ ] Track memory growth patterns during deserialization
- [ ] Compare memory usage between working vs failing sites

### Phase 2: Identify Memory Bottlenecks
- [ ] Measure memory during file download vs deserialization
- [ ] Check if multiple copies of data exist in memory simultaneously
- [ ] Investigate Orama index structure and memory multiplier
- [ ] Profile memory allocation patterns

### Phase 3: Optimization Strategies
- [ ] Streaming deserialization (if possible with Orama)
- [ ] Force garbage collection at strategic points
- [ ] Optimize file handling to avoid duplicates in memory
- [ ] Consider compression/decompression trade-offs

### Phase 4: Alternative Solutions
- [ ] Index chunking/sharding strategies
- [ ] External search service integration
- [ ] Lambda memory limit increase (pending AWS support)
- [ ] Pre-warmed Lambda containers with cached indexes

## Next Steps
1. Add comprehensive memory logging to the search lambda
2. Test locally with naddpod/claretandblue indexes
3. Run controlled AWS Lambda tests with enhanced logging
4. Analyze memory usage patterns and identify optimization opportunities

## Memory Monitoring Code Changes

### Added Comprehensive Memory Logging
✅ **Implemented in search-indexed-transcripts.ts:**

1. **Memory Utility Functions:**
   - `getMemoryUsage()`: Captures RSS, HeapTotal, HeapUsed, External, ArrayBuffers
   - `logMemoryUsage()`: Logs memory at specific stages with context
   - `forceGarbageCollection()`: Manually triggers GC when available

2. **Key Monitoring Points:**
   - **Handler Entry**: Baseline memory when Lambda starts
   - **Before/After Index Init**: Track memory during index initialization
   - **Before/After S3 Download**: Monitor memory during file download
   - **After File Write**: Memory after saving to /tmp
   - **Before/After File Read**: Memory when reading from /tmp
   - **Before/After Orama Deserialization**: Critical point where OOM likely occurs
   - **Search Execution**: Memory during actual search operations

3. **Memory Management Optimizations:**
   - Explicit null assignment of large buffers after use
   - Forced garbage collection at strategic points
   - Memory logging before/after GC operations

### Testing Protocol

#### Local Testing:
```bash
# Test with problematic sites locally
cd packages/search/search-lambda
pnpm search-lambda:dev:local

# Run with garbage collection enabled
node --expose-gc dist/search-indexed-transcripts.js
```

#### AWS Testing:
1. Deploy updated Lambda with memory logging
2. Test with naddpod/claretandblue sites
3. Monitor CloudWatch logs for memory patterns
4. Compare memory usage between working vs failing sites

### Expected Memory Pattern Investigation

**Hypothesis to Test:**
- File download: ~400MB buffer
- File on disk: ~400MB 
- File read into memory: ~400MB buffer (total: ~800MB)
- Orama deserialization: Likely 3-7x expansion (1.2GB - 2.8GB total)
- **Critical point**: During deserialization when both serialized and deserialized data exist

**Key Questions:**
1. What's the memory multiplier during Orama deserialization?
2. Are multiple copies of data existing simultaneously?
3. Is garbage collection being delayed during critical operations?
4. Can we optimize the deserialization process?

## 📊 Memory Analysis Results

### Local Test Results (naddpod - 385.38MB index)
```
Handler Entry:           RSS=128.84MB
After S3 Download:       RSS=459.03MB  (+330MB for 385MB file)
Before Deserialization: RSS=460.44MB  
After Deserialization:  RSS=2500.55MB (+2040MB = 6.5x expansion!)
```

### AWS Lambda Results (naddpod - 385.38MB index)
```
Handler Entry:           RSS=59.42MB
After S3 Download:       RSS=877.58MB  (+814MB - higher overhead than local)
Before Deserialization: RSS=871.18MB
FAILURE: Runtime.OutOfMemory during deserialization (hit 3004MB limit)
```

### Key Findings:
✅ **Memory multiplier confirmed**: ~6.5x expansion during Orama deserialization  
✅ **Failure point identified**: During `deserializeOramaIndex()` call  
✅ **AWS vs Local**: AWS has higher overhead but same deserialization issue  
✅ **Size calculations**:
- **naddpod (385MB)**: 871MB + (385MB × 6.5) = ~3,373MB ❌ **Exceeds 3008MB limit**
- **claretandblue (410MB)**: Would need ~3,500MB ❌ **Also exceeds limit**
- **hardfork (101MB)**: 871MB + (101MB × 6.5) = ~1,537MB ✅ **Within limit**
- **listenfairplay (244MB)**: 871MB + (244MB × 6.5) = ~2,457MB ✅ **Within limit**

## 🏁 Investigation Complete

### Status: ✅ **ROOT CAUSE CONFIRMED**
- **Primary Issue**: Orama deserialization requires 6.5x memory expansion
- **Solution**: AWS Lambda memory limit increase from 3008MB → 5120MB+
- **Code Changes**: Memory logging added (debug-level only) for future monitoring

### Final Actions Taken:
1. ✅ Comprehensive memory logging implemented
2. ✅ Local testing completed - confirmed 6.5x memory multiplier  
3. ✅ AWS testing completed - confirmed same issue in production
4. ✅ Memory logging switched to debug-level to avoid performance impact
5. ⏳ **AWS Support ticket pending** for memory limit increase

### Ready for AWS Memory Increase:
- All debugging infrastructure in place
- Issue fully understood and documented
- No further investigation needed until AWS responds