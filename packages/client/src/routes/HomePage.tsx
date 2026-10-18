import { useState, useEffect, useRef } from 'react'
import { Outlet, useSearchParams } from 'react-router'

import { log } from '../utils/logging';
import { ApiSearchResultHit, SearchResponse } from '@browse-dot-show/types'

import '../App.css'

import AppHeader from '../components/AppHeader'
import SearchInput from '../components/SearchInput'
import SearchResults from '../components/SearchResults'
import { performSearch, performHealthCheck } from '../utils/search'
import { SortOption } from '../types/search'
import { useEpisodeManifest } from '../hooks/useEpisodeManifest'
import { trackEvent } from '@/utils/goatcounter';
import siteConfig from '../config/site-config'
import { SEARCH_API_BASE_URL } from '../constants'
import { useSubscriber } from '../subscriber/SubscriberContext'
import { SubscriberUnauthorizedError } from '../subscriber/api'


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

  // Logged-in subscribers search the subscriber index (public + subscriber-only episodes)
  const subscriber = useSubscriber();
  const subscriberToken = subscriber.session?.token;

  // Local state for search input (not synced to URL until search is performed)
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

  // Ref to track if health check has been initiated to prevent multiple calls
  const healthCheckInitiated = useRef(false);
  // Ref to track when the page was loaded for cold start timeout logic
  const pageLoadTime = useRef(Date.now());
  // Ref to track the last search parameters to prevent duplicate searches
  const lastSearchParams = useRef<{query: string, sort: SortOption, page: number, subscriberToken?: string} | null>(null);

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
   * Warm the subscriber API too, once logged in
   */
  useEffect(() => {
    if (!subscriberToken) return;
    performHealthCheck(SEARCH_API_BASE_URL, subscriberToken).catch(e => {
      if (e instanceof SubscriberUnauthorizedError) subscriber.handleUnauthorized();
    });
  }, [subscriberToken]);

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
      
      // Update URL to clear search
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('q');
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
  const performSearchRequest = async (query: string, token: string | undefined = subscriberToken) => {
    // Check if we're about to perform the same search as last time
    const currentSearchParams = { query, sort: sortOption, page: currentPage, subscriberToken: token };
    const lastParams = lastSearchParams.current;
    
    if (lastParams && 
        lastParams.query === currentSearchParams.query && 
        lastParams.sort === currentSearchParams.sort &&
        lastParams.page === currentSearchParams.page &&
        lastParams.subscriberToken === currentSearchParams.subscriberToken) {
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
        searchApiBaseUrl: SEARCH_API_BASE_URL,
        searchLimit: SEARCH_LIMIT,
        searchOffset,
        subscriberToken: token,
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
      if (e instanceof SubscriberUnauthorizedError) {
        // The session was rejected: log out, and search the public episodes instead
        subscriber.handleUnauthorized();
        lastSearchParams.current = null;
        setIsLoading(false);
        await performSearchRequest(query, undefined);
        return;
      }
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
   * Re-run search when sort option or page changes, or a subscriber logs in or out (but only if we have an active search)
   */
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    
    if (trimmedQuery.length >= 2) {
      performSearchRequest(trimmedQuery);
    }
  }, [sortOption, currentPage, subscriberToken]);

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

      {subscriber.notice && (
        <div className="text-yellow-800 bg-yellow-100 border-yellow-600 border-2 p-3 mb-4 rounded-none flex justify-between gap-4 text-sm">
          <span>{subscriber.notice}</span>
          <button type="button" className="underline" onClick={subscriber.dismissNotice}>Dismiss</button>
        </div>
      )}

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