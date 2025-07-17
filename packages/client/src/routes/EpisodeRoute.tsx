import { useParams, useSearchParams, useNavigate } from 'react-router'
import { useState, useEffect, useRef } from 'react'
import { EpisodeInManifest } from '@browse-dot-show/types'
import { CaretSortIcon, MinusCircledIcon, Share1Icon, Share2Icon, Cross2Icon, CopyIcon, CheckCircledIcon } from "@radix-ui/react-icons"

import { log } from '../utils/logging';
import { SearchEntry } from '@browse-dot-show/types'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetClose, Badge, Popover, PopoverContent, PopoverTrigger, Button } from '@browse-dot-show/ui'
import AudioPlayer, { AudioPlayerRef } from "../components/AudioPlayer/AudioPlayer"
import FullEpisodeTranscript from '../components/FullEpisodeTranscript'
import PlayTimeLimitDialog from '../components/PlayTimeLimitDialog'
import { S3_HOSTED_FILES_BASE_URL } from '../constants'
import { formatDate } from '@/utils/date'
import { formatMillisecondsToRoundSeconds } from '@/utils/time'
import { useAudioSource } from '@/hooks/useAudioSource'
import { useEpisodeManifest } from '@/hooks/useEpisodeManifest'
import { usePlayTimeLimit } from '@/hooks/usePlayTimeLimit'
import { trackEvent } from '@/utils/goatcounter';
import { encodeFileKey } from '@/utils/encode';

// Add a simple check for whether this is iOS or Mac, vs anything else:
const isIOSOrMac = /iPad|iPhone|iPod/.test(navigator.userAgent);

interface EpisodeDetailsHeaderControlsProps {
  formattedPublishedAt: string | null,
  summary: string | null,
  isDescriptionOpen: boolean,
  setIsDescriptionOpen: (isOpen: boolean) => void,
}

