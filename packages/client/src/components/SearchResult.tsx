import React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiSearchResultHit, EpisodeInManifest } from '@browse-dot-show/types'; // Import the new type
import {
  Card,
  CardContent,
  CardFooter,
} from "@browse-dot-show/ui";
import { Badge } from "@browse-dot-show/ui";

import { formatDate } from '@/utils/date';
import { formatMillisecondsToMMSS } from '@/utils/time';
import HighlightedText from './HighlightedText';
import PodcastCover from './PodcastCover';
import { trackEvent } from '@/utils/goatcounter';
import { multiFeedPodcast } from '@/utils/podcast';
import siteConfig from '@/config/site-config';

export interface SearchResultProps {
  result: ApiSearchResultHit;
  episodeData?: EpisodeInManifest;
  isManifestLoading: boolean;
  showManifestError: boolean;
  /** Position in the list, to stagger the results' entrance */
  index?: number;
}

const SearchResult: React.FC<SearchResultProps> = ({ result, episodeData, isManifestLoading, showManifestError, index = 0 }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const formattedStartTime = formatMillisecondsToMMSS(result.startTimeMs);
  const formattedEndTime = formatMillisecondsToMMSS(result.endTimeMs);
  const formattedDate = episodeData?.publishedAt ? formatDate(episodeData.publishedAt) : null;
  const podcast = episodeData ? multiFeedPodcast(episodeData.podcastId, siteConfig.podcastLinks) : undefined;
  const isMultiFeedSite = Object.keys(siteConfig.podcastLinks).length > 1;

  const handleLoadHere = () => {
    if (!episodeData) return;

    // Preserve all current search query parameters
    const currentParams = new URLSearchParams(searchParams);

    // Add episode-specific parameters
    currentParams.set('start', result.startTimeMs.toString());

    // Navigate to episode route with all parameters
    const queryString = currentParams.toString();

    trackEvent({
      eventType: 'Result Clicked',
    });

    navigate(`/episode/${episodeData.sequentialId}${queryString ? `?${queryString}` : ''}`);
  };

  // Determine what to show in the footer
  const showEpisodeMetadata = Boolean(episodeData);
  const showSkeletonLoaders = !episodeData && isManifestLoading && !showManifestError;
  const shouldBeClickable = Boolean(episodeData);

  return (
    <Card
      // Enters with a short stagger (capped, so long pages don't wait), and lifts on hover like the homepage's tiles
      className={`bds-rise mb-4 border-foreground border-2 gap-2 rounded-none ${shouldBeClickable ? 'bds-lift cursor-pointer hover:bg-muted dark:hover:bg-dark-mode-muted-highlight' : ''}`}
      style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
      onClick={shouldBeClickable ? handleLoadHere : undefined}
    >
      <CardContent>
        <HighlightedText className="text-sm" text={result.text} searchStringToHighlight={searchParams.get('q') || ''} />
      </CardContent>
      <CardFooter className="block">
        {showEpisodeMetadata && (
          <>
            <div className="flex flex-col mt-2">
              <div className="flex items-center gap-2">
                {formattedDate && <Badge variant="destructive" className="mr-2">{formattedDate}</Badge>}
                <Badge variant="outline">{formattedStartTime} - {formattedEndTime}</Badge>
              </div>
              {/* On multi-feed sites, the podcast's cover and title, as in the episode panel's header */}
              <div className="flex items-start gap-2 mt-2">
                {podcast?.coverImageUrl && <PodcastCover src={podcast.coverImageUrl} />}
                <div className="min-w-0 flex-1">
                  {podcast && <div className="text-xs font-semibold text-muted-foreground pb-0.5">{podcast.title}</div>}
                  <div className="text-xs text-muted-foreground italic">{episodeData?.title || `Episode ${result.sequentialEpisodeIdAsString}`}</div>
                </div>
              </div>
            </div>
          </>
        )}
        {showSkeletonLoaders && (
          <>
            <div className="flex flex-col mt-2">
              {/* Badges row skeleton */}
              <div className="flex items-center gap-2">
                <div className="h-4 w-20 bg-muted-foreground/20 motion-safe:animate-pulse mr-2"></div> {/* Date badge skeleton */}
                <div className="h-4 w-18 bg-muted-foreground/20 motion-safe:animate-pulse"></div> {/* Time range badge skeleton */}
              </div>
              {isMultiFeedSite ? (
                // Podcast cover, podcast title and episode title skeletons, the same height as the loaded row
                <div className="flex items-start gap-2 mt-2">
                  <div className="size-8 shrink-0 bg-muted-foreground/20 motion-safe:animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-2 w-2/5 bg-muted-foreground/20 motion-safe:animate-pulse mt-1"></div>
                    <div className="h-2 w-4/5 bg-muted-foreground/20 motion-safe:animate-pulse mt-2.5"></div>
                  </div>
                </div>
              ) : (
                <div className="h-2 w-4/5 bg-muted-foreground/20 motion-safe:animate-pulse mt-2"></div> /* Episode title skeleton (text-xs height) */
              )}
            </div>
          </>
        )}
      </CardFooter>
    </Card>
  );
};

export default SearchResult; 