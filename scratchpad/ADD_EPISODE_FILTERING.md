# Episode Filtering Implementation Plan

## Overview
Add episode-based filtering to the existing search functionality, allowing users to filter search results by selecting one or more specific episodes. This will extend the current filter sheet with a multi-select, searchable command box that filters by episode IDs using the existing `sequentialEpisodeIdAsString` field in search entries.

## Current Architecture Context

Based on the successful date filtering implementation, we have:
- **Backend**: Orama search with `where` clause filtering using `between`, `gte`, `lte`, and `in` operators
- **Frontend**: Working responsive filter sheet with `SearchFilters` and `SearchFiltersSheet` components
- **Data Structure**: Search entries contain `sequentialEpisodeIdAsString` field for episode identification
- **Episode Data**: Episode manifest provides episode titles, IDs, and metadata via `useEpisodeManifest` hook
- **URL State**: Proven URL parameter management for filter persistence
- **UI Components**: Available `Command`, `Badge`, `Button`, `Popover` components in UI package

## Implementation Plan Overview

### Phase 1: Extend Type Definitions ✅ **COMPLETED**
- ✅ **SearchRequest Interface**: Added `episodeIds?: string[]` parameter to [`packages/types/search.ts`](packages/types/search.ts)
- ✅ **Client Types**: Added `EpisodeSelection` interface to [`packages/client/src/types/search.ts`](packages/client/src/types/search.ts)
- ✅ **Database Integration**: Added `episodeIds` parameter extraction in [`packages/database/database.ts`](packages/database/database.ts)

### Phase 2: Backend Implementation ✅ **COMPLETED**
- ✅ **Database Layer**: Implemented Orama `in` operator filtering in [`packages/database/database.ts`](packages/database/database.ts)
- ✅ **Search Lambda**: Added episode ID parameter parsing in [`packages/search/search-lambda/search-indexed-transcripts.ts`](packages/search/search-lambda/search-indexed-transcripts.ts)
- ✅ **Build & Test**: Rebuilt packages successfully with no compilation errors

### Phase 3: UI Components ✅ **COMPLETED**
- ✅ **Episode Selector Component**: Created multi-select episode picker using [`packages/ui/components/command.tsx`](packages/ui/components/command.tsx)
- ✅ **Episode Search**: Implemented fuzzy search through episode titles from episode manifest
- ✅ **Selection Display**: Show selected episodes with [`packages/ui/components/badge.tsx`](packages/ui/components/badge.tsx) and remove functionality

### Phase 4: Frontend Integration ✅ **COMPLETED**
- ✅ **SearchFilters Component**: Added episode selector to existing [`packages/client/src/components/SearchFilters.tsx`](packages/client/src/components/SearchFilters.tsx)
- ✅ **State Management**: Extended date range state to include episode selection in [`packages/client/src/routes/HomePage.tsx`](packages/client/src/routes/HomePage.tsx)
- ✅ **URL Persistence**: Added episode IDs to URL parameters (comma-separated format)
- ✅ **Search API**: Included episode filtering in [`packages/client/src/utils/search.ts`](packages/client/src/utils/search.ts)

### Phase 5: UX Enhancements ⏸️ **PENDING**
- ⏸️ **Episode Grouping**: Consider grouping by date ranges or seasons
- ⏸️ **Quick Actions**: Add "Select All", "Clear All" functionality  
- ⏸️ **Performance**: Implement virtualization for large episode lists
- ⏸️ **Search Optimization**: Debounce episode title search

## Current Implementation Status

### ✅ **Completed (All Core Phases)**

#### Phase 1: Type Definitions ✅
- **Backend Types**: Extended `SearchRequest` interface in [`packages/types/search.ts`](packages/types/search.ts)
- **Frontend Types**: Added `EpisodeSelection` interface in [`packages/client/src/types/search.ts`](packages/client/src/types/search.ts)
- **Database Integration**: Added parameter extraction in [`packages/database/database.ts`](packages/database/database.ts)

#### Phase 2: Backend Implementation ✅
- **Database Layer**: Implemented Orama `in` operator filtering for episode IDs
- **Search Lambda**: Added episode ID parameter parsing for GET, POST, and direct invocation request types
- **Combined Filtering**: Successfully combined date and episode filtering in single where clause

#### Phase 3: UI Components ✅
- **Episode Selector**: Created [`packages/client/src/components/EpisodeSelector.tsx`](packages/client/src/components/EpisodeSelector.tsx) with:
  - Multi-select episode picker using Command component
  - Fuzzy search through episode titles and descriptions
  - Selected episodes display with Badge components and remove functionality
  - Clear all functionality
  - Episode count information

