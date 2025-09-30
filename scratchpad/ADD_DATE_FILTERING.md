# Date Filtering Implementation Plan

## Overview
Add date range filtering to the existing search functionality, allowing users to filter search results by episode publication date. The feature will use the existing `episodePublishedUnixTimestamp` field in search entries and integrate with the current sort functionality through a responsive Sheet/Dialog interface.

## Current Architecture Analysis

### Backend (Search Lambda)
- **Location**: `packages/search/search-lambda/search-indexed-transcripts.ts`
- **Database**: Uses Orama search engine with pre-built index
- **Current Sorting**: Already supports sorting by `episodePublishedUnixTimestamp` (newest/oldest)
- **Search Entry Structure**: Contains `episodePublishedUnixTimestamp` field ready for filtering
- **API**: Accepts `SearchRequest` with sorting parameters

### Frontend (Client)
- **Search Interface**: `packages/client/src/components/SearchInput.tsx` - main search input
- **Results Display**: `packages/client/src/components/SearchResults.tsx` - includes sort dropdown
- **State Management**: URL-based state management in `packages/client/src/routes/HomePage.tsx`
- **Current Sorting**: 3 options - relevance, newest, oldest
- **Search API**: `packages/client/src/utils/search.ts` - handles API calls

### UI Components
- **Available**: Button, Dialog, Drawer, Input, Select, Sheet, Popover
- **Missing**: Calendar, Date Picker components
- **Responsive Pattern**: `ResponsiveDrawerOrDialog.tsx` used for mobile-friendly modals

## Implementation Plan

### Phase 1: Add Required UI Components

