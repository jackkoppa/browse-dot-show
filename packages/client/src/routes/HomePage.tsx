import { useState, useEffect, useRef } from 'react'
import { Outlet, useSearchParams } from 'react-router'

import { log } from '../utils/logging';
import { ApiSearchResultHit, SearchResponse } from '@browse-dot-show/types'

import '../App.css'

import AppHeader from '../components/AppHeader'
import SearchInput from '../components/SearchInput'
import SearchResults from '../components/SearchResults'
import { performSearch, performHealthCheck } from '../utils/search'
import { SortOption, DateRange } from '../types/search'
import { useEpisodeManifest } from '../hooks/useEpisodeManifest'
import { trackEvent } from '@/utils/goatcounter';
import siteConfig from '../config/site-config'

// Get the search API URL from environment variable, fallback to localhost for development
const SEARCH_API_BASE_URL = import.meta.env.VITE_SEARCH_API_URL || 'http://localhost:3001';

const SEARCH_LIMIT = 25;

// Estimated time for Lambda cold start - if more than this time has passed since page load,
// we won't show the ColdStartLoader and will just use normal loading states
const ESTIMATED_TIME_FOR_LAMBDA_COLD_START = 10000; // 10 seconds

/**
 * HomePage component that orchestrates the search functionality for podcast transcript search.
 * 
 * Manages:
 * - Search state and API calls triggered by Enter key or button click
 * - Episode manifest fetching and filtering
 * - Scroll detection for header effects
 * - Coordination between child components
 * - Renders Outlet for child routes (episode sheet overlay)
 */
