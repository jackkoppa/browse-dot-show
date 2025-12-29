import { useState, useEffect } from 'react'
import { EpisodeManifest, EpisodeManifestMetadata } from '@browse-dot-show/types'
import { S3_HOSTED_FILES_BASE_URL } from '../constants'
import { log } from '../utils/logging'

interface UseEpisodeManifestReturn {
  episodeManifest: EpisodeManifest | null
  isLoading: boolean
  error: string | null
}

// Constants for localStorage keys
const MANIFEST_CACHE_KEY = 'episodeManifest'
const MANIFEST_METADATA_CACHE_KEY = 'episodeManifestMetadata'

// Global cache to ensure we only fetch once across the entire app lifecycle
let manifestCache: {
  data: EpisodeManifest | null
  isLoading: boolean
  error: string | null
  promise: Promise<EpisodeManifest> | null
} = {
  data: null,
  isLoading: false,
  error: null,
  promise: null
}

// Subscribers array to track all active hook instances
let subscribers: Array<(state: {episodeManifest: EpisodeManifest | null, isLoading: boolean, error: string | null}) => void> = []

// Function to notify all subscribers when cache changes
const notifySubscribers = () => {
  const currentState = {
    episodeManifest: manifestCache.data,
    isLoading: manifestCache.isLoading,
    error: manifestCache.error
  }
  subscribers.forEach(callback => callback(currentState))
}

// Utility functions for localStorage operations
const saveToLocalStorage = (key: string, data: any): void => {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (error) {
    log.warn(`Failed to save to localStorage (${key}):`, error)
  }
}

const getFromLocalStorage = <T>(key: string): T | null => {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : null
  } catch (error) {
    log.warn(`Failed to read from localStorage (${key}):`, error)
    return null
  }
}

// Check if we need to refresh the manifest by comparing metadata
const shouldRefreshManifest = async (): Promise<boolean> => {
  try {
    // Fetch the current metadata from server
    const metadataPath = `${S3_HOSTED_FILES_BASE_URL}episode-manifest/manifest-metadata.json`
    const response = await fetch(metadataPath)
    
    if (!response.ok) {
      log.warn('Failed to fetch manifest metadata, will refresh manifest')
      return true
    }
    
    const serverMetadata: EpisodeManifestMetadata = await response.json()
    
    // Get cached metadata
    const cachedMetadata = getFromLocalStorage<EpisodeManifestMetadata>(MANIFEST_METADATA_CACHE_KEY)
    
    if (!cachedMetadata) {
      log.debug('No cached metadata found, will refresh manifest')
      return true
    }
    
    // Compare timestamps
    const serverLastUpdated = new Date(serverMetadata.lastUpdated).getTime()
    const cachedLastUpdated = new Date(cachedMetadata.lastUpdated).getTime()
    
    const needsRefresh = serverLastUpdated > cachedLastUpdated
    
    if (needsRefresh) {
      log.debug(`Manifest needs refresh: server(${serverMetadata.lastUpdated}) > cached(${cachedMetadata.lastUpdated})`)
      // Save the new metadata
      saveToLocalStorage(MANIFEST_METADATA_CACHE_KEY, serverMetadata)
    } else {
      log.debug(`Manifest is up to date: server(${serverMetadata.lastUpdated}) <= cached(${cachedMetadata.lastUpdated})`)
    }
    
    return needsRefresh
  } catch (error) {
    log.warn('Error checking manifest metadata, will refresh manifest:', error)
    return true
  }
}

/**
 * Custom hook to manage episode manifest data with smart caching.
 * Uses localStorage for instant page loads and checks metadata for freshness.
 * Implements a hybrid caching strategy:
 * 1. Load from localStorage immediately for instant UI
 * 2. Check metadata in background to see if refresh is needed
 * 3. Fetch fresh manifest only if server version is newer
 */
export function useEpisodeManifest(): UseEpisodeManifestReturn {
  const [localState, setLocalState] = useState({
    episodeManifest: manifestCache.data,
    isLoading: manifestCache.isLoading,
    error: manifestCache.error
  })

  useEffect(() => {
    // Subscribe this hook instance to cache updates
    const updateLocalState = (newState: {episodeManifest: EpisodeManifest | null, isLoading: boolean, error: string | null}) => {
      setLocalState(newState)
    }
    
    subscribers.push(updateLocalState)

    const initializeManifest = async () => {
      // If we already have data in memory, don't fetch again
      if (manifestCache.data) {
        setLocalState({
          episodeManifest: manifestCache.data,
          isLoading: manifestCache.isLoading,
          error: manifestCache.error
        })
        return
      }

      // If already loading, don't start another fetch
      if (manifestCache.isLoading) {
        setLocalState({
          episodeManifest: manifestCache.data,
          isLoading: manifestCache.isLoading,
          error: manifestCache.error
        })
        return
      }

      // Step 1: Try to load from localStorage for instant UI
      const cachedManifest = getFromLocalStorage<EpisodeManifest>(MANIFEST_CACHE_KEY)
      if (cachedManifest) {
        manifestCache.data = cachedManifest
        manifestCache.isLoading = false
        manifestCache.error = null
        
        // Notify all subscribers with cached data
        notifySubscribers()
        
        log.debug('[useEpisodeManifest] Loaded manifest from localStorage')
      }

      // Step 2: Check if we need to refresh (async, low priority)
      try {
        const needsRefresh = await shouldRefreshManifest()
        
        if (!needsRefresh && cachedManifest) {
          // We have fresh cached data, no need to fetch
          log.debug('[useEpisodeManifest] Using cached manifest (up to date)')
          return
        }

        // Step 3: Fetch fresh manifest if needed
        log.debug('[useEpisodeManifest] Fetching fresh manifest from server')
        
        manifestCache.isLoading = true
        manifestCache.error = null
        notifySubscribers()

        const fetchEpisodeManifest = async (): Promise<EpisodeManifest> => {
          const manifestPath = `${S3_HOSTED_FILES_BASE_URL}episode-manifest/full-episode-manifest.json`
          const response = await fetch(manifestPath)

          if (!response.ok) {
            throw new Error(`Failed to fetch episode manifest: ${response.status}`)
          }

          const manifestData: EpisodeManifest = await response.json()
          return manifestData
        }

        const freshManifest = await fetchEpisodeManifest()
        
        // Update memory cache
        manifestCache.data = freshManifest
        manifestCache.isLoading = false
        manifestCache.error = null
        
        // Save to localStorage for next time
        saveToLocalStorage(MANIFEST_CACHE_KEY, freshManifest)
        
        // Notify all subscribers of fresh data
        notifySubscribers()
        
        log.debug('[useEpisodeManifest] Successfully loaded fresh manifest')
        
      } catch (error: any) {
        const errorMessage = error.message || 'Failed to load episode manifest'
        log.error('[useEpisodeManifest] Failed to fetch episode manifest:', error)
        
        // If we have cached data, keep using it despite the error
        if (cachedManifest && !manifestCache.data) {
          manifestCache.data = cachedManifest
          manifestCache.isLoading = false
          manifestCache.error = null
          log.warn('[useEpisodeManifest] Using stale cached data due to fetch error')
        } else {
          manifestCache.isLoading = false
          manifestCache.error = errorMessage
        }
        
        notifySubscribers()
      }
    }

    // Initialize the manifest loading process
    initializeManifest()

    // Cleanup function
    return () => {
      // Remove this subscriber
      subscribers = subscribers.filter(cb => cb !== updateLocalState)
    }
  }, [])

  return localState
} 