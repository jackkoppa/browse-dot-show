export type SortOption = 'relevance' | 'newest' | 'oldest';

/**
 * Date range for filtering search results
 */
export interface DateRange {
  startDate: Date | undefined;
  endDate: Date | undefined;
}

/**
 * Date range presets for quick selection
 */
export type DateRangePreset = 'last30days' | 'lastyear';