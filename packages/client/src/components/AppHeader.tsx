import { AppHeader as SharedAppHeader, AppHeaderConfig } from '@browse-dot-show/blocks'
import { Button } from '@browse-dot-show/ui'
import ResponsiveDrawerOrDialog from './ResponsiveDrawerOrDialog'
import { ThemeToggle } from './ThemeToggle'

import BlueskyLogo from '../icons/bluesky-logo.svg'

import { InfoCircledIcon, GitHubLogoIcon, GearIcon } from '@radix-ui/react-icons'
import { AudioSourceSelect } from './AudioSourceSelect'
import siteConfig from '../config/site-config'

function InfoDrawer() {
  const childTrigger = (
    <Button variant="ghost" size="icon">
      <InfoCircledIcon className="size-6" />
    </Button>
  )

  // Get the first active podcast for the main link
  const activePodcasts = Object.entries(siteConfig.podcastLinks).filter(([_, podcast]) => podcast.status === 'active');
  const primaryPodcast = activePodcasts.length > 0 ? activePodcasts[0] : null;

  return (
    <ResponsiveDrawerOrDialog
      childTrigger={childTrigger}
      title="About"
      description="About the application"
      descriptionHidden={true}
    >
      <div>
        <p className="mb-2">
          Find your favorite moments & quotes from the{' '}
          {primaryPodcast ? (
            <strong>
              <a href={primaryPodcast[1].url} className="underline" target="_blank" rel="noopener noreferrer">
                {primaryPodcast[1].title}
              </a>
            </strong>
          ) : (
            <strong>podcast</strong>
          )}{' '}
          podcast.
        </p>
        <p className="mb-2">
          <span className="font-bold italic">
            {siteConfig.appHeader.includeTitlePrefix ? <span>[browse.show] </span> : null}
            <span>{siteConfig.appHeader.primaryTitle}</span>
          </span>{' '}
          transcribes and indexes all episodes. Select a search result to jump to that point in the audio.
        </p>
        <p>
          The code is fully open source, and available on <a href="https://github.com/jackkoppa/browse-dot-show" className="underline" target="_blank" rel="noopener noreferrer">GitHub</a>.
        </p>
        <br />
        <p className="mb-2">Something not working? Suggestion for a new feature? Let me know.</p>
        <p>
          <span><GitHubLogoIcon className="size-4 inline-block mr-1" /> <a href="https://github.com/jackkoppa/browse-dot-show/issues/new" className="underline" target="_blank" rel="noopener noreferrer">GitHub</a></span>
          <span className="mx-6">|</span>
          <span><img src={BlueskyLogo} alt="Bluesky Logo" className="size-4 inline-block mr-1" /> <a href="https://bsky.app/profile/jackkoppa.dev" className="underline" target="_blank" rel="noopener noreferrer">Bluesky</a></span>
        </p>
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