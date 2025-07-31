# Client Performance Issues - Analysis & Plan

## Current Client Structure
- **React Router** - Routes for HomePage and EpisodeRoute
- **Theme management** - Using `useTheme` hook
- **Episode overlay** - Child route for episode details
- **More complex than homepage** - Likely has search functionality, episode lists, audio players

## Potential Performance Issues to Investigate
1. **Similar to homepage issues:**
   - Unoptimized scroll handling in lists/search results
   - Unnecessary re-renders in components
   - Missing memoization for computed values
   - Theme management overhead

2. **Client-specific issues:**
   - **Episode list rendering** - Large lists of episodes
   - **Search performance** - Real-time search filtering
   - **Audio player** - Media controls and state management
   - **Route transitions** - Navigation performance
   - **Data fetching** - API calls and loading states

## Analysis Plan
1. **Explore codebase structure**
   - Identify main components (HomePage, EpisodeRoute, etc.)
   - Find scroll-heavy components (episode lists, search results)
   - Locate state management patterns
   
2. **Apply similar optimizations:**
   - Create `useOptimizedScroll` for list scrolling
   - Add `useOptimizedTheme` 
   - Memoize expensive computations
   - Add callback memoization
   
3. **Client-specific optimizations:**
   - **Virtualize long episode lists** if needed
   - **Debounce search input** for better UX
   - **Optimize audio player re-renders**
   - **Lazy load route components**

4. **Add minimal profiling infrastructure:**
   - Same pattern as homepage: off by default, `?profile=true` to enable
   - Focus on components that handle large datasets

## Identified Performance Issues
1. **Identical scroll handling problem** (lines 107-117) - Same unthrottled scroll events as homepage
2. **Complex search state** - 9+ state variables causing potential cascade re-renders  
3. **Unoptimized theme hook** - Same as homepage, excessive DOM manipulation
4. **Missing memoization** - All handlers recreated on every render
5. **Large list rendering** - Search results and full episode transcripts without virtualization
6. **Audio player state** - Frequent updates during playback

## Files to Modify (Minimal Changes)
### Core Performance Fixes
- `src/routes/HomePage.tsx` - Memoize handlers, optimize scroll, optimize search state
- `src/hooks/useTheme.ts` -> `useOptimizedTheme.ts` - Same as homepage optimization
- `src/components/SearchInput.tsx` - Memoize handlers 
- `src/components/SearchResults.tsx` - Memoize list rendering
- `src/components/FullEpisodeTranscript.tsx` - Optimize transcript rendering

### Profiling Infrastructure  
- `src/App.tsx` - Add minimal profiler wrapper
- Copy performance utilities from homepage
- `package.json` - Add `dev:with-profiling` script

## Success Metrics
- **HomePage render** - < 50ms (currently likely 100ms+)
- **Search results render** - < 30ms per result
- **Smooth scrolling** - 60fps in lists and transcript
- **Audio sync** - < 16ms updates during playback