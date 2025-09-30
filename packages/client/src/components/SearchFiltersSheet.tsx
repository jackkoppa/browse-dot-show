import * as React from "react"
import { Button } from "@browse-dot-show/ui"
import { MixerHorizontalIcon } from "@radix-ui/react-icons"
import ResponsiveDrawerOrDialog from './ResponsiveDrawerOrDialog'
import SearchFilters from './SearchFilters'
import { SortOption, DateRange } from "../types/search"
import { EpisodeManifest } from "@browse-dot-show/types"

interface SearchFiltersSheetProps {
  sortOption: SortOption
  onSortChange: (option: SortOption) => void
  dateRange: DateRange
  onDateRangeChange: (range: DateRange) => void
  episodeManifest: EpisodeManifest | null
  onClearFilters: () => void
  hasActiveFilters?: boolean
}

export default function SearchFiltersSheet({
  sortOption,
  onSortChange,
  dateRange,
  onDateRangeChange,
  episodeManifest,
  onClearFilters,
  hasActiveFilters = false,
}: SearchFiltersSheetProps) {
  
  const childTrigger = (
    <Button 
      variant="ghost" 
      size="icon"
      className={`relative ${hasActiveFilters ? 'text-primary' : ''}`}
      title="Filters"
    >
      <MixerHorizontalIcon className="size-6" />
      {hasActiveFilters && (
        <div className="absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full" />
      )}
    </Button>
  )

  return (
    <ResponsiveDrawerOrDialog
      childTrigger={childTrigger}
      title="Search Filters"
      description="Sort and filter search results"
      descriptionHidden={true}
    >
      <SearchFilters
        sortOption={sortOption}
        onSortChange={onSortChange}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        episodeManifest={episodeManifest}
        onClearFilters={onClearFilters}
      />
    </ResponsiveDrawerOrDialog>
  )
}
