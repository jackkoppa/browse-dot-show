import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { AppHeader } from '@browse-dot-show/blocks'
import ContactLinks from '../components/ContactLinks'
import HeroSearch from '../components/HeroSearch'
import PodcastGrid from '../components/PodcastGrid'
import { ThemeToggle } from '../components/ThemeToggle'
import Waveform from '../components/Waveform'
import { deployedSites } from '../config/deployed-sites'
import { LINKS } from '../constants'
import { useRevealOnScroll } from '../hooks/useRevealOnScroll'
import { trackEvent } from '../utils/goatcounter'

import '../App.css'

const shuffle = <T,>(items: T[]) => {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

const inlineLinkClass = 'font-bold border-b-2 border-primary hover:bg-primary hover:text-primary-foreground transition-colors'

/**
 * Homepage for browse.show: search any of the deployed sites, or browse them.
 */
function HomePage() {
  // The hero cycles through the sites' example queries in a random order
  const [examples] = useState(() => shuffle(deployedSites))
  const revealRef = useRevealOnScroll<HTMLDivElement>()

  return (
    <div className="bg-background text-foreground min-h-screen flex flex-col" ref={revealRef}>
      <div className="homepage-header">
        <AppHeader
          scrolled={false}
          config={{
            title: { main: '[browse.show]' },
            tagline: { text: 'transcribe & search any podcast' },
            rightImageAndThemeToggle: {
              themeToggle: <ThemeToggle />,
              image: {
                lowRes: '/assets/favicon-96x96.png',
                highRes: '/assets/web-app-manifest-512x512.png',
                altText: 'Browse.show logo',
              },
            },
          }}
        />
      </div>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-28 xs:pt-32 sm:pt-40 pb-20">
        <section className="bds-rise">
          <HeroSearch sites={deployedSites} examples={examples} />
        </section>

        <section className="mt-14">
          <h2 className="bds-reveal mb-5 flex items-baseline justify-between gap-4 border-b-2 border-foreground pb-2 text-base">
            <span className="font-bold">Podcasts</span>
            <span className="text-xs font-normal text-muted-foreground">{deployedSites.length} so far</span>
          </h2>
          <PodcastGrid sites={deployedSites} />
        </section>

        <section className="bds-reveal mt-20">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-sm">
            <Waveform className="text-primary" />
            <span className="font-bold">audio</span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="font-bold">text</span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="font-bold">the moment you were looking for</span>
          </div>
          <p className="mt-4 max-w-xl text-sm text-muted-foreground">
            Episodes are transcribed with Whisper, an open-source speech-to-text model, and indexed so you
            can search all of them at once. The code is on{' '}
            <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" className="text-foreground bds-underline">GitHub</a>.
          </p>
        </section>

        <section className="bds-reveal mt-12">
          <p>
            Want another podcast?{' '}
            <a
              href={LINKS.requestPodcast}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent({ eventType: 'Request Podcast Button Clicked - homepage' })}
              className={inlineLinkClass}
            >
              Request it
            </a>
            , or{' '}
            <a
              href={LINKS.selfHost}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent({ eventType: 'Self-Host Guide Button Clicked' })}
              className={inlineLinkClass}
            >
              host your own
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="border-t-2 border-foreground bg-muted">
        <ContactLinks className="max-w-3xl mx-auto px-4 py-6 flex flex-wrap gap-x-6 gap-y-2 text-sm" />
      </footer>
    </div>
  )
}

export default HomePage
