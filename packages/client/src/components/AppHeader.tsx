import { AppHeader as SharedAppHeader, AppHeaderConfig } from '@browse-dot-show/blocks'
import { Button, Popover, PopoverTrigger, PopoverContent } from '@browse-dot-show/ui'
import ResponsiveDrawerOrDialog from './ResponsiveDrawerOrDialog'
import { ThemeToggle } from './ThemeToggle'

import { InfoCircledIcon, GearIcon, ArrowRightIcon } from '@radix-ui/react-icons'
import { AudioSourceSelect } from './AudioSourceSelect'
import siteConfig from '../config/site-config'
import { trackEvent } from '@/utils/goatcounter'
import { useEpisodeManifest } from '@/hooks/useEpisodeManifest'

// Utility function to format date as "M/D/YY - H:MM AM/PM"
const formatLastUpdated = (dateString: string): string => {
  const date = new Date(dateString);
  const month = date.getMonth() + 1; // getMonth() returns 0-11
  const day = date.getDate();
  const year = date.getFullYear().toString().slice(-2); // Get last 2 digits
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12; // Convert 0 to 12
  const displayMinutes = minutes.toString().padStart(2, '0');
  
  return `${month}/${day}/${year}, ${displayHours}:${displayMinutes} ${ampm}`;
}

function InfoDrawer() {
  const { episodeManifest } = useEpisodeManifest();
  
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
        <div className="mt-6 mb-2 text-xs flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
          <em>created by <a href="http://jackkoppa.com" className="underline" target="_blank" rel="noopener noreferrer">Jack Koppa</a></em>
          {episodeManifest?.lastUpdated && (
            <>
              <span className="hidden sm:inline text-muted-foreground">|</span>
              <Popover>
                <PopoverTrigger asChild>
                  <span className="text-muted-foreground cursor-pointer">
                    episodes updated @ <span className="underline">{formatLastUpdated(episodeManifest.lastUpdated)}</span>
                  </span>
                </PopoverTrigger>
                <PopoverContent className="max-w-xs p-3">
                  <p className="text-sm">
                    Episodes should always be refreshed at least once-per-week.<br/><br/>If it's been more than 7 days since the episodes were updated, we have a bug! Please{' '}
                    <a 
                      href="https://github.com/jackkoppa/browse-dot-show/issues" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      reach out
                    </a>.
                  </p>
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>
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