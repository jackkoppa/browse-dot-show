import { useState, useEffect, useRef } from 'react'
import { AppHeader } from '@browse-dot-show/blocks'
import { Button, Card, CardContent } from '@browse-dot-show/ui'
import { GitHubLogoIcon, EnvelopeClosedIcon } from '@radix-ui/react-icons'
import SimpleSearchInput from '../components/SimpleSearchInput'
import SiteSelector from '../components/SiteSelector'
import { ThemeToggle } from '../components/ThemeToggle'
import { trackEvent } from '../utils/goatcounter'
import deployedSitesConfig from '../../deployed-sites.config.jsonc'
import { Site } from '../types/search'

import '../App.css'

// Bluesky Logo Component
const BlueskyIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="15"
    height="15"
    viewBox="0 0 600 530"
    fill="currentColor"
    className={className}
  >
    <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z" />
  </svg>
)

// Contact Link Component
type IconType = 'github' | 'bluesky' | 'email'

interface ContactLinkProps {
  href: string
  iconType: IconType
  title: string
  subtitle: string
  target?: string
  rel?: string
}

const ContactLink = ({ href, iconType, title, subtitle, target, rel }: ContactLinkProps) => {
  const iconClassName = "w-6 h-6 text-muted-foreground group-hover:text-background transition-colors"

  const renderIcon = () => {
    switch (iconType) {
      case 'github':
        return <GitHubLogoIcon className={iconClassName} />
      case 'bluesky':
        return <BlueskyIcon className={iconClassName} />
      case 'email':
        return <EnvelopeClosedIcon className={iconClassName} />
      default:
        return null
    }
  }

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className="flex flex-col items-center gap-3 px-6 py-2 xs:py-4 sm:py-6 rounded-lg border border-border bg-card hover:bg-accent transition-colors duration-200 group"
    >
      {renderIcon()}
      <div className="text-center">
        <div className="font-medium text-foreground group-hover:text-secondary transition-colors">{title}</div>
        <div className="text-xs text-muted-foreground mt-1 group-hover:text-background">{subtitle}</div>
      </div>
    </a>
  )
}

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
  const [selectedSite, setSelectedSite] = useState<Site | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)


  // TODO: Consider re-enabling scroll resizing if needed - for now, it just risks causing frequent re-renders
  // /**
  //  * Handle scroll detection for header visual effects
  //  */
  // const [scrolled, setScrolled] = useState(false)
  // useEffect(() => {
  //   const handleScroll = () => {
  //     const isScrolled = window.scrollY > 10
  //     if (isScrolled !== scrolled) {
  //       setScrolled(isScrolled)
  //     }
  //   }

  //   window.addEventListener('scroll', handleScroll)
  //   return () => window.removeEventListener('scroll', handleScroll)
  // }, [scrolled])

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


    // Track the search event
    trackEvent({
      eventType: `Universal Search: '${trimmedQuery}' on [${selectedSite}]`,
      eventName: `Universal Search Performed`,
    })

    // Redirect to the selected site with the search query
    const targetUrl = `https://${selectedSite.domain}/?q=${encodeURIComponent(trimmedQuery)}`
    window.open(targetUrl, '_self')
  }

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
        // scrolled={scrolled}
        scrolled={false} // Can consider re-enabling scroll resizing if needed - for now, it just risks causing frequent re-renders
        config={{
          title: {
            main: '[browse.show]'
          },
          tagline: {
            text: 'transcribe & search any podcast'
          },
          rightImageAndThemeToggle: {
            themeToggle: <ThemeToggle />,
            image: {
              lowRes: '/assets/favicon-96x96.png',
              highRes: '/assets/web-app-manifest-512x512.png',
              altText: 'Browse.show logo'
            }
          }
        }}
      />

      <div className="max-w-3xl mx-auto p-4 pt-22 xs:pt-28 sm:pt-34 transition-all">
        {/* Hero Section */}
        <div className="mb-8 max-w-2xl mx-auto">
          <div className="text-center sm:text-right">
            <p className="text-md sm:text-lg text-muted-foreground leading-relaxed block">
              Find exact moments in your favorite podcasts. <br className="hidden sm:block" />Jump to that point & start listening.<br /><br />
              Currently available for select shows, <br className="hidden sm:block" />with more added by request.
            </p>
          </div>
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
                placeholder={selectedSite ? `e.g. "${selectedSite.searchInputPlaceholder}"` : "Select podcast above"}
                disabled={!selectedSite}
              />
            </div>
            {/* Show tagline when a site is selected */}
            {selectedSite && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground italic">
                  {selectedSite.podcastTagline}
                </p>
              </div>
            )}
          </div>
        </div>
        {/* CTA Section */}
        <div className="text-center mb-20">
          <div className="mb-10">
            <h2 className="text-xl md:text-2xl font-bold mb-4 text-foreground">
              Want your favorite podcast searchable?
            </h2>
            {/* Mobile CTA on XS only - to make sure CTA is above the fold */}
            <Button
              onClick={handleRequestPodcastClick}
              size="lg"
              className="homepage-cta-primary w-full sm:w-auto px-8 py-3 mx-auto text-lg font-bold flex xs:hidden justify-center mt-6 mb-8"
            >
              🗳️ Request a podcast
            </Button>
            <p className="text-base md:text-lg text-muted-foreground mb-6 max-w-2xl mx-auto leading-relaxed">
              Vote for podcasts you'd like to see added, or set up your own instance
              to search any podcast you want.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {/* Desktop CTA on SM+ only */}
            <Button
              onClick={handleRequestPodcastClick}
              size="lg"
              className="homepage-cta-primary w-full sm:w-auto px-8 py-3 text-lg font-bold hidden xs:flex"
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
        <div className="mb-16 max-w-2xl mx-auto">
          <h2 className="text-xl md:text-2xl font-bold mb-8 text-center text-foreground">
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


      {/* Contact Section */}
      <div className="mb-16 p-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl md:text-2xl font-bold mb-6 text-center text-foreground">
            Contact
          </h2>
          <p className="text-center text-muted-foreground mb-8 leading-relaxed">
            Reach out with any questions or feedback!
          </p>

          <div className="grid sm:grid-cols-3 gap-4">
            <ContactLink
              href="https://github.com/jackkoppa/browse-dot-show"
              target="_blank"
              rel="noopener noreferrer"
              iconType="github"
              title="GitHub"
              subtitle="jackkoppa/browse-dot-show"
            />

            <ContactLink
              href="https://bsky.app/profile/jackkoppa.dev"
              target="_blank"
              rel="noopener noreferrer"
              iconType="bluesky"
              title="Bluesky"
              subtitle="@jackkoppa.dev"
            />

            <ContactLink
              href="mailto:contact@browse.show"
              iconType="email"
              title="Email"
              subtitle="contact@browse.show"
            />
          </div>
        </div>
      </div>


    </div>
  )
}

export default HomePage 