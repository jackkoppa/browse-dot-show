import { useState, useEffect } from 'react'
import { EpisodeManifest } from '@browse-dot-show/types'
import { S3_HOSTED_FILES_BASE_URL } from '../constants'
import { log } from '../utils/logging'

interface UseEpisodeManifestReturn {
  episodeManifest: EpisodeManifest | null
  isLoading: boolean
  error: string | null
}

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

/**
 * Custom hook to manage episode manifest data.
 * Fetches the manifest once and caches it for the entire application lifecycle.
 * Subsequent calls to this hook will return the cached data.
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

    // Sync with current cache state immediately
    setLocalState({
      episodeManifest: manifestCache.data,
      isLoading: manifestCache.isLoading,
      error: manifestCache.error
    })

    // If we already have data, don't fetch again
    if (manifestCache.data) {
      return () => {
        // Cleanup: remove this subscriber
        subscribers = subscribers.filter(cb => cb !== updateLocalState)
      }
    }

    // If already loading, don't start another fetch
    if (manifestCache.isLoading) {
      return () => {
        // Cleanup: remove this subscriber
        subscribers = subscribers.filter(cb => cb !== updateLocalState)
      }
    }

    const fetchEpisodeManifest = async (): Promise<EpisodeManifest> => {
      const manifestPath = `${S3_HOSTED_FILES_BASE_URL}episode-manifest/full-episode-manifest.json`
      const response = await fetch(manifestPath)

      if (!response.ok) {
        throw new Error(`Failed to fetch episode manifest: ${response.status}`)
      }

      const manifestData: EpisodeManifest = await response.json()
      return manifestData
    }

    // Set loading state
    manifestCache.isLoading = true
    manifestCache.error = null
    
    // Notify all subscribers of loading state
    notifySubscribers()

    // Create the fetch promise if it doesn't exist
    if (!manifestCache.promise) {
      manifestCache.promise = fetchEpisodeManifest()
    }

    // Handle the promise
    manifestCache.promise
      .then((manifestData) => {
        manifestCache.data = manifestData
        manifestCache.isLoading = false
        manifestCache.error = null
        
        // Notify all subscribers of successful load
        notifySubscribers()
      })
      .catch((e: any) => {
        const errorMessage = e.message || 'Failed to load episode manifest'
        log.error('[useEpisodeManifest] Failed to fetch episode manifest:', e)
        
        manifestCache.isLoading = false
        manifestCache.error = errorMessage
        manifestCache.promise = null // Reset promise so we can retry later
        
        // Notify all subscribers of error
        notifySubscribers()
      })

    // Cleanup function
    return () => {
      // Remove this subscriber
      subscribers = subscribers.filter(cb => cb !== updateLocalState)
    }
  }, [])

  return localState
} 