#### Phase 4: Frontend Integration ✅
- **SearchFilters Component**: Extended to include episode selector
- **SearchFiltersSheet**: Added episode selection props and handlers
- **HomePage State Management**: 
  - Added episode selection URL parameter handling (`episodeIds`)
  - Extended unified `updateSearchParams` function
  - Added episode selection change handlers
  - Updated search clearing behavior to include episode filters
- **Search API Client**: Extended to include episode filtering parameters
- **SearchResults**: Updated to pass through episode selection props and check active filters

### ✅ **EPISODE FILTERING IMPLEMENTATION - COMPLETED**

#### Implementation Status
- ✅ **Backend Implementation**: Complete and working
  - Episode ID parameter parsing for all request types (GET, POST, direct invocation)
  - Correct Orama where clause syntax implementation
  - Combined filtering with existing date filtering
  
- ✅ **UI Components**: Complete and working
  - Episode selector with fuzzy search through episode titles
  - Multi-select with badge display and individual remove functionality
  - Command component-based interface with popover
  - Clear all functionality and episode count display
  
- ✅ **Frontend Integration**: Complete and working
  - URL state management with `episodeIds` parameter (comma-separated)
  - State management integrated with existing date filtering
  - Search API client includes episode filtering parameters
  - Filter sheet includes episode selector
  - Active filter detection includes episode selection
  
- ✅ **Development Server**: Successfully started and running
- ✅ **Build Status**: All packages build successfully with no TypeScript errors

#### ✅ **Issue Resolution - Orama Where Clause Syntax Fixed**
**Problem Identified**: The episode filtering logic was using incorrect Orama where clause syntax for string field filtering.

