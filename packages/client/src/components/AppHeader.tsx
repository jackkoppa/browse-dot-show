import { AppHeader as SharedAppHeader, AppHeaderConfig } from '@browse-dot-show/blocks'
import { Button } from '@browse-dot-show/ui'
import ResponsiveDrawerOrDialog from './ResponsiveDrawerOrDialog'
import { ThemeToggle } from './ThemeToggle'

import { InfoCircledIcon, GearIcon, ArrowRightIcon } from '@radix-ui/react-icons'
import { AudioSourceSelect } from './AudioSourceSelect'
import siteConfig from '../config/site-config'
import { trackEvent } from '@/utils/goatcounter'

function InfoDrawer() {
  const childTrigger = (
    <Button variant="ghost" size="icon">
      <InfoCircledIcon className="size-6" />
    </Button>
  )

  const handleContactClick = () => {
    trackEvent({
      eventType: 'Contact Button Clicked',
    });
    window.open('https://browse.show/contact', '_blank');
  }

  const handleBrowseShowClick = () => {
    trackEvent({
      eventType: 'browse.show Info Link Clicked',
    });
  }

  return (
    <ResponsiveDrawerOrDialog
      childTrigger={childTrigger}
      title="About"
      description="About the application"
      descriptionHidden={true}
    >
      <div className="text-sm xs:text-base">
        <p className="mb-2">
          Find your favorite moments & quotes from the{' '}
          <strong>
            <a href={siteConfig.appHeader.taglinePrimaryPodcastExternalURL} className="underline" target="_blank" rel="noopener noreferrer">
              {siteConfig.appHeader.taglinePrimaryPodcastName}
            </a>
          </strong>
          {' '}podcast.
        </p>
        <br/>
        <p>Powered by <strong><a href="https://browse.show" onClick={handleBrowseShowClick} className="underline" target="_blank">browse.show</a></strong> - transcribe & search any podcast.</p>
        <p>Open source, fully customizable, and free to use.</p>
        <br/>
        <p>Want a new podcast to be searchable? Have a feature request or a bug report? Let me know!</p>
        <Button variant="default" size="lg" className="mt-4 w-full" onClick={handleContactClick}>
          browse.show/contact <ArrowRightIcon className="size-4" />
        </Button>
        <p className="mt-6 mb-2 text-sm">
          <em>created by <a href="http://jackkoppa.com" className="underline" target="_blank" rel="noopener noreferrer">Jack Koppa</a></em>
        </p>
      </div>
    </ResponsiveDrawerOrDialog>
  )
}

function SettingsDrawer() {
  const childTrigger = (
    <Button variant="ghost" size="icon">
      <GearIcon className="size-6" />
    </Button>
  )

  return (
    <ResponsiveDrawerOrDialog
      childTrigger={childTrigger}
      title="Settings"
      description="App settings and information"
      descriptionHidden={true}
    >
      <div className="w-full pt-4">
        <div className="flex gap-2 text-sm mb-10">
          Theme <ThemeToggle />
        </div>
        <div className="flex flex-col gap-3 text-sm mb-10">
          <div className="flex gap-3">
            <span>Audio<br />Source</span>
            <AudioSourceSelect />
          </div>
          <span className="text-[12px]"><strong>Transcribed File</strong> is recommended, to best align transcription with the podcast audio timing.</span>
        </div>
      </div>
    </ResponsiveDrawerOrDialog>
  )
}

interface AppHeaderProps {
  scrolled: boolean;
}

export default function AppHeader({ scrolled }: AppHeaderProps) {
  const config: AppHeaderConfig = {
    title: {
      prefix: siteConfig.appHeader.includeTitlePrefix ? '[browse.show]' : undefined,
      main: siteConfig.appHeader.primaryTitle
    },
    tagline: {
      text: 'Search the',
      linkText: siteConfig.appHeader.taglinePrimaryPodcastName,
      linkUrl: siteConfig.appHeader.taglinePrimaryPodcastExternalURL,
      suffix: siteConfig.appHeader.taglineSuffix
    },
    actions: (
      <>
        <InfoDrawer />
        <SettingsDrawer />
      </>
    )
  };

  return <SharedAppHeader scrolled={scrolled} config={config} />;
} 