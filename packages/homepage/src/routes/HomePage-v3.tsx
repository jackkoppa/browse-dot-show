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
 * Homepage v3 - Card-based layout with emphasis on search functionality
 */
function HomePageV3() {
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
      log.error('[HomePage-v3.tsx] Selected site not found in config:', selectedSite)
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
      {/* Header matching client sites */}
      <AppHeader
        scrolled={scrolled}
        config={{
          title: {
            prefix: '[browse.show]',
            main: 'transcribe & search any podcast'
          },
          tagline: {
            text: 'Find exact moments in your favorite podcasts.',
            suffix: 'Jump to that point & start listening.'
          },
          actions: (
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          )
        }}
      />

      <div className="max-w-5xl mx-auto p-4 pt-24 sm:pt-32">
        {/* Hero Section - Minimal */}
        <div className="text-center mb-16">
          <img
            src="/assets/favicon-96x96.png"
            alt="Browse.show logo"
            className="w-24 h-24 mx-auto mb-4"
          />
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Currently available for select shows, with more added by request.
          </p>
        </div>

        {/* Three Column Layout */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {/* Search Card */}
          <Card className="lg:col-span-2 homepage-feature-card p-6">
            <CardContent className="p-0">
              <h2 className="text-2xl font-bold mb-6">Try it out!</h2>
              
              <div className="space-y-6">
                <SiteSelector
                  sites={deployedSites}
                  selectedSite={selectedSite}
                  onSiteSelect={setSelectedSite}
                />

                <SimpleSearchInput
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={handleUniversalSearch}
                  isLoading={false}
                  placeholder={selectedSiteConfig ? `e.g. "${selectedSiteConfig.searchInputPlaceholder}"` : "Select podcast above"}
                  disabled={!selectedSite}
                />
                
                {selectedSiteConfig && (
                  <p className="text-xs text-muted-foreground italic">
                    {selectedSiteConfig.podcastTagline}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions Card */}
          <Card className="homepage-feature-card p-6">
            <CardContent className="p-0">
              <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <Button
                  onClick={handleRequestPodcastClick}
                  size="sm"
                  className="homepage-cta-primary w-full text-sm font-bold"
                >
                  🗳️ Request podcast
                </Button>
                <Button
                  onClick={handleSelfHostClick}
                  variant="outline"
                  size="sm"
                  className="w-full text-sm border-2"
                >
                  🚀 Self-host
                </Button>
                <a href="#contact" className="block">
                  <Button variant="ghost" size="sm" className="w-full text-sm">
                    📞 Contact & Links
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* How it works */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-8 text-center">
            How it works
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="homepage-feature-card p-6 text-center">
              <CardContent className="p-0">
                <div className="text-4xl mb-4">📝</div>
                <h3 className="text-lg font-bold mb-3">Transcribe</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Open-source Whisper model converts podcast audio to searchable text
                </p>
              </CardContent>
            </Card>

            <Card className="homepage-feature-card p-6 text-center">
              <CardContent className="p-0">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-lg font-bold mb-3">Search</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Find exact moments, quotes, or topics across all episodes instantly
                </p>
              </CardContent>
            </Card>

            <Card className="homepage-feature-card p-6 text-center">
              <CardContent className="p-0">
                <div className="text-4xl mb-4">🎙️</div>
                <h3 className="text-lg font-bold mb-3">Listen</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Jump directly to the relevant moment in the original audio
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Contact Section */}
        <div id="contact" className="text-center p-8 bg-muted/20 rounded-lg">
          <h2 className="text-2xl font-bold mb-6">Get in touch</h2>
          
          {/* Contact Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Button variant="outline" onClick={handleEmailClick} className="p-6 h-auto flex-col gap-2">
              <span className="text-2xl">📧</span>
              <span className="text-sm font-semibold">Email</span>
              <span className="text-xs text-muted-foreground">contact@browse.show</span>
            </Button>
            
            <Button variant="outline" onClick={handleGitHubClick} className="p-6 h-auto flex-col gap-2">
              <span className="text-2xl">🔗</span>
              <span className="text-sm font-semibold">GitHub Repo</span>
              <span className="text-xs text-muted-foreground">browse-dot-show</span>
            </Button>
            
            <Button variant="outline" onClick={handleUserGitHubClick} className="p-6 h-auto flex-col gap-2">
              <span className="text-2xl">👤</span>
              <span className="text-sm font-semibold">Creator</span>
              <span className="text-xs text-muted-foreground">@jackkoppa</span>
            </Button>
            
            <Button variant="outline" onClick={handleBlueskyClick} className="p-6 h-auto flex-col gap-2">
              <span className="text-2xl">🦋</span>
              <span className="text-sm font-semibold">Bluesky</span>
              <span className="text-xs text-muted-foreground">jackpa.dev</span>
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Want a podcast added? Have a feature request? Found a bug? Get in touch!
          </p>
        </div>
      </div>
    </div>
  )
}

export default HomePageV3