**Root Cause**: Based on [Orama's official documentation](https://github.com/oramasearch/docs/blob/main/content/docs/orama-js/search/filters.mdx), string fields require direct value assignment, not operator objects.

**Incorrect Implementation** (was causing 0 results):
```typescript
// ❌ WRONG - Using operator syntax for strings
whereClause.sequentialEpisodeIdAsString = { eq: "250" };
whereClause.sequentialEpisodeIdAsString = { in: episodeIds };
```

**Correct Implementation** (now working):
```typescript
// ✅ CORRECT - Direct value assignment for strings
// Single episode
whereClause.sequentialEpisodeIdAsString = "250";           

// Multiple episodes  
whereClause.sequentialEpisodeIdAsString = ["250", "251"];  
```

**Key Learning**: According to Orama documentation:
- **String operators**: "On string properties it performs an exact matching on tokens"
- **Single value**: `tag: "new"`
- **Multiple values**: `tag: ["favorite", "new"]` - "it will return all documents that contain at least one of the values provided"

**Fix Applied**: Updated `packages/database/database.ts` to use correct syntax:
- Single episode: Direct string assignment
- Multiple episodes: Direct array assignment
- Removed incorrect operator object syntax

#### Current State
The episode filtering feature is **fully functional and working correctly**. Users can:
1. ✅ **Select Episodes**: Filter UI works perfectly - opens filter sheet, shows episode selector
2. ✅ **Search Episodes**: Episode search through titles and descriptions works
3. ✅ **Multi-Select**: Multi-select interface with badges works correctly
4. ✅ **View Selection**: Selected episodes display as removable badges
5. ✅ **Clear Selection**: Remove individual episodes or clear all works
6. ✅ **URL Persistence**: Episode selections persist correctly in URL (`episodeIds=250`)
7. ✅ **Backend Filtering**: Search API receives parameters and Orama filtering works correctly

## Technical Implementation Details

### Backend Filtering - Working Implementation
```typescript
// Fixed implementation in database.ts (WORKING: Correct Orama syntax)
if (episodeIds?.length) {
  // For string fields in Orama, use direct value assignment (not operator objects)
  // Single episode: sequentialEpisodeIdAsString = "250"
  // Multiple episodes: sequentialEpisodeIdAsString = ["250", "251", "252"]
  if (episodeIds.length === 1) {
    whereClause.sequentialEpisodeIdAsString = episodeIds[0];
    log.info(`Episode filtering applied (single): episodeId=${episodeIds[0]}`);
  } else {
    whereClause.sequentialEpisodeIdAsString = episodeIds;
    log.info(`Episode filtering applied (multiple): episodeIds=${JSON.stringify(episodeIds)}`);
  }
  
  log.info(`Episode filtering where clause: ${JSON.stringify({ sequentialEpisodeIdAsString: whereClause.sequentialEpisodeIdAsString })}`);
}

// Example working where clauses:
// Single: {"sequentialEpisodeIdAsString":"250"}
// Multiple: {"sequentialEpisodeIdAsString":["250","251","252"]}
```

### Key Fix Details
```
Previous failing approach:
- Query: "team hamilton" with episodeIds: ["250"]
- Where clause: {"sequentialEpisodeIdAsString":{"eq":"250"}} ❌
- Result: 0 hits

Current working approach:
- Query: "team hamilton" with episodeIds: ["250"] 
- Where clause: {"sequentialEpisodeIdAsString":"250"} ✅
- Result: Expected hits returned

Fix: Removed operator objects, used direct value assignment per Orama documentation
```

### Episode Selector Component Structure
```typescript
interface EpisodeSelection {
  selectedEpisodeIds: string[];
  searchTerm: string;
}

// Multi-select command box with:
// - Fuzzy search through episode titles
// - Checkbox-style selection
// - Selected episode chips with remove buttons
// - "Select All" / "Clear All" actions
```

### URL State Management
```
// Extend existing URL parameters (following date filtering pattern):
// ?q=search&sort=newest&startDate=2025-08-29&endDate=2025-09-28&episodes=352,351,350
// episodeIds will be comma-separated sequential episode IDs
```

## Key Files to Review for Future Implementation

### Backend Files
- `packages/database/database.ts` - Orama filtering logic (extend where clause)
- `packages/search/search-lambda/search-indexed-transcripts.ts` - Parameter parsing
- `packages/types/search.ts` - SearchRequest interface extension

### Frontend Core Files
- `packages/client/src/components/SearchFilters.tsx` - Add episode selector
- `packages/client/src/components/SearchFiltersSheet.tsx` - Container component
- `packages/client/src/routes/HomePage.tsx` - State management and URL handling
- `packages/client/src/utils/search.ts` - API client updates
- `packages/client/src/types/search.ts` - Client type definitions

### UI Component Files
- `packages/ui/components/command.tsx` - Existing searchable command component
- `packages/ui/components/badge.tsx` - For selected episode display
- `packages/ui/index.ts` - Component exports

### Data Source Files
- `packages/client/src/hooks/useEpisodeManifest.ts` - Episode data access
- `packages/types/episode-manifest.ts` - Episode data structure

### Reference Implementation Files (from Date Filtering)
- `packages/client/src/components/SearchFilters.tsx` - Pattern for filter controls
- `packages/database/database.ts` - Orama where clause implementation
- `packages/ui/components/date-picker.tsx` - Multi-value selector pattern

## Implementation Considerations

### Performance
- **Large Episode Lists**: Consider virtualization for 500+ episodes
- **Search Performance**: Debounce episode title search queries
- **Memory Usage**: Efficient episode data caching and filtering

### UX Design
- **Discovery**: How do users find episodes? (search, date ranges, recent)
- **Selection Limits**: Should there be a maximum number of selected episodes?
- **Visual Feedback**: Clear indication of selected vs available episodes
- **Mobile Experience**: Ensure command box works well on mobile devices

### Data Handling
- **Episode Ordering**: Default sort by newest, allow date/alphabetical sorting
- **Search Matching**: Fuzzy search through titles, descriptions, or just titles?
- **Metadata Display**: Show episode dates, durations, or other metadata?

### Integration with Date Filtering
- **Combined Filters**: How do date and episode filters interact?
- **Filter Priority**: Which takes precedence if episode is outside date range?
- **Clear Behavior**: Should clearing search also clear episode selections?

## Complexity Comparison to Date Filtering

**Similarities**:
- Backend Orama filtering extension
- URL state management patterns
- Filter sheet integration
- Clear/reset functionality

**Additional Complexity**:
- Multi-select UI component (vs single date range)
- Episode data search and filtering
- Performance considerations for large datasets
- More complex state management (array vs date range)

**Estimated Effort**: ~1.5x the date filtering implementation due to multi-select complexity and episode data handling.

## Future Enhancements

1. **Episode Metadata Filtering**: Filter by episode duration, guest appearances, etc.
2. **Smart Suggestions**: Suggest episodes based on search query content
3. **Episode Bookmarking**: Allow users to save favorite episodes for quick filtering
4. **Bulk Actions**: Select all episodes from a specific date range or season
5. **Episode Analytics**: Show which episodes are most searched/filtered

---

*This plan provides the foundation for implementing episode-based filtering as a natural extension of the date filtering functionality, leveraging the same architectural patterns and UI components.*