function EpisodeDetailsHeaderControls({
  formattedPublishedAt,
  summary,
  isDescriptionOpen,
  setIsDescriptionOpen,
}: EpisodeDetailsHeaderControlsProps) {
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopySuccess(true)

      trackEvent({
        eventType: 'Share Link Copied',
      });

      // Close the popover after a brief delay to show the success message
      setTimeout(() => {
        setIsShareOpen(false)
      }, 1000)
      setTimeout(() => {
        setCopySuccess(false)
      }, 1200)
    } catch (err) {
      console.error('Failed to copy URL:', err)
    }
  }

  const displayedUrl = location.href.replace(/https?:\/\//i, "")

  return (
    <div className="flex flex-row gap-2 items-center">
      <Badge variant="destructive">{formattedPublishedAt}</Badge>
      <Popover onOpenChange={setIsDescriptionOpen}>
        <PopoverTrigger className="cursor-pointer -mt-1">
          <Badge variant="outline" className="hover:bg-accent hover:text-accent-foreground">
            Summary
            {isDescriptionOpen ? <MinusCircledIcon /> : <CaretSortIcon />}
          </Badge>
        </PopoverTrigger>
        <PopoverContent align="center" side="bottom" className="text-sm"><em>{summary}</em></PopoverContent>
      </Popover>
      <Popover open={isShareOpen} onOpenChange={setIsShareOpen}>
        <PopoverTrigger asChild>
          <Button variant="link" size="icon" className="cursor-pointer">{isIOSOrMac ? <Share2Icon className="size-6" /> : <Share1Icon className="size-6" />}</Button>
        </PopoverTrigger>
        <PopoverContent align="center" side="bottom" className="w-70 p-2 mr-4 font-mono">
          {copySuccess ? (
            <div className="text-green-600 font-bold flex items-center gap-2 justify-center text-md"><CheckCircledIcon /> Share link copied!</div>
          ) : (
            <div className="flex gap-2 items-center text-sm">
              <span className="overflow-hidden whitespace-nowrap">{displayedUrl}</span>
              <Button onClick={handleCopyUrl} variant="default" size="icon" className="cursor-pointer">
                <CopyIcon className="size-4" />
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <SheetClose asChild>
        <Button variant="ghost" size="icon" className="self-end ml-auto cursor-pointer text-foreground"><Cross2Icon className="size-6" /></Button>
      </SheetClose>
    </div>
  )
}

// Need to use JS, because the Sheet component doesn't provide a way to hide the built-in close button.
// We need to hide it, because we provide our own that stays sticky to the top of the sheet.
function hideSheetBuiltInCloseButton() {
  const sheetBuiltInCloseButton: HTMLButtonElement | null = document.querySelector('div[role="dialog"] > button.ring-offset-background');

  if (sheetBuiltInCloseButton) {
    sheetBuiltInCloseButton.style.display = 'none'
  }
}


/**
 * EpisodeRoute component that handles the /episode/:eID route.
 * 
 * Reads:
 * - eID route parameter (episode sequential ID)
 * - start query parameter (start time in milliseconds)
 * 
 * Fetches episode data and creates a mock search result for transcript highlighting.
 * Renders EpisodeDetailsSheet as an overlay while preserving the Sheet component behavior.
 */
export default function EpisodeRoute() {
  const { eID } = useParams<{ eID: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const startTime = searchParams.get('start')
  const startTimeMs = startTime ? Number(startTime) : null
  const { audioSource } = useAudioSource()

  // Use the shared episode manifest hook
  const { episodeManifest, isLoading: isManifestLoading, error: manifestError } = useEpisodeManifest()

  const [episodeData, setEpisodeData] = useState<EpisodeInManifest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false)
  const [currentPlayingTimeMs, setCurrentPlayingTimeMs] = useState<number | null>(null)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [showLimitDialog, setShowLimitDialog] = useState(false)

  const audioPlayerRef = useRef<AudioPlayerRef>(null)
  const playTimeLimit = usePlayTimeLimit()

  useEffect(() => {
    const fetchEpisodeData = async () => {
      if (!eID) {
        setError('Episode ID is required')
        setIsLoading(false)
        return
      }

      // Wait for manifest to be available
      if (isManifestLoading) {
        return
      }

      if (manifestError) {
        setError(`Failed to load episode manifest: ${manifestError}`)
        setIsLoading(false)
        return
      }

      if (!episodeManifest) {
        setError('Episode manifest not available')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        // Find episode by sequential ID (converted to number for comparison)
        const episode = episodeManifest.episodes.find(ep => ep.sequentialId === parseInt(eID, 10))

        if (!episode) {
          throw new Error(`Episode with ID ${eID} not found`)
        }

        setEpisodeData(episode)
      } catch (e: any) {
        log.error('[EpisodeRoute.tsx] Failed to fetch episode data:', e)
        setError(e.message || 'Failed to load episode data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchEpisodeData()
  }, [eID, episodeManifest, isManifestLoading, manifestError])

  useEffect(() => {
    hideSheetBuiltInCloseButton()
  }, [])

  // Handle sheet close - navigate back to home while preserving search query params
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      const currentParams = new URLSearchParams(searchParams)
      // Remove episode-specific params
      currentParams.delete('start')

      // Navigate back to home with preserved search params
      const queryString = currentParams.toString()
      navigate(queryString ? `/?${queryString}` : '/')
    }
  }

  // Function to play alert sound with dynamic import
  const playAlertSound = async () => {
    try {
      // Dynamically import the audio file
      const audioModule = await import('/assets/simple-alert.mp3?url');
      const audioUrl = audioModule.default;
      
      // Create and play the audio
      const audio = new Audio(audioUrl);
      audio.volume = 0.5; // Half volume
      await audio.play();
    } catch (error) {
      console.warn('Failed to play alert sound:', error);
    }
  };

  const handleListen = (currentTimeMs: number) => {
    // Only track current playing time if user has interacted with the audio
    if (hasUserInteracted) {
      setCurrentPlayingTimeMs(currentTimeMs);
    }

    // Check if limit exceeded during playback
    if (episodeData && hasUserInteracted) {
      const episodeId = episodeData.sequentialId.toString();
      if (playTimeLimit.checkAndHandleLimit(episodeId)) {
        // Limit just exceeded, pause the audio and show dialog
        if (audioPlayerRef.current?.pause) {
          audioPlayerRef.current.pause();
        }
        setShowLimitDialog(true);
        // Play alert sound at half volume
        playAlertSound();

        trackEvent({
          eventType: 'Play Time Limit Dialog Opened',
        });
      }
    }
  }

  const handlePlay = () => {
    if (!episodeData) return;
    
    const episodeId = episodeData.sequentialId.toString();
    
    // Check if limit is already exceeded
    if (playTimeLimit.isLimitExceeded(episodeId)) {
      setShowLimitDialog(true);
      return;
    }

    // Mark that user has interacted with the audio
    setHasUserInteracted(true);

    // Track play time
    playTimeLimit.onPlay(episodeId);

    trackEvent({
      eventType: 'Play Button Clicked',
    });
  }

  const handlePause = () => {
    if (!episodeData) return;
    
    const episodeId = episodeData.sequentialId.toString();
    playTimeLimit.onPause(episodeId);
  }

  const handleSeek = () => {
    if (!episodeData) return;
    
    const episodeId = episodeData.sequentialId.toString();
    playTimeLimit.onSeek(episodeId);
  }

  const handleEntryClick = (entry: SearchEntry) => {
    // Mark that user has interacted with the audio
    setHasUserInteracted(true);
    // Seek the audio player to the entry's start time
    if (audioPlayerRef.current) {
      audioPlayerRef.current.seekTo(entry.startTimeMs);
    }
  }

  // Show loading state
  if (isLoading) {
    return (
      <Sheet open={true} onOpenChange={handleOpenChange}>
        <SheetContent className="font-mono overflow-y-auto w-[350px]">
          <SheetHeader>
            <SheetTitle>Loading Episode</SheetTitle>
            <SheetDescription>
              Please wait while the episode data is being loaded.
            </SheetDescription>
          </SheetHeader>
          <div className="flex items-center justify-center h-32">
            <p>Loading episode...</p>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // Show error state
  if (error || !episodeData) {
    return (
      <Sheet open={true} onOpenChange={handleOpenChange}>
        <SheetContent className="font-mono overflow-y-auto w-[350px]">
          <SheetHeader>
            <SheetTitle>Error Loading Episode</SheetTitle>
            <SheetDescription>
              {error || 'Episode not found'}. Please try again or go back to the home page.
            </SheetDescription>
          </SheetHeader>
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <p className="text-red-600 mb-2">Error loading episode</p>
              <p className="text-sm text-muted-foreground">{error || 'Episode not found'}</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const { title, summary, publishedAt, originalAudioURL, podcastId } = episodeData
  const formattedPublishedAt = publishedAt ? formatDate(publishedAt) : null

  let baseAudioUrl = ''
  if (audioSource === 'rssFeedURL') {
    // Use the .mp3 file from the RSS feed
    baseAudioUrl = originalAudioURL
  } else {
    baseAudioUrl = `${S3_HOSTED_FILES_BASE_URL}audio/${episodeData.podcastId}/${encodeFileKey(episodeData.fileKey)}.mp3`
  }

  /** 
   * Create audio URL with start time if available - use rounded seconds
   * https://stackoverflow.com/a/55583936/4167438
   */
  const audioUrlToLoad = startTimeMs ? `${baseAudioUrl}#t=${formatMillisecondsToRoundSeconds(startTimeMs)}` : baseAudioUrl

  return (
    <Sheet open={true} onOpenChange={handleOpenChange}>
      <SheetContent className="font-mono overflow-y-auto w-[90%] md:w-140 lg:w-180 max-w-[90%] md:max-w-140 lg:max-w-180">
        <SheetHeader className="sticky top-0 bg-gradient-to-b from-background from-85% to-transparent pb-4">
          <EpisodeDetailsHeaderControls
            formattedPublishedAt={formattedPublishedAt}
            summary={summary}
            isDescriptionOpen={isDescriptionOpen}
            setIsDescriptionOpen={setIsDescriptionOpen}
          />
          <SheetTitle className="text-lg/6 font-semibold mt-2 mb-2">
            {title}
          </SheetTitle>
          <div>
            <AudioPlayer
              ref={audioPlayerRef}
              src={audioUrlToLoad}
              className="mb-4"
              onListen={handleListen}
              onPlay={handlePlay}
              onPause={handlePause}
              onSeek={handleSeek}
              onLimitExceededClick={() => setShowLimitDialog(true)}
              isLimitExceeded={playTimeLimit.isLimitExceeded(episodeData.sequentialId.toString())}
            />
          </div>
          <SheetDescription className="sr-only">
            Episode audio player and transcript for {title}. Published on {formattedPublishedAt}.
          </SheetDescription>
        </SheetHeader>
        <FullEpisodeTranscript
          episodeData={episodeData}
          startTimeMs={startTimeMs}
          currentPlayingTimeMs={hasUserInteracted ? currentPlayingTimeMs : null}
          onEntryClick={handleEntryClick}
        />
      </SheetContent>
      
      <PlayTimeLimitDialog
        isOpen={showLimitDialog}
        onOpenChange={setShowLimitDialog}
        episodeTitle={title}
        formattedPublishedAt={formattedPublishedAt}
        podcastId={podcastId}
      />
    </Sheet>
  )
} 