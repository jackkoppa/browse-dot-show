import { ApiSearchResultHit, EpisodeManifest } from '@browse-dot-show/types'
import SearchResult from './SearchResult'
import SearchResultsPagination from './SearchResultsPagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@browse-dot-show/ui"
import { SortOption } from '../types/search'

interface SearchResultsProps {
  results: ApiSearchResultHit[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  mostRecentSuccessfulSearchQuery: string | null;
  totalHits: number;
  processingTimeMs: number;
  episodeManifest: EpisodeManifest | null;
  isManifestLoading: boolean;
  manifestError: string | null;
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
  // Pagination props
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

interface SearchTimeAndResultCountProps {
  isLoading: boolean;
  processingTimeSeconds: number;
  totalHits: number;
  results: ApiSearchResultHit[];
  currentPage: number;
  itemsPerPage: number;
}


const SearchTimeAndResultCount = ({
  isLoading,
  processingTimeSeconds,
  totalHits,
  results,
  currentPage,
  itemsPerPage,
}: SearchTimeAndResultCountProps) => {
  // Calculate the range of results being shown
  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, totalHits);

  const isOnlyOnePageOfResults = startIndex === 1 && endIndex === totalHits;
  
  return (
    <div className="flex flex-col gap-2 self-end">
      <span className="text-muted-foreground">
        {isLoading ? (
          <em>Search time: <div className="h-3 w-12 bg-gray-200 animate-pulse rounded inline-block align-middle"></div></em>
        ) : (
          <em>Search time: {processingTimeSeconds}s</em>
        )}
      </span>
      <span className="text-foreground">
        <em>Showing:</em> <span className="font-bold">
          {isLoading ? (
            <div className="h-3 w-10 bg-gray-200 animate-pulse rounded inline-block align-middle"></div>
          ) : (
            <>
              {results.length > 0 && totalHits > 0 ? (
                isOnlyOnePageOfResults ? (
                  endIndex
                ) : (
                  `${startIndex}-${endIndex}`
                )
              ) : (
                0
              )}
              {totalHits > 0 && (
                <> <em>of</em> {totalHits}</>
              )}
            </>
          )}
        </span>
        <> <em>hits</em></>
      </span>
    </div>
  )
}

export default function SearchResults({
  results,
  isLoading,
  error,
  searchQuery,
  mostRecentSuccessfulSearchQuery,
  totalHits,
  processingTimeMs,
  episodeManifest,
  isManifestLoading,
  manifestError,
  sortOption,
  onSortChange,
  currentPage,
  itemsPerPage,
  onPageChange,
}: SearchResultsProps) {
  // Show error message if there's an error
  if (error) {
    return (
      <div className="error-message text-red-600 bg-red-100 border-red-600 border-2 p-4 mb-6 shadow-[4px_4px_0px_#ef4444] rounded-none">
        <p className="font-semibold">Error:</p>
        <p>{error}</p>
      </div>
    );
  }

  // round to nearest 0.001 seconds, and always show at least 0.001 seconds
  const processingTimeSeconds = Math.max(Number((processingTimeMs / 1000).toFixed(3)), 0.001);

  // Only show this banner area once we've had a successful search
  const showResultsInfo = Boolean(mostRecentSuccessfulSearchQuery);

  return (
    <div className="mb-10">
      {showResultsInfo && (
        <div className="results-info-and-controls flex justify-between items-start mb-4 text-xs sm:text-[12px]">
        {/* Left side: Search time and hits info */}
        <SearchTimeAndResultCount
          isLoading={isLoading}
          processingTimeSeconds={processingTimeSeconds}
          totalHits={totalHits}
          results={results}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
        />

        {/* Right side: Sort dropdown */}
        <div className="flex items-start gap-2 text-foreground">
          <label className="font-bold text-right">Sort<br/>by</label>
          <Select value={sortOption} onValueChange={(value: SortOption) => onSortChange(value)}>
            <SelectTrigger className="w-32 border-foreground border-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] rounded-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-foreground border-2 shadow-sm rounded-none">
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
            </SelectContent>
          </Select>
          </div>
        </div>
      )}

      {/* Show warning if manifest failed to load but we have search results */}
      {manifestError && results.length > 0 && (
        <div className="warning-message text-yellow-800 bg-yellow-100 border-yellow-600 border-2 p-4 mb-6 shadow-[4px_4px_0px_#ca8a04] rounded-none">
          <p className="font-semibold">Warning:</p>
          <p>Failed to retrieve some data for the episodes - please try refreshing?</p>
        </div>
      )}

      {isLoading && !error ? (
        <div className="loading-skeleton space-y-6">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="border-foreground border-2 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-xl p-6">
              {/* Main text area (like CardContent) */}
              <div className="space-y-2 mb-4">
                <div className="h-4 w-full bg-gray-200 animate-pulse rounded"></div>
                <div className="h-4 w-full bg-gray-200 animate-pulse rounded"></div>
                <div className="h-4 w-3/4 bg-gray-200 animate-pulse rounded"></div>
              </div>

              {/* Footer area (like CardFooter) */}
              <div className="mt-3"> {/* Adjusted margin for visual spacing */}
                {/* Badges row */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-4 w-20 bg-gray-200 animate-pulse rounded-md"></div> {/* Date badge skeleton */}
                  <div className="h-4 w-18 bg-gray-200 animate-pulse rounded-md"></div> {/* Time range badge skeleton */}
                </div>
                {/* Episode title line */}
                <div className="h-2 w-4/5 bg-gray-200 animate-pulse rounded"></div> {/* Episode title skeleton (text-xs height) */}
              </div>
            </div>
          ))}
        </div>
      ) : results.length > 0 ? (
        <>
          <ul className="results-list space-y-6">
            {results.map((result) => (
              <SearchResult
                key={result.id}
                result={result}
                episodeData={episodeManifest?.episodes.find(ep => ep.sequentialId === parseInt(result.sequentialEpisodeIdAsString))}
                isManifestLoading={isManifestLoading}
                showManifestError={Boolean(manifestError)}
              />
            ))}
          </ul>
          <SearchResultsPagination
            currentPage={currentPage}
            totalHits={totalHits}
            itemsPerPage={itemsPerPage}
            isLoading={isLoading}
            onPageChange={onPageChange}
          />
        </>
      ) : searchQuery.trim().length >= 2 && !error ? (
        <p className="no-results text-lg text-gray-600 text-center bg-gray-100 p-6 border-foreground border-2 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-none">
          No results found for "{searchQuery}". Try a different term?
        </p>
      ) : null}
    </div>
  );
} 