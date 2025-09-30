# Episode Filtering Implementation Plan

## Overview
Add episode-based filtering to the existing search functionality, allowing users to filter search results by selecting one or more specific episodes. This will extend the current filter sheet with a multi-select, searchable command box that filters by episode IDs using the existing `sequentialEpisodeIdAsString` field in search entries.

## Current Architecture Context

Based on the date filtering implementation, we have:
- **Backend**: Orama search with `where` clause filtering support
- **Frontend**: Responsive filter sheet with `SearchFilters` and `SearchFiltersSheet` components
- **Data Structure**: Search entries contain `sequentialEpisodeIdAsString` field for episode identification
- **Episode Data**: Episode manifest provides episode titles, IDs, and metadata

## Implementation Plan Overview

### Phase 1: Extend Type Definitions
- **SearchRequest Interface**: Add `episodeIds?: string[]` parameter
- **Client Types**: Add `EpisodeSelection` interface and related types
- **Filter Types**: Extend existing filter interfaces

### Phase 2: Backend Implementation
- **Database Layer**: Extend Orama filtering to support `sequentialEpisodeIdAsString` array filtering
- **Search Lambda**: Add episode ID parameter parsing and validation
- **Filtering Logic**: Implement `in` operator for episode ID array matching

### Phase 3: UI Components
- **Command Component**: Leverage existing `Command` component from UI package
- **Episode Selector**: Create searchable, multi-select episode picker
- **Episode Search**: Implement fuzzy search through episode titles
- **Selection Display**: Show selected episodes with remove functionality

### Phase 4: Frontend Integration
- **SearchFilters Component**: Add episode selector to existing filter controls
- **State Management**: Extend date range state to include episode selection
- **URL Persistence**: Add episode IDs to URL parameters
- **Search API**: Include episode filtering in search requests

### Phase 5: UX Enhancements
- **Episode Grouping**: Consider grouping by date ranges or seasons
- **Quick Actions**: Add "Select All", "Clear All" functionality
- **Performance**: Implement virtualization for large episode lists
- **Search Optimization**: Debounce episode title search

## Technical Implementation Details

### Backend Filtering
```typescript
// Extend existing where clause logic in database.ts
if (episodeIds?.length) {
  whereClause.sequentialEpisodeIdAsString = { in: episodeIds };
}
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
// Extend existing URL parameters:
// ?q=search&sort=newest&startDate=2023-01-01&endDate=2023-12-31&episodes=1,5,10,25
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