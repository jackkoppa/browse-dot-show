import { useState, useEffect } from 'react'
import { AppHeader } from '@browse-dot-show/blocks'
import { Button, Card, CardContent } from '@browse-dot-show/ui'
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
      
      <div className="max-w-5xl mx-auto p-4 pt-28">
        {/* Hero Section */}
        <div className="text-center mb-20">
          <div className="homepage-emoji-large mb-8">
            📝🔍🎙️
          </div>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-6 homepage-gradient-text">
            transcribe & search any podcast
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Find exact moments in your favorite podcasts with AI-powered transcription and search.
            Currently available for select shows, with more being added regularly.
          </p>
        </div>

        {/* Universal Search Section */}
        <Card className="homepage-search-section mb-20 p-8">
          <CardContent className="p-0">
            <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">
              Try it now with an existing podcast
            </h2>
            
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Site Selection */}
              <div>
                <label htmlFor="site-select" className="block text-sm font-semibold mb-3 text-foreground">
                  Choose a podcast:
                </label>
                <select
                  id="site-select"
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="homepage-select w-full"
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
                      className="w-full p-4 border-2 border-muted rounded-xl bg-muted text-muted-foreground cursor-not-allowed text-lg"
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA Section */}
        <div className="text-center mb-24">
          <div className="mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Want your favorite podcast searchable?
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
              Vote for podcasts you'd like to see added, or set up your own instance 
              to search any podcast you want.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Button
              onClick={handleRequestPodcastClick}
              size="lg"
              className="homepage-cta-primary w-full sm:w-auto px-10 py-4 text-xl font-bold rounded-xl"
            >
              🗳️ Request a podcast
            </Button>
            
            <Button
              onClick={handleSelfHostClick}
              variant="outline"
              size="lg"
              className="w-full sm:w-auto px-10 py-4 text-xl font-semibold rounded-xl border-2 hover:bg-muted"
            >
              🚀 Self-host your own
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-12 text-center">
            How it works
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="homepage-feature-card p-6 text-center">
              <CardContent className="p-0">
                <div className="text-5xl mb-6">📝</div>
                <h3 className="text-xl font-bold mb-4">Transcribe</h3>
                <p className="text-muted-foreground leading-relaxed">
                  AI-powered transcription converts podcast audio to searchable text with high accuracy
                </p>
              </CardContent>
            </Card>
            
            <Card className="homepage-feature-card p-6 text-center">
              <CardContent className="p-0">
                <div className="text-5xl mb-6">🔍</div>
                <h3 className="text-xl font-bold mb-4">Search</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Find exact moments, quotes, or topics across all episodes instantly
                </p>
              </CardContent>
            </Card>
            
            <Card className="homepage-feature-card p-6 text-center">
              <CardContent className="p-0">
                <div className="text-5xl mb-6">🎙️</div>
                <h3 className="text-xl font-bold mb-4">Listen</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Jump directly to the relevant moment in the original audio
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Theme Toggle - positioned absolutely */}
      <div className="fixed bottom-6 right-6">
        <ThemeToggle />
      </div>
    </div>
  )
}

export default HomePage 