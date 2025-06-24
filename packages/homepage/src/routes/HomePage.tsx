import { useState, useEffect } from 'react'
import { AppHeader } from '@browse-dot-show/blocks'
import { Button } from '@browse-dot-show/ui'
import SearchInput from '../components/SearchInput'
import { ThemeToggle } from '../components/ThemeToggle'
import { log } from '../utils/logging'
import { trackEvent } from '../utils/goatcounter'
import deployedSitesConfig from '../deployed-sites.config.jsonc'

import '../App.css'

// Transform the deployed sites config into an array format
const deployedSites = Object.entries(deployedSitesConfig.sites).map(([id, site]) => ({
  id,
  displayName: site.name,
  url: site.url
}))

/**
 * Homepage component for browse.show - a landing page that introduces the app
 * and provides universal search across all deployed podcast sites.
 */
function HomePage() {
  const [scrolled, setScrolled] = useState(false)
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  /**
   * Handle scroll detection for header visual effects
   */
  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 10
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [scrolled])

  /**
   * Handle universal search - redirect to selected site with query
   */
  const handleUniversalSearch = () => {
    if (!selectedSite || !searchQuery.trim()) {
      return
    }

    const trimmedQuery = searchQuery.trim()
    const selectedSiteConfig = deployedSites.find(site => site.id === selectedSite)
    
    if (!selectedSiteConfig) {
      log.error('[HomePage.tsx] Selected site not found in config:', selectedSite)
      return
    }

    // Track the search event
    trackEvent({
      eventName: `Universal Search: '${trimmedQuery}' on ${selectedSite}`,
      eventType: 'Search Performed',
    })

    // Redirect to the selected site with the search query
    const targetUrl = `https://${selectedSite}.browse.show/?q=${encodeURIComponent(trimmedQuery)}`
    window.open(targetUrl, '_blank')
  }

  /**
   * Handle CTA clicks
   */
  const handleRequestPodcastClick = () => {
    trackEvent({
      eventName: 'Request Podcast CTA Clicked',
      eventType: 'Result Clicked',
    })
    window.open('https://docs.google.com/document/d/11p38njNdKeJF49XHPtYN-Gb6fotPCkoQIW8V4UDC9hA/edit?usp=sharing', '_blank')
  }

  const handleSelfHostClick = () => {
    trackEvent({
      eventName: 'Self-Host CTA Clicked',
      eventType: 'Result Clicked',
    })
    window.open('https://github.com/jackkoppa/browse-dot-show/blob/main/docs/GETTING_STARTED.md', '_blank')
  }

  return (
    <div className="bg-background min-h-screen">
      <AppHeader 
        scrolled={scrolled}
        config={{
          title: {
            main: 'browse.show'
          },
          tagline: {
            text: 'transcribe & search any podcast'
          }
        }}
      />
      
      <div className="max-w-4xl mx-auto p-4 pt-28">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            📝🔍🎙️
          </h1>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            transcribe & search any podcast
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Find exact moments in your favorite podcasts with AI-powered transcription and search.
            Currently available for select shows, with more being added regularly.
          </p>
        </div>

        {/* Universal Search Section */}
        <div className="mb-16">
          <h3 className="text-xl font-semibold mb-6 text-center">
            Try it now with an existing podcast:
          </h3>
          
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Site Selection */}
            <div>
              <label htmlFor="site-select" className="block text-sm font-medium mb-2">
                Choose a podcast:
              </label>
              <select
                id="site-select"
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="w-full p-3 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select a podcast...</option>
                {deployedSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div>
              {selectedSite ? (
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={handleUniversalSearch}
                  isLoading={false}
                  mostRecentSuccessfulSearchQuery={null}
                />
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Select a podcast first"
                    disabled={true}
                    className="w-full p-3 border border-input rounded-md bg-muted text-muted-foreground cursor-not-allowed"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center space-y-8">
          <div>
            <h3 className="text-2xl font-bold mb-4">
              Want your favorite podcast searchable?
            </h3>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Vote for podcasts you'd like to see added, or set up your own instance 
              to search any podcast you want.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              onClick={handleRequestPodcastClick}
              size="lg"
              className="w-full sm:w-auto px-8 py-3 text-lg font-semibold"
            >
              🗳️ Request a podcast
            </Button>
            
            <Button
              onClick={handleSelfHostClick}
              variant="outline"
              size="lg"
              className="w-full sm:w-auto px-8 py-3 text-lg"
            >
              🚀 Self-host your own
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-20 mb-12">
          <h3 className="text-xl font-semibold mb-8 text-center">
            How it works:
          </h3>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-3xl mb-4">📝</div>
              <h4 className="font-semibold mb-2">Transcribe</h4>
              <p className="text-sm text-muted-foreground">
                AI-powered transcription converts podcast audio to searchable text
              </p>
            </div>
            
            <div className="text-center">
              <div className="text-3xl mb-4">🔍</div>
              <h4 className="font-semibold mb-2">Search</h4>
              <p className="text-sm text-muted-foreground">
                Find exact moments, quotes, or topics across all episodes
              </p>
            </div>
            
            <div className="text-center">
              <div className="text-3xl mb-4">🎙️</div>
              <h4 className="font-semibold mb-2">Listen</h4>
              <p className="text-sm text-muted-foreground">
                Jump directly to the relevant moment in the original audio
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Theme Toggle - positioned absolutely */}
      <div className="fixed bottom-4 right-4">
        <ThemeToggle />
      </div>
    </div>
  )
}

export default HomePage 