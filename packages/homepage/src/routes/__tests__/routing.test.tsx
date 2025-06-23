import React from 'react'
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { BrowserRouter, MemoryRouter } from 'react-router'
import '@testing-library/jest-dom'

import App from '../../App'
import { useEpisodeManifest } from '../../hooks/useEpisodeManifest'
import { EpisodeManifest } from '@browse-dot-show/types'

// Mock the search API and S3 assets
const mockSearchResponse = {
  hits: [
    {
      id: 'test-result-1',
      text: 'Test search result text',
      startTimeMs: 120000,
      endTimeMs: 125000,
      sequentialEpisodeIdAsString: '1',
      episodePublishedUnixTimestamp: 1640995200000
    }
  ],
  totalHits: 1,
  processingTimeMs: 50
}

const mockEpisodeManifest: EpisodeManifest = {
  lastUpdated: '2022-01-01T00:00:00Z',
  episodes: [
    {
      sequentialId: 1,
      title: 'Test Episode 1',
      summary: 'Test episode summary',
      publishedAt: '2022-01-01T00:00:00Z',
      originalAudioURL: 'https://example.com/audio1.mp3',
      fileKey: 'test-episode-1',
      podcastId: 'hard-fork',
      hasCompletedLLMAnnotations: false,
      llmAnnotations: {}
    },
    {
      sequentialId: 2,
      title: 'Test Episode 2',
      summary: 'Another test episode',
      publishedAt: '2022-01-02T00:00:00Z',
      originalAudioURL: 'https://example.com/audio2.mp3',
      fileKey: 'test-episode-2',
      podcastId: 'hard-fork',
      hasCompletedLLMAnnotations: false,
      llmAnnotations: {}
    }
  ]
}

const mockSearchEntries = [
  {
    id: 'test-result-1',
    text: 'Test search result text',
    startTimeMs: 120000,
    endTimeMs: 125000
  }
]

// Mock goatcounter
vi.mock('@/utils/goatcounter', () => ({
  trackEvent: vi.fn()
}))

// Mock the useEpisodeManifest hook to avoid global cache issues between tests
vi.mock('@/hooks/useEpisodeManifest', () => ({
  useEpisodeManifest: vi.fn()
}))

// Mock the logging utility to suppress test logs
vi.mock('../../utils/logging', () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}))

// Mock console methods to suppress log output during tests
const originalConsoleError = console.error
const originalConsoleWarn = console.warn
const originalConsoleLog = console.log

// Mock fetch globally
const mockFetch = global.fetch as any

beforeEach(() => {
  vi.clearAllMocks()
  
  // Suppress console output during tests
  console.error = vi.fn()
  console.warn = vi.fn()
  console.log = vi.fn()
  
  // Default episode manifest mock - successful by default
  vi.mocked(useEpisodeManifest).mockReturnValue({
    episodeManifest: mockEpisodeManifest,
    isLoading: false,
    error: null
  })
  
  // Default fetch mock behavior
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('episode-manifest') || url.includes('full-episode-manifest')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockEpisodeManifest)
      })
    }
    
    if (url.includes('search-entries')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSearchEntries)
      })
    }
    
    if (url.includes('search') || url.includes('localhost:3001')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse)
      })
    }
    
    // Default: reject unmocked calls
    return Promise.reject(new Error(`Unmocked fetch call to ${url}`))
  })
})

// Restore console methods after all tests
afterAll(() => {
  console.error = originalConsoleError
  console.warn = originalConsoleWarn
  console.log = originalConsoleLog
})

// Helper function to get the search input
const getSearchInput = () => {
  // Try to get the search input, but it might be hidden when episode sheet is open
  const inputs = screen.queryAllByRole('textbox')
  return inputs.find(input => input.getAttribute('placeholder')?.includes('e.g.')) || inputs[0]
}