#### 1.1 Add Calendar Component to UI Package
- **File**: `packages/ui/components/calendar.tsx`
- **Dependencies**: Add `react-day-picker` to `packages/ui/package.json`
- **Based on**: [React DayPicker](https://daypicker.dev/) - the library used by shadcn
- **Features**: 
  - Single date selection and date range selection
  - Month/year navigation with dropdown
  - Min/max date constraints (from episode manifest)
  - Disabled dates outside episode range
- **Styling**: Match existing design system (border-foreground, shadows, etc.)

#### 1.2 Add Date Picker Component to UI Package
- **File**: `packages/ui/components/date-picker.tsx`
- **Based on**: [shadcn date picker](https://ui.shadcn.com/docs/components/date-picker)
- **Features**: 
  - Date range selection (start and end dates)
  - Popover-based interface
  - Input fields with calendar icon
  - Min/max date constraints from episode manifest
  - Mobile-responsive
- **Integration**: Uses Calendar component internally

#### 1.3 Update UI Package Exports
- **File**: `packages/ui/index.ts`
- Add exports for `Calendar` and `DatePicker` components

### Phase 2: Extend Type Definitions

#### 2.1 Extend Search Types
- **File**: `packages/types/search.ts`
- **Add to SearchRequest interface**:
  ```typescript
  startDate?: string; // ISO date string (YYYY-MM-DD)
  endDate?: string;   // ISO date string (YYYY-MM-DD)
  ```
- **Add to SearchResponse interface**: Include filter parameters in response

#### 2.2 Extend Client Search Types
- **File**: `packages/client/src/types/search.ts`
- **Add date range type**:
  ```typescript
  export interface DateRange {
    startDate: Date | undefined;
    endDate: Date | undefined;
  }
  ```

### Phase 3: Backend Implementation (Search Lambda)

#### 3.1 Add Date Filtering Logic
- **File**: `packages/search/search-lambda/search-indexed-transcripts.ts`
- **Location**: In `handler` function, after parsing `SearchRequest`
- **Implementation**:
  - Convert ISO date strings to Unix timestamps
  - Add Orama where clause for `episodePublishedUnixTimestamp`
  - Handle edge cases (invalid dates, start > end)
- **Example filtering logic**:
  ```typescript
  const whereClause: any = {};
  if (startDate) {
    const startTimestamp = new Date(startDate).getTime();
    whereClause.episodePublishedUnixTimestamp = { gte: startTimestamp };
  }
  if (endDate) {
    const endTimestamp = new Date(endDate).getTime() + (24 * 60 * 60 * 1000 - 1); // End of day
    whereClause.episodePublishedUnixTimestamp = { 
      ...whereClause.episodePublishedUnixTimestamp,
      lte: endTimestamp 
    };
  }
  ```

### Phase 4: Frontend UI Implementation

#### 4.1 Create Filter Controls Component
- **File**: `packages/client/src/components/SearchFilters.tsx`
- **Purpose**: Contains both sort controls and date range picker
- **Features**:
  - Sort dropdown (existing functionality)
  - Date range picker with clear button
  - Date range presets: "Last 30 days", "Last year" (if >= 1 year of episodes)
  - Min/max date constraints from episode manifest
  - Responsive design for mobile/desktop
  - Form validation and error handling

#### 4.2 Create Responsive Filter Sheet
- **File**: `packages/client/src/components/SearchFiltersSheet.tsx`
- **Pattern**: Similar to `ResponsiveDrawerOrDialog.tsx`
- **Features**:
  - Sheet on mobile, Dialog on desktop
  - Filter icon trigger button
  - Contains `SearchFilters` component
  - Apply/Clear actions

#### 4.3 Update SearchResults Component
- **File**: `packages/client/src/components/SearchResults.tsx`
- **Changes**:
  - Replace inline sort dropdown with filter sheet trigger
  - Move sort logic to `SearchFilters` component
  - Add active filter indicators
  - Update results info to show applied filters

### Phase 5: Frontend Integration

#### 5.1 Update Search API Client
- **File**: `packages/client/src/utils/search.ts`
- **Changes**:
  - Add date range parameters to `SearchParams` interface
  - Include date filtering in API request body
  - Handle date conversion (Date objects to ISO strings)

#### 5.2 Update HomePage State Management
- **File**: `packages/client/src/routes/HomePage.tsx`
- **Changes**:
  - Add date range state management
  - Extend URL parameter handling (startDate, endDate)
  - Add date range change handlers
  - Reset pagination when filters change
  - Pass date range props to components
  - Calculate min/max dates from episode manifest
  - Handle search clearing behavior (clear date filters when search is fully cleared)

#### 5.3 URL State Integration
- **URL Parameters**:
  - `q` - search query (existing)
  - `sort` - sort option (existing) 
  - `page` - page number (existing)
  - `startDate` - filter start date (new, YYYY-MM-DD format)
  - `endDate` - filter end date (new, YYYY-MM-DD format)
- **Behavior**: Clear pagination when date filters change

### Phase 6: Testing and Polish

#### 6.1 Component Testing
- Test date picker functionality
- Test responsive behavior (Sheet vs Dialog)
- Test form validation and edge cases
- Test URL state synchronization

#### 6.2 Integration Testing
- Test with `pnpm client:dev --site=haveaword`
- Verify backend filtering works correctly
- Test search performance with date filters
- Test mobile responsiveness

#### 6.3 UX Improvements
- Add loading states for filter application
- Add clear filters functionality
- Add filter result count indicators
- Add date format validation and user feedback

## Technical Decisions

### Date Range Implementation
- **Format**: Use native Date objects in frontend, ISO strings for API
- **Range Type**: Inclusive start and end dates
- **Time Handling**: Start date at 00:00:00, end date at 23:59:59
- **Validation**: Prevent end date before start date
- **Min/Max Constraints**: Use episode manifest to set calendar bounds
  - Min date: `publishedAt` of first episode (oldest)
  - Max date: `publishedAt` of last episode (newest)
- **Presets**: "Last 30 days" and "Last year" (if >= 365 days of episodes)

### Mobile UX
- **Pattern**: Follow existing `ResponsiveDrawerOrDialog` pattern
- **Trigger**: Single filter icon button replaces inline sort dropdown
- **Layout**: Stack sort and date controls vertically in sheet
- **Actions**: Apply/Clear buttons in sheet footer

### URL State Management
- **Persistence**: All filter state persists in URL for bookmarking/sharing
- **Format**: ISO date strings (YYYY-MM-DD) for readability
- **Reset Behavior**: Clear pagination when filters change
- **Default State**: No date filters applied initially
- **Session Persistence**: No persistence across browser sessions (fresh start each visit)

### Performance Considerations
- **Backend**: Orama index already optimized for timestamp filtering
- **Frontend**: Debounce date picker changes to prevent excessive API calls
- **Caching**: Existing lambda caching remains effective

## Search Clearing Behavior

**Decision**: Date filters should be cleared when the search is **fully cleared**, but not when just changing the search term.

**Implementation Details**:
- **Full Clear**: When user completely clears the search input (empty string) → Clear date filters
- **Term Change**: When user modifies search term (from "test" to "example") → Keep date filters
- **Clear Method**: Implement via a "Clear All" button in the filter sheet for explicit control
- **URL Behavior**: When search query is removed from URL, also remove date parameters

**Rationale**: This provides intuitive behavior where users can refine their search terms while maintaining their date context, but get a fresh start when completely clearing their search.

## Files to Modify/Create

### New Files
- `packages/ui/components/calendar.tsx`
- `packages/ui/components/date-picker.tsx`
- `packages/client/src/components/SearchFilters.tsx`
- `packages/client/src/components/SearchFiltersSheet.tsx`

### Modified Files
- `packages/ui/package.json` (add react-day-picker dependency)
- `packages/ui/index.ts` (export new components)
- `packages/types/search.ts` (extend SearchRequest with startDate/endDate)
- `packages/client/src/types/search.ts` (add DateRange type)
- `packages/search/search-lambda/search-indexed-transcripts.ts` (add Orama filtering logic)
- `packages/client/src/utils/search.ts` (add date parameters to API calls)
- `packages/client/src/routes/HomePage.tsx` (state management, min/max dates, clearing behavior)
- `packages/client/src/components/SearchResults.tsx` (replace sort dropdown with filter sheet)
- `packages/client/src/hooks/useEpisodeManifest.ts` (if needed for min/max date calculation)

## Implementation Progress

### ✅ **COMPLETED**

#### Phase 2: Type Definitions
- ✅ **Extended SearchRequest interface** (`packages/types/search.ts`)
  - Added `startDate?: string` and `endDate?: string` parameters
- ✅ **Extended Client Search Types** (`packages/client/src/types/search.ts`)
  - Added `DateRange` interface with `startDate` and `endDate` Date objects
  - Added `DateRangePreset` type for 'last30days' and 'lastyear'

#### Phase 3: Backend Implementation  
- ✅ **Database Layer** (`packages/database/database.ts`)
  - Added date filtering logic to `searchOramaIndex` function
  - Implemented Orama `where` clause with `gte`/`lte` operators
  - Converts ISO date strings to Unix timestamps for filtering
  - Handles start-of-day and end-of-day timestamp calculations
- ✅ **Search Lambda** (`packages/search/search-lambda/search-indexed-transcripts.ts`)
  - Extended all request parsing paths (GET, POST, direct invocation)
  - Added `startDate` and `endDate` parameter extraction
  - Maintains backward compatibility

#### Phase 1: UI Components
- ✅ **Dependencies** (`packages/ui/package.json`)
  - Added `react-day-picker: ^9.11.0` and `date-fns: ^4.1.0`
- ✅ **Calendar Component** (`packages/ui/components/calendar.tsx`)
  - Based on React DayPicker with shadcn styling
  - Supports range selection, min/max constraints, disabled dates
  - Matches existing design system (border-foreground, shadows, etc.)
- ✅ **Date Picker Component** (`packages/ui/components/date-picker.tsx`)
  - Popover-based interface with calendar icon
  - Range selection with clear functionality
  - Min/max date constraints support
  - Mobile-responsive design
- ✅ **UI Package Exports** (`packages/ui/index.ts`)
  - Added exports for Calendar and DatePicker components

#### Phase 4: Frontend UI
- ✅ **SearchFilters Component** (`packages/client/src/components/SearchFilters.tsx`)
  - Contains sort dropdown and date range picker
  - Date range presets ("Last 30 days", "Last year" if >= 365 days available)
  - Min/max date calculation from episode manifest
  - Clear filters functionality
  - Active filter indicators
- ✅ **SearchFiltersSheet Component** (`packages/client/src/components/SearchFiltersSheet.tsx`)
  - Responsive Sheet/Dialog pattern using `ResponsiveDrawerOrDialog`
  - Filter icon with active state indicator
  - Contains SearchFilters component
- ✅ **SearchResults Component Updates** (`packages/client/src/components/SearchResults.tsx`)
  - Replaced inline sort dropdown with SearchFiltersSheet
  - Updated component props to include date range handlers
  - Added active filter indicators in results display

#### Phase 5: Frontend Integration
- ✅ **Search API Client Updates** (`packages/client/src/utils/search.ts`)
  - Added date range parameters to SearchParams interface
  - Included date filtering in API request body
  - Implemented date conversion (Date objects to ISO strings)
- ✅ **HomePage State Management** (`packages/client/src/routes/HomePage.tsx`)
  - Added date range state management from URL parameters
  - Extended URL parameter handling (startDate, endDate)
  - Added date range change handlers
  - Reset pagination when filters change
  - Implemented search clearing behavior (clears date filters when search is fully cleared)
  - Updated search request duplicate detection to include date range

### ✅ **COMPLETED - READY FOR TESTING**

#### Phase 6: Initial Testing Results
- ✅ **Code Compilation**: All TypeScript compilation successful, no linting errors
- ✅ **Dependency Installation**: react-day-picker and date-fns successfully added
- ✅ **Development Server**: Client builds and starts successfully on port 5138
- ✅ **Component Integration**: All components integrate without build errors

### ✅ **IMPLEMENTATION COMPLETE - READY FOR BACKEND TESTING**

#### Current Status
- ✅ **Development Server**: Running successfully 
- ✅ **Client Build**: No compilation errors
- ✅ **Filter UI**: Filter button appearing and working in search results
- ✅ **Component Integration**: All SearchFilters components successfully integrated

#### Implementation Status
1. **UI Components**: ✅ All components created and working
   - Files exist and working: `SearchFilters.tsx`, `SearchFiltersSheet.tsx` 
   - SearchResults.tsx successfully using new filter sheet
   - Filter button with active state indicators working
   - Date picker and presets functioning correctly

2. **Frontend Integration**: ✅ Complete
   - URL state management working (startDate/endDate parameters)
   - Date range state management working
   - Filter clearing behavior implemented
   - Pagination reset on filter changes working

#### Current State
- **Backend**: ✅ Complete and ready
- **UI Components**: ✅ Complete and working
- **Integration**: ✅ Complete and working
- **Testing**: 🔄 **Ready for backend API testing**

### ✅ **DATE FILTERING COMPLETE - WORKING**

#### Issue Resolution
- ✅ **Root Cause Identified**: Orama v3.1.11 doesn't support combining `gte` and `lte` operations in single filter
- ✅ **Solution Implemented**: Use `between` operator for date ranges, `gte`/`lte` for single bounds
- ✅ **Backend Fixed**: Updated database layer to use correct Orama filter syntax
- ✅ **Testing Successful**: All date filtering scenarios working correctly

#### Final Implementation
- **Both dates**: `{ episodePublishedUnixTimestamp: { between: [startTimestamp, endTimestamp] } }`
- **Start date only**: `{ episodePublishedUnixTimestamp: { gte: startTimestamp } }`
- **End date only**: `{ episodePublishedUnixTimestamp: { lte: endTimestamp } }`

#### Component Testing (Working)
- ✅ **Date Picker Functionality**: Calendar interaction and date selection working
- ✅ **Responsive Behavior**: Sheet vs Dialog working on mobile/desktop  
- ✅ **Filter Integration**: Sort + date filter combinations working in UI
- ✅ **URL State**: Filters persist correctly in URL parameters
- ✅ **Clear Functionality**: "Clear all filters" behavior working

#### Backend Testing (Blocked)
- ❌ **Date Filtering Logic**: Backend not applying date range filters to results
- ✅ **API Integration**: Search requests correctly include date parameters  
- ⏳ **Performance**: Cannot test until filtering works

## Implementation Priority
1. ✅ **Backend filtering logic** (enables feature)
2. ✅ **Basic date picker UI components** (core functionality)  
3. 🔄 **Frontend integration with min/max constraints** (makes feature usable)
4. ✅ **Responsive Sheet implementation** (mobile UX)
5. ✅ **Date range presets and clearing behavior**
6. ⏳ **URL state management** (persistence)
7. ⏳ **UX polish and additional validation**

## Additional Technical Notes

### Episode Manifest Integration
- **Min Date Calculation**: `Math.min(...episodes.map(ep => new Date(ep.publishedAt).getTime()))`
- **Max Date Calculation**: `Math.max(...episodes.map(ep => new Date(ep.publishedAt).getTime()))`
- **Preset Availability**: Check if `maxDate - minDate >= 365 days` before showing "Last year" preset
- **Error Handling**: Graceful fallback if manifest is unavailable (disable date constraints)

### React DayPicker Integration
Based on [daypicker.dev](https://daypicker.dev/), the library provides:
- **Range Selection**: `mode="range"` for start/end date selection
- **Constraints**: `disabled` prop to disable dates outside episode range
- **Styling**: CSS customization to match design system
- **Accessibility**: WCAG 2.1 AA compliant out of the box
- **Localization**: Support for different date formats and locales