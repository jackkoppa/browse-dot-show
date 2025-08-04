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
 * Homepage v2 - Redesigned with cleaner layout, improved header, and better contact section
 */
function HomePageV2() {
  const [scrolled, setScrolled] = useState(false)
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  /**
   * Handle scroll detection - simplified to avoid Safari iMessage issues
   */
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop
      const isScrolled = scrollY > 10
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [scrolled])

  /**
   * Auto-focus search input when a site is selected and clear search query
   */
  useEffect(() => {
    if (selectedSite && searchInputRef.current) {
      setSearchQuery('')
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
      log.error('[HomePage-v2.tsx] Selected site not found in config:', selectedSite)
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

  const handleGitHubClick = () => {
    trackEvent({
      eventType: 'GitHub Repository Link Clicked',
    })
    window.open('https://github.com/jackkoppa/browse-dot-show', '_blank')
  }

  const handleUserGitHubClick = () => {
    trackEvent({
      eventType: 'Jack Koppa GitHub Link Clicked',
    })
    window.open('https://github.com/jackkoppa', '_blank')
  }

  const handleBlueskyClick = () => {
    trackEvent({
      eventType: 'Bluesky Profile Link Clicked',
    })
    window.open('https://bsky.app/profile/jackpa.dev', '_blank')
  }

  const handleEmailClick = () => {
    trackEvent({
      eventType: 'Email Contact Link Clicked',
    })
    window.open('mailto:contact@browse.show', '_blank')
  }

  return (
    <div className="bg-background min-h-screen">
      {/* Enhanced Header */}
      <AppHeader
        scrolled={scrolled}
        config={{
          title: {
            prefix: '[browse.show]',
            main: 'transcribe & search any podcast'
          },
          actions: (
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          )
        }}
      />

      <div className="max-w-4xl mx-auto p-4 pt-24 sm:pt-32">
        {/* Hero Section - Simplified */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-6 mb-6">
            <img
              src="/assets/favicon-96x96.png"
              alt="Browse.show logo"
              className="w-16 h-16 sm:w-20 sm:h-20"
            />
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold homepage-gradient-text">
                Find exact moments
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground mt-2">
                Jump to that point & start listening
              </p>
            </div>
          </div>
        </div>

        {/* Universal Search Section */}
        <div className="mb-16">
          <h2 className="text-xl md:text-2xl font-bold mb-6 text-center text-foreground">
            Try it out!
          </h2>

          <div className="max-w-2xl mx-auto space-y-6 p-6 homepage-search-section rounded-lg">
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
                <p className="text-xs text-muted-foreground italic text-center">
                  {selectedSiteConfig.podcastTagline}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Contact & CTA Section - Combined and Improved */}
        <div id="contact" className="text-center mb-16 p-8 bg-muted/30 rounded-lg">
          <h2 className="text-2xl font-bold mb-6">
            Want your favorite podcast searchable?
          </h2>
          
          {/* Primary CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
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

          {/* Contact Information */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">Get in touch</h3>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <Button variant="ghost" size="sm" onClick={handleEmailClick} className="flex items-center gap-2">
                📧 contact@browse.show
              </Button>
              <Button variant="ghost" size="sm" onClick={handleGitHubClick} className="flex items-center gap-2">
                🔗 GitHub Repo
              </Button>
              <Button variant="ghost" size="sm" onClick={handleUserGitHubClick} className="flex items-center gap-2">
                👤 @jackkoppa
              </Button>
              <Button variant="ghost" size="sm" onClick={handleBlueskyClick} className="flex items-center gap-2">
                🦋 jackpa.dev
              </Button>
            </div>
          </div>
        </div>

        {/* How it works - Simplified */}
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
                  Open-source Whisper model converts podcast audio to searchable text
                </p>
              </CardContent>
            </Card>

            <Card className="homepage-feature-card p-5 text-center">
              <CardContent className="p-0">
                <div className="text-3xl mb-4">🔍</div>
                <h3 className="text-lg font-bold mb-3">Search</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Find exact moments, quotes, or topics across all episodes
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
    </div>
  )
}

export default HomePageV2