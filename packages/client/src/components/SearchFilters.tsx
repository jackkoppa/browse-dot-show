import * as React from "react"
import { Button, DatePicker, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@browse-dot-show/ui"
import { SortOption, DateRange, DateRangePreset, EpisodeSelection } from "../types/search"
import { EpisodeManifest } from "@browse-dot-show/types"
import { DateRange as ReactDayPickerDateRange } from "react-day-picker"
import EpisodeSelector from "./EpisodeSelector"

interface SearchFiltersProps {
  sortOption: SortOption
  onSortChange: (option: SortOption) => void
  dateRange: DateRange
  onDateRangeChange: (range: DateRange) => void
  episodeSelection: EpisodeSelection
  onEpisodeSelectionChange: (selection: EpisodeSelection) => void
  episodeManifest: EpisodeManifest | null
  onClearFilters: () => void
}

export default function SearchFilters({
  sortOption,
  onSortChange,
  dateRange,
  onDateRangeChange,
  episodeSelection,
  onEpisodeSelectionChange,
  episodeManifest,
  onClearFilters,
}: SearchFiltersProps) {
  // Calculate min/max dates from episode manifest
  const { minDate, maxDate } = React.useMemo(() => {
    if (!episodeManifest?.episodes?.length) {
      return { minDate: undefined, maxDate: undefined }
    }

    const dates = episodeManifest.episodes.map(ep => new Date(ep.publishedAt))
    return {
      minDate: new Date(Math.min(...dates.map(d => d.getTime()))),
      maxDate: new Date(Math.max(...dates.map(d => d.getTime())))
    }
  }, [episodeManifest])

  // Check if "Last year" preset should be available
  const showLastYearPreset = React.useMemo(() => {
    if (!minDate || !maxDate) return false
    const yearInMs = 365 * 24 * 60 * 60 * 1000
    return (maxDate.getTime() - minDate.getTime()) >= yearInMs
  }, [minDate, maxDate])

  // Convert internal DateRange to react-day-picker DateRange
  const dayPickerDateRange: ReactDayPickerDateRange | undefined = React.useMemo(() => {
    if (!dateRange.startDate && !dateRange.endDate) return undefined
    return {
      from: dateRange.startDate,
      to: dateRange.endDate
    }
  }, [dateRange])

  // Handle date picker changes
  const handleDatePickerChange = (range: ReactDayPickerDateRange | undefined) => {
    onDateRangeChange({
      startDate: range?.from,
      endDate: range?.to
    })
  }

  // Handle preset selection
  const handlePresetSelect = (preset: DateRangePreset) => {
    if (!maxDate) return

    const now = maxDate // Use latest episode date as "now"
    let startDate: Date

    switch (preset) {
      case 'last30days':
        startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
        break
      case 'lastyear':
        startDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000))
        break
      default:
        return
    }

    // Ensure start date doesn't go before minimum available date
    if (minDate && startDate < minDate) {
      startDate = minDate
    }

    onDateRangeChange({
      startDate,
      endDate: now
    })
  }

  // Check if any filters are active
  const hasActiveFilters = sortOption !== 'relevance' || dateRange.startDate || dateRange.endDate || episodeSelection.selectedEpisodeIds.length > 0

  return (
    <div className="space-y-6">
      {/* Sort Controls */}
      <div className="space-y-3">
        <label className="text-sm font-semibold">Sort by</label>
        <Select value={sortOption} onValueChange={(value: SortOption) => onSortChange(value)}>
          <SelectTrigger className="w-full border-foreground border-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] rounded-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-foreground border-2 shadow-sm rounded-none">
            <SelectItem value="relevance">Relevance</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Date Range Controls */}
      <div className="space-y-3">
        <label className="text-sm font-semibold">Filter by date</label>
        
        {/* Date Range Presets */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePresetSelect('last30days')}
            className="text-xs border-foreground border-2 shadow-[1px_1px_0px_rgba(0,0,0,1)] rounded-none"
            disabled={!maxDate}
          >
            Last 30 days
          </Button>
          {showLastYearPreset && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePresetSelect('lastyear')}
              className="text-xs border-foreground border-2 shadow-[1px_1px_0px_rgba(0,0,0,1)] rounded-none"
              disabled={!maxDate}
            >
              Last year
            </Button>
          )}
        </div>

        {/* Date Range Picker */}
        <DatePicker
          date={dayPickerDateRange}
          onDateChange={handleDatePickerChange}
          fromDate={minDate}
          toDate={maxDate}
          placeholder="Select date range"
          disabled={!episodeManifest}
        />

        {/* Date range display */}
        {(dateRange.startDate || dateRange.endDate) && (
          <div className="text-xs text-muted-foreground p-2 bg-muted rounded border">
            {dateRange.startDate && dateRange.endDate ? (
              <>
                From {dateRange.startDate.toLocaleDateString()} to {dateRange.endDate.toLocaleDateString()}
              </>
            ) : dateRange.startDate ? (
              <>From {dateRange.startDate.toLocaleDateString()}</>
            ) : (
              <>Until {dateRange.endDate?.toLocaleDateString()}</>
            )}
          </div>
        )}
      </div>

      {/* Episode Filtering Controls */}
      <EpisodeSelector
        episodeSelection={episodeSelection}
        onEpisodeSelectionChange={onEpisodeSelectionChange}
        episodeManifest={episodeManifest}
        disabled={!episodeManifest}
      />

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <Button
          variant="outline"
          onClick={onClearFilters}
          className="w-full border-foreground border-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] rounded-none"
        >
          Clear all filters
        </Button>
      )}
    </div>
  )
}