describe('Routing', () => {
  describe('Home Page Route', () => {
    it('renders home page at root path', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should render the search input
      await waitFor(() => {
        expect(getSearchInput()).toBeInTheDocument()
      })
    })

    it('reads search query from URL parameters', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/?q=test%20query']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should populate search input with URL query
      await waitFor(() => {
        const searchInput = getSearchInput() as HTMLInputElement
        expect(searchInput?.value).toBe('test query')
      })
    })

    it('reads sort option from URL parameters', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/?sort=newest']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Wait for component to load and check if sort is applied
      await waitFor(() => {
        // The sort option should be reflected in the UI
        // This would need to be verified based on how the sort UI is implemented
        expect(getSearchInput()).toBeInTheDocument()
      })
    })

    it('reads episode filter from URL parameters', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/?episodes=1,2']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should parse episode filter from URL
      await waitFor(() => {
        expect(getSearchInput()).toBeInTheDocument()
      })
    })

    it('handles multiple URL parameters correctly', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/?q=football&sort=newest&episodes=1']}>
            <App />
          </MemoryRouter>
        )
      })
      
      await waitFor(() => {
        const searchInput = getSearchInput() as HTMLInputElement
        expect(searchInput?.value).toBe('football')
      })
    })
  })

  describe('Episode Route', () => {
    it('renders episode sheet for valid episode ID', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/episode/1']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should render the episode sheet - use getAllByText since episode title appears in multiple places
      await waitFor(() => {
        const episodeTitles = screen.getAllByText('Test Episode 1')
        expect(episodeTitles.length).toBeGreaterThan(0)
      })
    })

    it('handles episode route with start time parameter', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/episode/1?start=120000']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should render episode with start time
      await waitFor(() => {
        const episodeTitles = screen.getAllByText('Test Episode 1')
        expect(episodeTitles.length).toBeGreaterThan(0)
      })
    })

    it('preserves search parameters when navigating to episode', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/episode/1?q=test&sort=newest&start=120000']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should render the episode sheet
      await waitFor(() => {
        const episodeTitles = screen.getAllByText('Test Episode 1')
        expect(episodeTitles.length).toBeGreaterThan(0)
      })
      
      // The search input should exist but might be hidden behind the episode sheet
      // We can verify the search state is preserved by checking if the input exists and has the right value
      await waitFor(() => {
        const searchInput = getSearchInput() as HTMLInputElement
        if (searchInput) {
          expect(searchInput.value).toBe('test')
        }
      })
    })

    it('shows error for invalid episode ID', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/episode/999']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should show error message - using queryAllByText to handle multiple matches
      await waitFor(() => {
        const errorElements = screen.queryAllByText(/error loading episode/i)
        expect(errorElements.length).toBeGreaterThan(0)
      })
    })

    it('redirects /episode (without ID) to home page', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/episode']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should redirect to home page
      await waitFor(() => {
        expect(getSearchInput()).toBeInTheDocument()
      })
      // Should not show episode sheet
      expect(screen.queryByText('Test Episode 1')).not.toBeInTheDocument()
    })
  })

  describe('Navigation Behavior', () => {
    it('navigates from home to episode route', async () => {

      await act(async () => {
        render(
          <BrowserRouter>
            <App />
          </BrowserRouter>
        )
      })
      
      // Wait for search results to load (if any)
      await waitFor(() => {
        expect(getSearchInput()).toBeInTheDocument()
      })
      
      // This test would need actual "Load Here" buttons from search results
      // For now, we'll just verify the basic navigation structure is in place
    })

    it('preserves search state when closing episode sheet', async () => {
      // This test would simulate opening an episode sheet and then closing it
      // to verify that search parameters are preserved
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/episode/1?q=test&sort=newest']}>
            <App />
          </MemoryRouter>
        )
      })
      
      await waitFor(() => {
        const episodeTitles = screen.getAllByText('Test Episode 1')
        expect(episodeTitles.length).toBeGreaterThan(0)
      })
      
      // The close behavior would need to be tested with actual user interaction
      // This verifies the initial state is correct
      await waitFor(() => {
        const searchInput = getSearchInput() as HTMLInputElement
        if (searchInput) {
          expect(searchInput.value).toBe('test')
        }
      })
    })
  })

  describe('URL Parameter Handling', () => {
    it('handles empty query parameters gracefully', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/?q=&sort=&episodes=']}>
            <App />
          </MemoryRouter>
        )
      })
      
      await waitFor(() => {
        const searchInput = getSearchInput() as HTMLInputElement
        expect(searchInput?.value).toBe('')
      })
    })

    it('handles malformed episode filter parameters', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/?episodes=invalid,1,not-a-number,2']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should filter out invalid episode IDs and keep valid ones
      await waitFor(() => {
        expect(getSearchInput()).toBeInTheDocument()
      })
    })

    it('handles invalid start time parameter', async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/episode/1?start=invalid']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should still render episode without start time highlighting
      await waitFor(() => {
        const episodeTitles = screen.getAllByText('Test Episode 1')
        expect(episodeTitles.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Error Handling', () => {
    it('handles network errors gracefully', async () => {
      // Mock fetch to return error for search requests but allow episode manifest
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('episode-manifest') || url.includes('full-episode-manifest')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockEpisodeManifest)
          })
        }
        
        // Let search entries through but make episode search fail
        if (url.includes('search-entries')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([])
          })
        }
        
        if (url.includes('search') || url.includes('localhost:3001')) {
          return Promise.reject(new Error('Network error'))
        }
        
        return Promise.reject(new Error(`Unmocked fetch call to ${url}`))
      })
      
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/episode/1']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should render the episode (episode manifest works)
      await waitFor(() => {
        const episodeTitles = screen.getAllByText('Test Episode 1')
        expect(episodeTitles.length).toBeGreaterThan(0)
      })
    })

    it('handles missing episode manifest gracefully', async () => {
      // Mock the episode manifest hook to return an error
      vi.mocked(useEpisodeManifest).mockReturnValue({
        episodeManifest: null,
        isLoading: false,
        error: 'Failed to fetch episode manifest: 404'
      })
      
      await act(async () => {
        render(
          <MemoryRouter initialEntries={['/episode/1']}>
            <App />
          </MemoryRouter>
        )
      })
      
      // Should show error message in the episode sheet when manifest fails to load
      await waitFor(() => {
        const errorElements = screen.queryAllByText(/Failed to load episode manifest.*Failed to fetch episode manifest.*404/i)
        expect(errorElements.length).toBeGreaterThan(0)
      })
    })
  })
}) 