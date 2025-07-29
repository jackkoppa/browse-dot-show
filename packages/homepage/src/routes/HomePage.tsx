import { useState, useEffect, useRef } from 'react'
import { AppHeader } from '@browse-dot-show/blocks'
import { Button, Card, CardContent } from '@browse-dot-show/ui'
import SimpleSearchInput from '../components/SimpleSearchInput'
import SiteSelector from '../components/SiteSelector'
import { ThemeToggle } from '../components/ThemeToggle'
import { log } from '../utils/logging'
import { trackEvent } from '../utils/goatcounter'
import deployedSitesConfig from '../../deployed-sites.config.jsonc'

import '../App.css'

// Transform the deployed sites config into an array format with all needed fields
const { externalSites, originSites } = deployedSitesConfig.sites
// We list any external sites first, then origin sites
const allSites = { 
  ...externalSites, 
  ...originSites 
}
const deployedSites = Object.entries(allSites).map(([id, site]) => ({
  id,
  displayName: site.displayedPodcastName,
  domain: site.domain,
  podcastTagline: site.podcastTagline,
  imageUrl: site.imageUrl,
  url: `https://${site.domain}`,
  searchInputPlaceholder: site.searchInputPlaceholder
}))

/**
 * Homepage component for browse.show - a landing page that introduces the app
 * and provides universal search across all deployed podcast sites.
 */
function HomePage() {
  const [scrolled, setScrolled] = useState(false)
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

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
   * Auto-focus search input when a site is selected and clear search query
   */
  useEffect(() => {
    if (selectedSite && searchInputRef.current) {
      // Clear the search query when a new site is selected
      setSearchQuery('')
      // Small delay to ensure the component has rendered and is enabled
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [selectedSite])

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
      eventType: `Universal Search: '${trimmedQuery}' on [${selectedSite}]`,
      eventName: `Universal Search Performed`,
    })

    // Redirect to the selected site with the search query
    const targetUrl = `https://${selectedSiteConfig.domain}/?q=${encodeURIComponent(trimmedQuery)}`
    window.open(targetUrl, '_self')
  }

  const selectedSiteConfig = deployedSites.find(site => site.id === selectedSite)

  /**
   * Handle CTA clicks
   */
  const handleRequestPodcastClick = () => {
    trackEvent({
      eventType: 'Request Podcast Button Clicked',
    })
    window.open('https://docs.google.com/document/d/11p38njNdKeJF49XHPtYN-Gb6fotPCkoQIW8V4UDC9hA/edit?usp=sharing', '_blank')
  }

  const handleSelfHostClick = () => {
    trackEvent({
      eventType: 'Self-Host Guide Button Clicked',
    })
    window.open('https://github.com/jackkoppa/browse-dot-show/blob/main/docs/GETTING_STARTED.md', '_blank')
  }

  return (
    <div className="bg-background min-h-screen">
      <AppHeader
        scrolled={scrolled}
        config={{
          title: {
            main: '[browse.show]'
          }
        }}
      />

      <div className="max-w-3xl mx-auto p-4 pt-24 sm:pt-32 transition-all">
        {/* Hero Section */}
        <div className="mb-8 sm:mb-16">
          <div className="flex items-center sm:items-start justify-center sm:justify-start gap-4 sm:gap-8">
            <div className="flex-shrink-0">
              <img
                src="/assets/favicon.svg"
                alt="Browse.show logo"
                className="w-16 h-16 xs:w-25 xs:h-25 sm:w-40 sm:h-40"
              />
            </div>
            <div className="flex-1">
              <h1 className="text-xl min-[430px]:text-2xl sm:text-3xl lg:text-4xl font-bold homepage-gradient-text mb-2 sm:mb-4">
                transcribe & search<br className="sm:hidden" /> any podcast
              </h1>
              <p className="text-sm sm:text-lg text-muted-foreground leading-relaxed hidden sm:block">
                Find exact moments in your favorite podcasts. Jump to that point & start listening.<br /><br />
                Currently available for select shows, with more added by request.
              </p>
            </div>
          </div>
          {/* Mobile description */}
          <p className="text-sm text-muted-foreground leading-relaxed text-center mt-6 sm:hidden">
            Find exact moments in your favorite podcasts. Jump to that point & start listening.<br /><br />
            Currently available for select shows, with more added by request.
          </p>
        </div>

        {/* Universal Search Section */}
        <div className="mb-16 p-2">
          <h2 className="max-w-2xl text-xl md:text-2xl mx-auto font-bold mb-4 text-left text-foreground">
            Try it out!
          </h2>

          <div className="max-w-2xl mx-auto space-y-6">
            {/* Site Selection */}
            <SiteSelector
              sites={deployedSites}
              selectedSite={selectedSite}
              onSiteSelect={setSelectedSite}
            />

            {/* Search Input */}
            <div>
              <SimpleSearchInput
                ref={searchInputRef}
                value={searchQuery}
                onChange={setSearchQuery}
                onSearch={handleUniversalSearch}
                isLoading={false}
                placeholder={selectedSiteConfig ? `e.g. "${selectedSiteConfig.searchInputPlaceholder}"` : "Select podcast above"}
                disabled={!selectedSite}
              />
            </div>
            {/* Show tagline when a site is selected */}
            {selectedSiteConfig && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground italic">
                  {selectedSiteConfig.podcastTagline}
                </p>
              </div>
            )}
          </div>
        </div>
        {/* CTA Section */}
        <div className="text-center mb-20">
          <div className="mb-10">
            <h2 className="text-xl md:text-2xl font-bold mb-4">
              Want your favorite podcast searchable?
            </h2>
            <p className="text-base md:text-lg text-muted-foreground mb-6 max-w-2xl mx-auto leading-relaxed">
              Vote for podcasts you'd like to see added, or set up your own instance
              to search any podcast you want.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              onClick={handleRequestPodcastClick}
              size="lg"
              className="homepage-cta-primary w-full sm:w-auto px-8 py-3 text-lg font-bold"
            >
              🗳️ Request a podcast
            </Button>

            <Button
              onClick={handleSelfHostClick}
              variant="outline"
              size="lg"
              className="w-full sm:w-auto px-8 py-3 text-lg font-semibold border-2 hover:bg-muted hover:text-foreground"
            >
              🚀 Self-host your own
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="mb-16">
          <h2 className="text-xl md:text-2xl font-bold mb-8 text-center">
            How it works
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="homepage-feature-card p-5 text-center">
              <CardContent className="p-0">
                <div className="text-3xl mb-4">📝</div>
                <h3 className="text-lg font-bold mb-3">Transcribe</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Transcription via the open-source Whisper model converts podcast audio to searchable text
                </p>
              </CardContent>
            </Card>

            <Card className="homepage-feature-card p-5 text-center">
              <CardContent className="p-0">
                <div className="text-3xl mb-4">🔍</div>
                <h3 className="text-lg font-bold mb-3">Search</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Find exact moments, quotes, or topics across all episodes instantly
                </p>
              </CardContent>
            </Card>

            <Card className="homepage-feature-card p-5 text-center">
              <CardContent className="p-0">
                <div className="text-3xl mb-4">🎙️</div>
                <h3 className="text-lg font-bold mb-3">Listen</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
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