function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-driven state - read from search params
  const searchQuery = searchParams.get('q') || '';
  const sortOption = (searchParams.get('sort') as SortOption) || 'relevance';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  
  // Date range from URL parameters
  const dateRange: DateRange = {
    startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
    endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
  };

  const headerConfig = { 
    extraHeightForLongTitle: siteConfig.appHeader.extraHeightForLongTitle,
    includeTitlePrefix: siteConfig.appHeader.includeTitlePrefix
  }

  // Local component state
  const [searchResults, setSearchResults] = useState<ApiSearchResultHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [totalHits, setTotalHits] = useState<number>(0);
  const [processingTimeMs, setProcessingTimeMs] = useState<number>(0);
  const [isLambdaWarm, setIsLambdaWarm] = useState(false);
  const [showColdStartLoader, setShowColdStartLoader] = useState(false);
  const [mostRecentSuccessfulSearchQuery, setMostRecentSuccessfulSearchQuery] = useState<string | null>(null);

  // Use the shared episode manifest hook
  const { episodeManifest, isLoading: isManifestLoading, error: manifestError } = useEpisodeManifest();

  // Local state for search input (not synced to URL until search is performed)
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

  // Ref to track if health check has been initiated to prevent multiple calls
  const healthCheckInitiated = useRef(false);
  // Ref to track when the page was loaded for cold start timeout logic
  const pageLoadTime = useRef(Date.now());
  // Ref to track the last search parameters to prevent duplicate searches
  const lastSearchParams = useRef<{query: string, sort: SortOption, page: number, dateRange: DateRange} | null>(null);

  // Sync local search query when URL changes (browser back/forward, direct navigation)
  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  // URL update functions
  const updateSearchQuery = (query: string) => {
    setLocalSearchQuery(query);
  };

  const updateSortOption = (sort: SortOption) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (sort !== 'relevance') {
        newParams.set('sort', sort);
      } else {
        newParams.delete('sort');
      }
      // Reset to page 1 when sort changes
      newParams.delete('page');
      return newParams;
    });
  };

  const updateDateRange = (newDateRange: DateRange) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      
      // Update or remove startDate
      if (newDateRange.startDate) {
        newParams.set('startDate', newDateRange.startDate.toISOString().split('T')[0]);
      } else {
        newParams.delete('startDate');
      }
      
      // Update or remove endDate
      if (newDateRange.endDate) {
        newParams.set('endDate', newDateRange.endDate.toISOString().split('T')[0]);
      } else {
        newParams.delete('endDate');
      }
      
      // Reset to page 1 when date range changes
      newParams.delete('page');
      return newParams;
    });
  };

  const clearAllFilters = () => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      // Clear sort (back to relevance)
      newParams.delete('sort');
      // Clear date filters
      newParams.delete('startDate');
      newParams.delete('endDate');
      // Reset to page 1
      newParams.delete('page');
      return newParams;
    });
  };

  const handlePageChange = (page: number) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (page > 1) {
        newParams.set('page', page.toString());
      } else {
        newParams.delete('page');
      }
      return newParams;
    });
  };

  /**
   * Handle scroll detection for header visual effects
   */
  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 10;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [scrolled]);

  /**
   * Perform health check on app initialization to warm up the Lambda
   */
  useEffect(() => {
    if (healthCheckInitiated.current) {
      return;
    }

    const performLambdaHealthCheck = async () => {
      healthCheckInitiated.current = true;
      
      try {
        await performHealthCheck(SEARCH_API_BASE_URL);
        setIsLambdaWarm(true);
      } catch (e: any) {
        log.warn('[HomePage.tsx] Lambda health check failed, but continuing normally:', e);
        // Set as warm anyway to prevent blocking search functionality
        setIsLambdaWarm(true);
      }
    };

    performLambdaHealthCheck();
  }, []);

  /**
   * Perform search when explicitly triggered by user (Enter key or button click)
   */
  const handleSearch = async () => {
    const trimmedQuery = localSearchQuery.trim();

    // Clear results if query is too short
    if (trimmedQuery.length < 2) {
      setSearchResults([]);
      setError(null);
      setTotalHits(0);
      setProcessingTimeMs(0);
      setMostRecentSuccessfulSearchQuery(null);
      setShowColdStartLoader(false);
      
      // Update URL to clear search and date filters (as per clearing behavior decision)
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('q');
        newParams.delete('startDate');
        newParams.delete('endDate');
        // Keep sort option when clearing search
        return newParams;
      });
      return;
    }

    // Update URL with the search query
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('q', trimmedQuery);
      // Reset to page 1 for new searches
      newParams.delete('page');
      return newParams;
    });

    // Check if we should show cold start loader
    const timeSincePageLoad = Date.now() - pageLoadTime.current;
    const shouldShowColdStart = !isLambdaWarm && timeSincePageLoad < ESTIMATED_TIME_FOR_LAMBDA_COLD_START;
    
    if (shouldShowColdStart) {
      setShowColdStartLoader(true);
      // Don't proceed with search until Lambda is warm
      return;
    }

    // Perform the search
    await performSearchRequest(trimmedQuery);
  };

  /**
   * Perform the actual search API request
   */
  const performSearchRequest = async (query: string) => {
    // Check if we're about to perform the same search as last time
    const currentSearchParams = { query, sort: sortOption, page: currentPage, dateRange };
    const lastParams = lastSearchParams.current;
    
    if (lastParams && 
        lastParams.query === currentSearchParams.query && 
        lastParams.sort === currentSearchParams.sort &&
        lastParams.page === currentSearchParams.page &&
        lastParams.dateRange.startDate?.getTime() === currentSearchParams.dateRange.startDate?.getTime() &&
        lastParams.dateRange.endDate?.getTime() === currentSearchParams.dateRange.endDate?.getTime()) {
      return;
    }
    
    // Update the last search params before starting the search
    lastSearchParams.current = currentSearchParams;
    
    setIsLoading(true);
    setError(null);

    try {
      const searchOffset = (currentPage - 1) * SEARCH_LIMIT;
      const data: SearchResponse = await performSearch({
        query,
        sortOption,
        dateRange,
        searchApiBaseUrl: SEARCH_API_BASE_URL,
        searchLimit: SEARCH_LIMIT,
        searchOffset,
      });
      
      if (data && data.hits) {
        setSearchResults(data.hits);
        setTotalHits(data.totalHits || 0);
        setProcessingTimeMs(data.processingTimeMs || 0);
        setMostRecentSuccessfulSearchQuery(query);
      } else {
        log.warn('[HomePage.tsx] performSearchRequest: API response did not contain .hits array or was empty:', data);
        setSearchResults([]);
        setTotalHits(0);
        setProcessingTimeMs(0);
        setMostRecentSuccessfulSearchQuery(null);
      }

      trackEvent({
        eventName: `Searched: '${query}'`,
        eventType: 'Search Performed',
      });

      // Hide cold start loader once we have real search results
      setShowColdStartLoader(false);
    } catch (e: any) {
      log.error('[HomePage.tsx] performSearchRequest: Failed to fetch search results:', e);
      setError(e.message || 'Failed to fetch search results. Please try again.');
      setSearchResults([]);
      setTotalHits(0);
      setProcessingTimeMs(0);
      // Hide cold start loader on error too
      setShowColdStartLoader(false);
      // Reset last search params on error so retry is possible
      lastSearchParams.current = null;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Trigger search when Lambda becomes warm and user has a pending search
   */
  useEffect(() => {
    const trimmedQuery = localSearchQuery.trim();
    
    // If Lambda just became warm and user has a valid search query showing cold start loader, perform the search
    if (isLambdaWarm && trimmedQuery.length >= 2 && showColdStartLoader) {
      performSearchRequest(trimmedQuery);
    }
  }, [isLambdaWarm, showColdStartLoader, localSearchQuery, sortOption]);

  /**
   * Hide cold start loader when Lambda becomes warm (if no search is needed)
   */
  useEffect(() => {
    const trimmedQuery = localSearchQuery.trim();
    
    if (isLambdaWarm && showColdStartLoader && trimmedQuery.length < 2) {
      setShowColdStartLoader(false);
    }
  }, [isLambdaWarm, showColdStartLoader, localSearchQuery]);

  /**
   * Re-run search when sort option, page, or date range changes (but only if we have an active search)
   */
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    
    if (trimmedQuery.length >= 2) {
      performSearchRequest(trimmedQuery);
    }
  }, [sortOption, currentPage, dateRange.startDate, dateRange.endDate]);

  return (
    <div className="bg-background max-w-3xl mx-auto p-4 font-mono pt-32 sm:pt-28 min-h-screen">
      <AppHeader scrolled={scrolled} />

      <SearchInput
        value={localSearchQuery}
        onChange={updateSearchQuery}
        onSearch={handleSearch}
        isLoading={isLoading}
        mostRecentSuccessfulSearchQuery={mostRecentSuccessfulSearchQuery}
        headerConfig={headerConfig}
      />

      {/* Conditionally render ColdStartLoader or SearchResults */}
      {showColdStartLoader ? (
        <div className="p-4 bg-gray-100 animate-pulse rounded text-center">
          <p>Initializing search...</p>
          <br/>
          <p>Subsequent searches will be much faster</p>
        </div>
      ) : (
        <SearchResults
          results={searchResults}
          isLoading={isLoading}
          error={error}
          searchQuery={searchQuery}
          mostRecentSuccessfulSearchQuery={mostRecentSuccessfulSearchQuery}
          totalHits={totalHits}
          processingTimeMs={processingTimeMs}
          episodeManifest={episodeManifest}
          isManifestLoading={isManifestLoading}
          manifestError={manifestError}
          sortOption={sortOption}
          onSortChange={updateSortOption}
          dateRange={dateRange}
          onDateRangeChange={updateDateRange}
          onClearFilters={clearAllFilters}
          currentPage={currentPage}
          itemsPerPage={SEARCH_LIMIT}
          onPageChange={handlePageChange}
        />
      )}

      {/* Outlet for child routes - episode sheet overlay */}
      <Outlet />
    </div>
  )
}

export default HomePage 